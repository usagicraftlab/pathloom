import { insertShapes } from "./shape-library.js";
import { sketchCurveParameters } from "./sketch/model.js";
import {
  createCadDocument,
  clone,
  id,
  sha256,
  canonical,
  references,
  topologicalFeatures,
  validateCadDocument,
} from "./document.js";
import {
  markDirty,
  applyFeatureEdit,
  reselectReference,
  suppressFeature,
} from "./history.js";
import { createTransactions } from "./transactions.js";
import { resolveSubshape } from "./references.js";
import { diagnostic } from "./diagnostics.js";
import {
  differenceOutputs,
  validateDifferenceTargets,
  replacementRefs,
  reconcileDifferenceTools,
} from "./difference.js";
import {
  isSplit,
  splitSlots,
  applySplitBodies,
  restoreSplitInputs,
} from "./split-bindings.js";
const checkpoint = (doc) => {
  const { assets, ...rest } = doc;
  return { ...clone(rest), assets };
};
export class CadStore {
  constructor(native, { changed = () => {} } = {}) {
    this.native = native;
    this.document = createCadDocument();
    this.changed = changed;
    this.handles = new Map();
    this.epoch = 1;
    this.transactions = createTransactions(
      () => this.document,
      (d) => {
        this.document = d;
        this.changed();
        this.recompute();
      },
      () => {
        this.epoch++;
        this.native.cancelAll();
        this.handles.clear();
      },
    );
    this.recomputing = null;
    this.queued = false;
  }
  notify() {
    this.changed(this.document);
  }
  cancelJobs() {
    this.epoch++;
    this.queued = false;
    const f = this.getFeature(this.activeFeature);
    if (f && ["running", "dirty"].includes(f.status)) {
      f.status = "cancelled";
      f.diagnostics = [
        diagnostic(
          "CAD_CANCELLED",
          "計算を中断しました。設定と前回の形状は保持しています。",
          f.id,
          ["retry"],
        ),
      ];
    }
    this.native.cancelAll();
    this.handles.clear();
    this.notify();
  }
  getEntity(entityId) {
    return this.document.entities.find((e) => e.id === entityId);
  }
  getFeature(featureId) {
    return this.document.features.find((f) => f.id === featureId);
  }
  async handle(entity) {
    const document = this.document,
      epoch = this.epoch;
    await this.native.start();
    if (document !== this.document || epoch !== this.epoch)
      throw new Error("CAD_CANCELLED");
    const assetHash = entity.geometry.assetHash;
    let entry = this.handles.get(assetHash);
    if (entry?.epoch === this.native.runtimeEpoch) return entry.value;
    const asset = this.document.assets[assetHash];
    if (!asset?.data)
      throw new Error(
        "CAD_ASSET_MISSING: 正本を取得できません。保存または再計算で回復してください。",
      );
    const result = await this.native.importAsset(assetHash, asset);
    if (document !== this.document || epoch !== this.epoch) {
      this.native.release([result.handle]);
      throw new Error("CAD_CANCELLED");
    }
    this.handles.set(assetHash, {
      value: result,
      epoch: this.native.runtimeEpoch,
    });
    entity.displayCache = result.summary;
    return result;
  }
  async resolve(inputs, { split = false } = {}) {
    const prepared = {},
      inputHashes = [];
    for (const [key, refs] of Object.entries(inputs)) {
      prepared[key] = [];
      for (const ref of Array.isArray(refs) ? refs : [refs]) {
        const e = this.getEntity(ref.entityId);
        const f = e && this.getFeature(e.producer.featureId);
        if (
          ref.unresolved ||
          !e ||
          !["valid", "warning", "empty"].includes(f?.status)
        ) {
          const d = diagnostic(
            "CAD_UPSTREAM_BLOCKED",
            "上流の形状が未解決です。",
            null,
            ["openCauseFeature"],
            f ? [f.id] : [],
          );
          throw Object.assign(new Error(d.message), { diagnostic: d });
        }
        const inputHash = e.geometry.assetHash;
        const native = await this.handle(e);
        let selector = null;
        if (ref.kind) {
          const resolved = resolveSubshape(ref, e);
          if (resolved.status !== "ready")
            throw Object.assign(
              new Error(
                "対象の面・edgeを一意に特定できません。対象を選び直してください。",
              ),
              {
                diagnostic: diagnostic(
                  resolved.status === "ambiguous"
                    ? "CAD_REFERENCE_AMBIGUOUS"
                    : "CAD_REFERENCE_MISSING",
                  "対象の面・edgeを選び直してください。",
                  null,
                  ["reselectReference"],
                ),
              },
            );
          selector = resolved.selector;
        }
        prepared[key].push({
          handle: native.handle,
          geometryHash: native.geometryHash,
          selector,
          ...(split && key === "targets" ? { sourceKey: e.id } : {}),
        });
        inputHashes.push(inputHash);
      }
    }
    return { prepared, inputHashes };
  }
  async preview(session) {
    const document = this.document,
      epoch = this.epoch,
      sequence = ++session.previewSequence;
    const current = () =>
      document === this.document &&
      epoch === this.epoch &&
      sequence === session.previewSequence &&
      session.state !== "cancelled";
    const { operationForSession } = await import("./commands/session.js");
    if (!current()) return null;
    const operation = operationForSession(session);
    if (operation.operation.id === "solid.difference")
      validateDifferenceTargets(this.document, operation.inputs);
    const { prepared, inputHashes } = await this.resolve(operation.inputs, {
      split: isSplit(operation.operation.id),
    });
    if (!current()) return null;
    const requestedHash = await sha256({
      operation: operation.operation,
      parameters: operation.parameters,
      inputs: inputHashes,
      tolerances: {
        ...this.document.tolerances,
        ...session.toleranceOverrides,
      },
    });
    if (!current()) return null;
    const runtimeEpoch = this.native.runtimeEpoch;
    session.state = "previewing";
    const result = await this.native.evaluate({
      documentId: this.document.id,
      documentRevision: this.document.documentRevision,
      sessionId: session.id,
      featureId: session.featureId || session.id,
      featureRevision: 0,
      previewSequence: sequence,
      requestedHash,
      intent: "preview",
      operation: operation.operation,
      parameters: operation.parameters,
      inputs: prepared,
      tolerances: {
        ...this.document.tolerances,
        ...session.toleranceOverrides,
      },
    });
    if (
      !current() ||
      runtimeEpoch !== this.native.runtimeEpoch ||
      canonical(inputHashes) !==
        canonical(
          references(operation.inputs).map(
            (ref) => this.getEntity(ref.entityId)?.geometry.assetHash,
          ),
        ) ||
      references(operation.inputs).some(
        (ref) =>
          !["valid", "warning", "empty"].includes(
            this.getFeature(this.getEntity(ref.entityId)?.producer.featureId)
              ?.status,
          ),
      )
    ) {
      this.native.release(result.outputs.map((o) => o.handle));
      return null;
    }
    session.result = result;
    session.diagnostics = result.diagnostics;
    session.state = result.status === "failed" ? "repairing" : "previewing";
    this.notify();
    return result;
  }
  async add(session) {
    const document = this.document,
      epoch = this.epoch;
    const before = checkpoint(this.document),
      { operationForSession } = await import("./commands/session.js");
    if (document !== this.document || epoch !== this.epoch) return false;
    const operation = operationForSession(session);
    session.state = "committing";
    const featureId = id(),
      bodyId = id();
    const f = {
      id: featureId,
      operation: operation.operation,
      command: {
        id: session.command.id,
        version: session.command.version,
        mode: session.drawingMode || session.command.mode,
        inputs: clone(session.inputValues || {}),
      },
      name: session.command.displayName,
      inputs: operation.inputs,
      parameters: operation.parameters,
      toleranceOverrides: clone(session.toleranceOverrides || {}),
      resultPolicy: session.command.resultPolicy,
      outputSlots: [{ key: "result", entityId: id(), bodyId }],
      featureRevision: 1,
      requestedHash: null,
      resultHash: null,
      status: "dirty",
      diagnostics: [],
      lastValid: null,
    };
    const sourceRefs = references(f.inputs).filter((r) => !r.kind);
    if (f.resultPolicy === "replace" && sourceRefs.length === 1) {
      const source = this.getEntity(sourceRefs[0].entityId);
      if (source) f.outputSlots[0].bodyId = source.bodyId;
    }
    this.document.features.push(f);
    this.document.documentRevision++;
    try {
      await this.recompute();
    } catch (error) {
      if (document !== this.document || epoch !== this.epoch) return false;
      f.status = "failed";
      f.diagnostics = [
        diagnostic("CAD_RUNTIME_MISSING", error.message, f.id, [
          "restartRuntime",
        ]),
      ];
    }
    if (
      document !== this.document ||
      epoch !== this.epoch ||
      this.getFeature(f.id) !== f
    )
      return false;
    if (!["valid", "warning", "empty"].includes(f.status)) {
      const failure = clone(f);
      // A failed new feature must not roll back unrelated edits made while the
      // kernel was busy. The exact result is adopted only after validation.
      this.document.features = this.document.features.filter(
        (feature) => feature !== f,
      );
      this.document.documentRevision++;
      session.state = "repairing";
      session.diagnostics = failure.diagnostics;
      session.result = null;
      this.document.draftSessions = [
        ...this.document.draftSessions.filter((d) => d.id !== session.id),
        clone(session),
      ];
      this.notify();
      return false;
    }
    this.document.commandDefinitions.some(
      (d) =>
        d.id === session.command.id && d.version === session.command.version,
    ) || this.document.commandDefinitions.push(clone(session.command));
    this.document.draftSessions = this.document.draftSessions.filter(
      (d) => d.id !== session.id,
    );
    this.transactions.record(before, this.document, f.name);
    session.state = "committed";
    this.notify();
    return true;
  }
  edit(featureId, parameters, { toleranceOverrides = null } = {}) {
    if (
      toleranceOverrides &&
      Object.entries(toleranceOverrides).some(
        ([k, v]) =>
          !Object.hasOwn(this.document.tolerances, k) ||
          !Number.isFinite(v) ||
          v <= 0,
      )
    )
      throw new Error("許容差は有限の正数です");
    const before = checkpoint(this.document);
    applyFeatureEdit(this.document, featureId, parameters);
    if (toleranceOverrides)
      this.getFeature(featureId).toleranceOverrides = clone(toleranceOverrides);
    this.transactions.record(before, this.document, "寸法を変更");
    this.notify();
    return this.recompute();
  }
  repair(featureId, key, refs) {
    const before = checkpoint(this.document);
    const document = this.document,
      epoch = this.epoch,
      feature = this.getFeature(featureId),
      previousTools =
        feature?.operation.id === "solid.difference"
          ? clone(feature.inputs.tools || [])
          : null;
    reselectReference(this.document, featureId, key, refs);
    this.transactions.record(before, this.document, "参照を修復");
    this.notify();
    return this.recompute().then(() => {
      if (
        previousTools &&
        document === this.document &&
        epoch === this.epoch &&
        feature === this.getFeature(featureId) &&
        ["valid", "warning", "empty"].includes(feature.status)
      ) {
        reconcileDifferenceTools(this.document, previousTools);
        this.resolveBindings();
        this.notify();
      }
    });
  }
  suppress(featureId, value) {
    const before = checkpoint(this.document);
    const feature = this.getFeature(featureId);
    if (value && isSplit(feature?.operation.id))
      restoreSplitInputs(this.document, feature);
    suppressFeature(this.document, featureId, value);
    if (isSplit(feature?.operation.id)) this.resolveBindings();
    this.transactions.record(before, this.document, "抑制を変更");
    this.notify();
    return this.recompute();
  }
  remove(featureId, { dependents = false } = {}) {
    const before = checkpoint(this.document);
    const feature = this.getFeature(featureId);
    if (isSplit(feature?.operation.id))
      restoreSplitInputs(this.document, feature);
    const doomed = new Set([featureId]);
    if (dependents) {
      const { features } = this.document;
      for (const f of topologicalFeatures(this.document))
        if (
          references(f.inputs).some((r) =>
            doomed.has(this.getEntity(r.entityId)?.producer.featureId),
          )
        )
          doomed.add(f.id);
    }
    const entities = new Set(
      this.document.features
        .filter((f) => doomed.has(f.id))
        .flatMap((f) => f.outputSlots.map((s) => s.entityId)),
    );
    this.document.features = this.document.features.filter(
      (f) => !doomed.has(f.id),
    );
    this.document.entities = this.document.entities.filter(
      (e) => !entities.has(e.id),
    );
    for (const f of this.document.features)
      for (const ref of references(f.inputs))
        if (entities.has(ref.entityId)) {
          ref.unresolved = true;
          f.status = "blocked";
          f.diagnostics = [
            diagnostic(
              "CAD_REFERENCE_MISSING",
              "削除された入力を選び直してください。",
              f.id,
              ["reselectReference"],
            ),
          ];
        }
    this.document.bodies = this.document.bodies.filter(
      (b) => !entities.has(b.tipEntityId),
    );
    this.document.documentRevision++;
    this.transactions.record(before, this.document, "履歴を削除");
    if (isSplit(feature?.operation.id)) this.resolveBindings();
    if (doomed.has(this.activeFeature)) {
      this.native.cancelAll();
      this.handles.clear();
    }
    this.notify();
  }
  async recompute() {
    if (this.recomputing) {
      this.queued = true;
      return this.recomputing;
    }
    this.recomputing = (async () => {
      do {
        this.queued = false;
        await this.runRecompute();
      } while (this.queued);
    })().finally(() => {
      this.recomputing = null;
    });
    return this.recomputing;
  }
  async runRecompute() {
    const epoch = this.epoch,
      document = this.document;
    const kernel = await this.native.start();
    if (epoch !== this.epoch || document !== this.document) return;
    this.document.kernel.version = kernel.occtVersion ?? null;
    this.document.kernel.bindingVersion = kernel.ocpVersion;
    for (const feature of topologicalFeatures(this.document)) {
      if (epoch !== this.epoch || document !== this.document) return;
      if (!["dirty", "blocked", "running"].includes(feature.status)) continue;
      const revision = feature.featureRevision;
      const operation = clone(feature.operation),
        parameters = clone(feature.parameters),
        inputs = clone(feature.inputs);
      const inputState = () =>
        references(inputs).map((ref) => {
          const entity = this.getEntity(ref.entityId);
          const producer = this.getFeature(entity?.producer.featureId);
          return [
            entity?.geometry.assetHash,
            producer?.featureRevision,
            producer?.status,
          ];
        });
      const initialInputState = canonical(inputState());
      const current = () =>
        epoch === this.epoch &&
        document === this.document &&
        this.getFeature(feature.id) === feature &&
        feature.featureRevision === revision;
      let outputs = [],
        adopted = false;
      try {
        if (operation.id === "solid.difference")
          validateDifferenceTargets(this.document, inputs);
        const { prepared, inputHashes } = await this.resolve(inputs, {
          split: isSplit(operation.id),
        });
        if (!current()) continue;
        const inputsCurrent = () =>
          current() &&
          canonical(inputHashes) ===
            canonical(
              references(inputs).map(
                (ref) => this.getEntity(ref.entityId)?.geometry.assetHash,
              ),
            ) &&
          references(inputs).every((ref) =>
            ["valid", "warning", "empty"].includes(
              this.getFeature(this.getEntity(ref.entityId)?.producer.featureId)
                ?.status,
            ),
          );
        const tolerances = {
          ...this.document.tolerances,
          ...feature.toleranceOverrides,
        };
        const hash = await sha256({
          operation,
          parameters,
          ...(operation.id === "solid.difference"
            ? { differenceInputs: inputs }
            : {}),
          inputs: prepared
            ? Object.fromEntries(
                Object.entries(prepared).map(([k, v]) => [
                  k,
                  v.map(({ geometryHash, selector, sourceKey }) => ({
                    geometryHash,
                    selector,
                    ...(sourceKey ? { sourceKey } : {}),
                  })),
                ]),
              )
            : {},
          tolerances,
          kernel: this.document.kernel,
        });
        if (!inputsCurrent()) continue;
        feature.requestedHash = hash;
        if (
          feature.lastValid?.resultHash === hash &&
          feature.lastValid.inputRevisionHashes.every(
            (v, i) => v === inputHashes[i],
          ) &&
          feature.lastValid.entitySnapshots.every(
            (e) => this.document.assets[e.geometry.assetHash]?.data,
          )
        ) {
          feature.status = "valid";
          feature.resultHash = hash;
          feature.diagnostics = [];
          for (const slot of feature.outputSlots) {
            const body = this.document.bodies.find((b) => b.id === slot.bodyId);
            if (body) {
              body.tipEntityId = slot.entityId;
              body.status = "ready";
            }
          }
          if (isSplit(operation.id)) applySplitBodies(this.document, feature);
          this.resolveBindings();
          this.notify();
          continue;
        }
        feature.status = "running";
        this.activeFeature = feature.id;
        this.notify();
        const runtimeEpoch = this.native.runtimeEpoch;
        const result = await this.native.evaluate({
          documentId: this.document.id,
          documentRevision: this.document.documentRevision,
          sessionId: null,
          featureId: feature.id,
          featureRevision: revision,
          previewSequence: 0,
          requestedHash: hash,
          intent: "recompute",
          operation,
          parameters,
          inputs: prepared,
          tolerances,
        });
        outputs = result.outputs || [];
        const resultCurrent = () =>
          inputsCurrent() &&
          feature.requestedHash === hash &&
          runtimeEpoch === this.native.runtimeEpoch;
        if (!resultCurrent()) continue;
        feature.diagnostics = result.diagnostics || [];
        if (!["ok", "warning", "empty"].includes(result.status)) {
          feature.status =
            result.status === "cancelled" ? "cancelled" : "failed";
          continue;
        }
        const runtime = await this.native.start();
        if (!resultCurrent()) continue;
        const assets = await this.native.exportAssets(
          outputs.map((o) => o.handle),
        );
        // No document mutation after an await until the entire result is current.
        if (
          !resultCurrent() ||
          runtime.runtimeEpoch !== this.native.runtimeEpoch
        )
          continue;
        if (operation.id === "solid.difference")
          outputs = differenceOutputs(outputs, inputs);
        this.document.kernel.version = runtime.occtVersion ?? null;
        const nextSplitSlots = isSplit(operation.id)
          ? splitSlots(this.document, feature, outputs)
          : null;
        Object.assign(this.document.assets, assets);
        const oldSlots = new Map(feature.outputSlots.map((s) => [s.key, s]));
        feature.outputSlots = [];
        const snapshots = [];
        for (const [index, output] of outputs.entries()) {
          const slot = nextSplitSlots?.[index] ||
            oldSlots.get(output.slotKey) || {
              key: output.slotKey,
              entityId: id(),
              bodyId: id(),
            };
          if (operation.id === "solid.difference")
            slot.bodyId =
              this.getEntity(output.differenceTargetId)?.bodyId || slot.bodyId;
          feature.outputSlots.push(slot);
          const old = this.getEntity(slot.entityId);
          const e = {
            id: slot.entityId,
            bodyId: slot.bodyId,
            producer: { featureId: feature.id, slotKey: slot.key },
            name: feature.name,
            kind: output.kind,
            geometry: { assetHash: output.geometryHash, format: "occt-brep" },
            closure: output.summary.closure,
            exactness: output.summary.exactness,
            accuracy: output.summary.accuracy,
            bbox: output.summary.bbox,
            visibility: old?.visibility || "visible",
            locked: old?.locked || false,
            resultHash: hash,
            displayCache: output.summary,
          };
          this.handles.set(output.geometryHash, {
            value: output,
            epoch: this.native.runtimeEpoch,
          });
          this.document.assets[output.geometryHash] ??= {
            format: "occt-brep",
            encoding: "utf-8",
            byteLength: null,
            data: null,
            sourceKernelVersion: this.document.kernel.version,
          };
          if (old) Object.assign(old, e);
          else this.document.entities.push(e);
          snapshots.push(clone(e));
          let body = this.document.bodies.find((b) => b.id === slot.bodyId);
          if (!body) {
            body = {
              id: slot.bodyId,
              name: feature.name,
              tipEntityId: e.id,
              splitIntoBodyIds: [],
              status: "ready",
            };
            this.document.bodies.push(body);
          }
          body.tipEntityId = e.id;
          body.status = "ready";
        }
        const currentIds = new Set(feature.outputSlots.map((s) => s.entityId)),
          retired = this.document.entities.filter(
            (e) => e.producer.featureId === feature.id && !currentIds.has(e.id),
          );
        for (const e of retired) {
          const body = this.document.bodies.find((b) =>
            isSplit(operation.id) ? b.id === e.bodyId : b.tipEntityId === e.id,
          );
          if (body) {
            body.tipEntityId = null;
            body.status = "missing";
            if (isSplit(operation.id)) {
              const oldSlot = [...oldSlots.values()].find(
                (slot) => slot.entityId === e.id,
              );
              const sourceEntityId =
                oldSlot?.sourceEntityId ||
                (inputs.targets.length === 1
                  ? inputs.targets[0].entityId
                  : null);
              body.splitOrigin = {
                featureId: feature.id,
                entityId: sourceEntityId,
              };
            }
          }
          for (const downstream of this.document.features)
            for (const ref of references(downstream.inputs))
              if (ref.entityId === e.id) {
                ref.unresolved = true;
                if (isSplit(operation.id)) {
                  ref.splitOrigin = clone(body?.splitOrigin);
                  ref.candidateEntityIds = feature.outputSlots
                    .filter(
                      (slot) =>
                        slot.sourceEntityId === body?.splitOrigin?.entityId,
                    )
                    .map((slot) => slot.entityId);
                }
                downstream.status = "blocked";
                downstream.diagnostics = [
                  diagnostic(
                    "CAD_REFERENCE_MISSING",
                    "出力の由来が変わりました。対象を選び直してください。",
                    downstream.id,
                    ["reselectReference"],
                    [feature.id],
                  ),
                ];
              }
        }
        this.document.entities = this.document.entities.filter(
          (e) => e.producer.featureId !== feature.id || currentIds.has(e.id),
        );
        if (isSplit(operation.id)) applySplitBodies(this.document, feature);
        else if (feature.resultPolicy === "replace")
          for (const ref of replacementRefs(feature)) {
            const input = this.getEntity(ref.entityId);
            if (input && !ref.kind) {
              const body = this.document.bodies.find(
                (b) => b.id === input.bodyId,
              );
              if (
                body &&
                !feature.outputSlots.some((s) => s.bodyId === body.id)
              ) {
                body.tipEntityId = null;
                if (
                  feature.outputSlots.length > 1 &&
                  operation.id !== "solid.difference"
                ) {
                  body.status = "split";
                  body.splitIntoBodyIds = feature.outputSlots.map(
                    (s) => s.bodyId,
                  );
                } else if (operation.id === "solid.difference") {
                  body.status = "ready";
                  body.splitIntoBodyIds = [];
                }
              }
            }
          }
        feature.status =
          result.status === "empty"
            ? "empty"
            : result.status === "warning"
              ? "warning"
              : "valid";
        feature.resultHash = hash;
        feature.lastValid = {
          resultHash: hash,
          entitySnapshots: snapshots,
          inputRevisionHashes: inputHashes,
          ...(operation.id === "solid.difference"
            ? { differenceKeepTools: parameters.keepTools === true }
            : {}),
          ...(["curve.fillet","curve.chamfer"].includes(operation.id)
            ? {curveKeepInputs:parameters.keepInputs === true}:{}),
        };
        if (["solid.difference","curve.fillet","curve.chamfer"].includes(operation.id))
          reconcileDifferenceTools(this.document);
        adopted = true;
        this.resolveBindings();
      } catch (error) {
        if (!current() || canonical(inputState()) !== initialInputState)
          continue;
        const code =
          error.diagnostic?.code ||
          [
            "CAD_CANCELLED",
            "CAD_RUNTIME_MISSING",
            "CAD_RUNTIME_CRASHED",
            "CAD_RESOURCE_LIMIT",
          ].find((c) => error.message?.includes(c)) ||
          "CAD_KERNEL_FAILED";
        feature.status =
          code === "CAD_UPSTREAM_BLOCKED"
            ? "blocked"
            : code === "CAD_CANCELLED"
              ? "cancelled"
              : "failed";
        feature.diagnostics = [
          error.diagnostic ||
            diagnostic(code, error.message, feature.id, [
              "editParameters",
              "retry",
            ]),
        ];
      } finally {
        if (!adopted && outputs.length)
          this.native.release(outputs.map((o) => o.handle));
        if (this.activeFeature === feature.id) this.activeFeature = null;
        if (document === this.document && epoch === this.epoch) this.notify();
      }
    }
  }
  attachSketch(featureId, sketch) {
    const before = checkpoint(this.document),
      f = this.getFeature(featureId);
    if (!f) throw new Error("Feature missing");
    this.document.sketches.push(clone(sketch));
    f.sketchId = sketch.id;
    f.operation = { id: "curve.polyline", version: 1 };
    applyFeatureEdit(this.document, featureId, sketchCurveParameters(sketch));
    this.transactions.record(before, this.document, "拘束付きスケッチを追加");
    this.notify();
    return this.recompute();
  }
  updateSketch(featureId, result) {
    const before = checkpoint(this.document),
      f = this.getFeature(featureId),
      i = this.document.sketches.findIndex((s) => s.id === f.sketchId);
    const sketch = clone(result.sketch);
    sketch.solveReport = {
      status: result.status,
      degreesOfFreedom: result.degreesOfFreedom,
      maxResidual: result.maxResidual,
      diagnostics: result.diagnostics,
      conflictCandidates: result.conflictCandidates,
    };
    if (result.status === "no-convergence") {
      this.document.sketches[i].draft = clone(result.candidate);
      this.document.sketches[i].solveReport = sketch.solveReport;
      this.document.documentRevision++;
      this.transactions.record(before, this.document, "未収束の拘束変更を保存");
      this.notify();
      return false;
    }
    sketch.lastValid = {
      points: clone(sketch.points),
      circles: clone(sketch.circles),
    };
    delete sketch.draft;
    this.document.sketches[i] = sketch;
    applyFeatureEdit(this.document, featureId, sketchCurveParameters(sketch));
    this.transactions.record(before, this.document, "寸法・拘束を編集");
    this.notify();
    return this.recompute();
  }
  async insertLibrary(entry) {
    const before = checkpoint(this.document),
      patch = insertShapes(this.document, entry);
    for (const [hash, asset] of Object.entries(patch.assets))
      if (
        (await sha256(asset.data)) !== hash ||
        new TextEncoder().encode(asset.data).byteLength !== asset.byteLength
      )
        throw new Error("CAD_ASSET_MISSING: Library正本が破損しています");
    const candidate = {
      ...this.document,
      features: [...this.document.features, ...patch.features],
      entities: [...this.document.entities, ...patch.entities],
      bodies: [...this.document.bodies, ...patch.bodies],
      sketches: [...this.document.sketches, ...patch.sketches],
      assets: { ...this.document.assets, ...patch.assets },
    };
    validateCadDocument(candidate);
    const imported = [];
    try {
      for (const e of patch.entities) {
        const output = await this.native.importAsset(
          e.geometry.assetHash,
          patch.assets[e.geometry.assetHash],
        );
        e.displayCache = output.summary;
        imported.push([e.geometry.assetHash, output]);
      }
    } catch (error) {
      this.native.release(imported.map(([, o]) => o.handle));
      throw error;
    }
    this.document = candidate;
    for (const [hash, value] of imported)
      this.handles.set(hash, { value, epoch: this.native.runtimeEpoch });
    for (const d of patch.commandDefinitions)
      if (
        !this.document.commandDefinitions.some(
          (c) => c.id === d.id && c.version === d.version,
        )
      )
        this.document.commandDefinitions.push(d);
    this.document.documentRevision++;
    this.transactions.record(before, this.document, "形状Libraryから挿入");
    await this.recompute();
    this.notify();
    return patch.selectedEntityIds;
  }
  resolveBindings() {
    // Recomputing an upstream feature must not turn it into the body's final
    // result while a later feature is dirty, blocked or retaining lastValid.
    const tips = new Map();
    for (const feature of this.document.features) {
      if (feature.status === "suppressed") continue;
      for (const slot of feature.outputSlots)
        tips.set(slot.bodyId, { entityId: slot.entityId, feature });
    }
    for (const body of this.document.bodies)
      // A ready body with no tip can be intentionally consumed by a replace
      // operation (including Difference tools). Binding refresh must not undo it.
      if (body.status === "ready" && body.tipEntityId != null && tips.has(body.id))
        body.tipEntityId = tips.get(body.id).entityId;
    for (const b of this.document.outputBindings) {
      const body =
        b.source.mode === "body-result"
          ? this.document.bodies.find((body) => body.id === b.source.bodyId)
          : null;
      const entity =
        b.source.mode === "body-result"
          ? this.getEntity(
              this.document.bodies.find((body) => body.id === b.source.bodyId)
                ?.tipEntityId,
            )
          : this.getEntity(b.source.entityId);
      const f = entity
        ? this.getFeature(entity.producer.featureId)
        : body?.status === "ready"
          ? tips.get(body.id)?.feature
          : null;
      b.candidateBodyIds = [
        ...new Set([
          ...(body?.status === "split" ? body.splitIntoBodyIds : []),
          ...(body?.replacementBodyIds || []),
        ]),
      ].filter((id) =>
        this.document.bodies.some(
          (body) => body.id === id && body.status === "ready",
        ),
      );
      b.status = b.candidateBodyIds.length
        ? "split"
        : b.source.mode === "body-result" && body?.status !== "ready"
          ? "missing"
          : f && !["valid", "warning"].includes(f.status)
            ? "pending"
            : !entity
              ? "missing"
              : !["valid", "warning"].includes(f?.status)
                ? "pending"
                : (b.expectedKind === "curve"
                    ? entity.kind !== "curve"
                    : !["surface", "shell", "solid", "compound"].includes(entity.kind))
                  ? "type-changed"
                  : "ready";
      b.resolvedEntityId = entity?.id || null;
      b.resolvedResultHash = f?.resultHash || null;
    }
  }
  rebindOutput(bindingId, entityId) {
    const binding = this.document.outputBindings.find(
      (binding) => binding.id === bindingId,
    );
    const entity = this.getEntity(entityId);
    const body = this.document.bodies.find(
      (body) => body.id === entity?.bodyId,
    );
    if (
      !binding ||
      !entity ||
      body?.tipEntityId !== entity.id ||
      !["valid", "warning"].includes(
        this.getFeature(entity.producer.featureId)?.status,
      )
    )
      throw new Error("確定した現在のbody結果を選択してください");
    if (
      binding.expectedKind === "curve"
        ? entity.kind !== "curve"
        : !["surface", "shell", "solid", "compound"].includes(entity.kind) ||
          !entity.displayCache?.preview?.meshes?.length
    )
      throw new Error("生成参照と同じ種類の形状を選択してください");
    const before = checkpoint(this.document);
    binding.source = { mode: "body-result", bodyId: body.id };
    this.document.documentRevision++;
    this.resolveBindings();
    this.transactions.record(before, this.document, "生成参照を修復");
    this.notify();
  }
  async snapshot() {
    const strip = (e) => {
        const { displayCache, ...value } = e;
        return value;
      },
      required = new Set();
    const { assets, ...state } = this.document;
    const doc = clone({
      ...state,
      entities: state.entities.map(strip),
      features: state.features.map((f) => ({
        ...f,
        lastValid: f.lastValid
          ? {
              ...f.lastValid,
              entitySnapshots: f.lastValid.entitySnapshots.map(strip),
            }
          : null,
      })),
    });
    function collect(value) {
      if (typeof value === "string" && Object.hasOwn(assets, value))
        required.add(value);
      else if (value && typeof value === "object")
        for (const child of Object.values(value)) collect(child);
    }
    collect(doc);
    doc.assets = Object.fromEntries(
      [...required].map((hash) => [hash, clone(assets[hash])]),
    );
    const missing = [...required].filter((hash) => !doc.assets[hash]?.data);
    if (missing.length) {
      const handles = missing.map(
        (hash) => this.handles.get(hash)?.value.handle,
      );
      if (handles.some((h) => !h))
        throw new Error("CAD_ASSET_MISSING: 保存に必要な正本がありません");
      Object.assign(doc.assets, await this.native.exportAssets(handles));
    }
    return validateCadDocument(doc);
  }
  async prepareRestore(raw) {
    const next = clone(raw);
    validateCadDocument(next);
    for (const f of next.features)
      if (f.status === "running") f.status = "dirty";
    const prepared = new Map();
    for (const [hash, asset] of Object.entries(next.assets))
      if (
        typeof asset.data !== "string" ||
        (await sha256(asset.data)) !== hash ||
        new TextEncoder().encode(asset.data).byteLength !== asset.byteLength
      )
        throw new Error(
          "CAD_ASSET_MISSING: 正本資産のhash／byte数が一致しません",
        );
    try {
      for (const e of next.entities) {
        let n = prepared.get(e.geometry.assetHash);
        if (!n) {
          n = await this.native.importAsset(
            e.geometry.assetHash,
            next.assets[e.geometry.assetHash],
          );
          prepared.set(e.geometry.assetHash, n);
        }
        e.displayCache = n.summary;
      }
    } catch (error) {
      this.native.release([...prepared.values()].map((o) => o.handle));
      throw error;
    }
    return {
      document: next,
      handles: new Map(
        [...prepared].map(([hash, value]) => [
          hash,
          { value, epoch: this.native.runtimeEpoch },
        ]),
      ),
    };
  }
  commitRestore(prepared) {
    this.native.cancelAll();
    this.epoch++;
    this.handles = prepared.handles;
    this.document = prepared.document;
    this.transactions.clear();
    this.resolveBindings();
  }
  async restore(raw) {
    const prepared = await this.prepareRestore(raw);
    this.commitRestore(prepared);
    this.notify();
  }
}
