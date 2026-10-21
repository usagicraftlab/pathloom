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
    let entry = this.handles.get(entity.geometry.assetHash);
    if (entry?.epoch === this.native.runtimeEpoch) return entry.value;
    const asset = this.document.assets[entity.geometry.assetHash];
    if (!asset?.data)
      throw new Error(
        "CAD_ASSET_MISSING: 正本を取得できません。保存または再計算で回復してください。",
      );
    const result = await this.native.importAsset(
      entity.geometry.assetHash,
      asset,
    );
    this.handles.set(entity.geometry.assetHash, {
      value: result,
      epoch: this.native.runtimeEpoch,
    });
    entity.displayCache = result.summary;
    return result;
  }
  async resolve(inputs) {
    const prepared = {},
      inputHashes = [];
    for (const [key, refs] of Object.entries(inputs)) {
      prepared[key] = [];
      for (const ref of Array.isArray(refs) ? refs : [refs]) {
        const e = this.getEntity(ref.entityId);
        const f = e && this.getFeature(e.producer.featureId);
        if (!e || !["valid", "warning", "empty"].includes(f?.status)) {
          const d = diagnostic(
            "CAD_UPSTREAM_BLOCKED",
            "上流の形状が未解決です。",
            null,
            ["openCauseFeature"],
            f ? [f.id] : [],
          );
          throw Object.assign(new Error(d.message), { diagnostic: d });
        }
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
        });
        inputHashes.push(e.geometry.assetHash);
      }
    }
    return { prepared, inputHashes };
  }
  async preview(session) {
    const { operationForSession } = await import("./commands/session.js");
    const operation = operationForSession(session);
    const { prepared, inputHashes } = await this.resolve(operation.inputs);
    const sequence = ++session.previewSequence,
      epoch = this.epoch;
    const requestedHash = await sha256({
      operation: operation.operation,
      parameters: operation.parameters,
      inputs: inputHashes,
      tolerances: {
        ...this.document.tolerances,
        ...session.toleranceOverrides,
      },
    });
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
      epoch !== this.epoch ||
      sequence !== session.previewSequence ||
      session.state === "cancelled"
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
    const before = checkpoint(this.document),
      { operationForSession } = await import("./commands/session.js");
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
        mode: session.command.mode,
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
      f.status = "failed";
      f.diagnostics = [
        diagnostic("CAD_RUNTIME_MISSING", error.message, f.id, [
          "restartRuntime",
        ]),
      ];
    }
    if (!["valid", "warning", "empty"].includes(f.status)) {
      const failure = clone(f);
      this.document = before;
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
    reselectReference(this.document, featureId, key, refs);
    this.transactions.record(before, this.document, "参照を修復");
    this.notify();
    return this.recompute();
  }
  suppress(featureId, value) {
    const before = checkpoint(this.document);
    suppressFeature(this.document, featureId, value);
    this.transactions.record(before, this.document, "抑制を変更");
    this.notify();
    return this.recompute();
  }
  remove(featureId, { dependents = false } = {}) {
    const before = checkpoint(this.document);
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
    this.recomputing = this.runRecompute();
    try {
      await this.recomputing;
    } finally {
      this.recomputing = null;
      if (this.queued) {
        this.queued = false;
        return this.recompute();
      }
    }
  }
  async runRecompute() {
    const epoch = this.epoch;
    const kernel = await this.native.start();
    this.document.kernel.version = kernel.occtVersion ?? null;
    this.document.kernel.bindingVersion = kernel.ocpVersion;
    for (const feature of topologicalFeatures(this.document)) {
      if (epoch !== this.epoch) return;
      if (!["dirty", "blocked", "running"].includes(feature.status)) continue;
      const revision = feature.featureRevision;
      let outputs = [];
      try {
        const { prepared, inputHashes } = await this.resolve(feature.inputs);
        const tolerances = {
          ...this.document.tolerances,
          ...feature.toleranceOverrides,
        };
        const hash = await sha256({
          operation: feature.operation,
          parameters: feature.parameters,
          inputs: prepared
            ? Object.fromEntries(
                Object.entries(prepared).map(([k, v]) => [
                  k,
                  v.map(({ geometryHash, selector }) => ({
                    geometryHash,
                    selector,
                  })),
                ]),
              )
            : {},
          tolerances,
          kernel: this.document.kernel,
        });
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
          this.resolveBindings();
          this.notify();
          continue;
        }
        feature.status = "running";
        this.activeFeature = feature.id;
        this.notify();
        const result = await this.native.evaluate({
          documentId: this.document.id,
          documentRevision: this.document.documentRevision,
          sessionId: null,
          featureId: feature.id,
          featureRevision: revision,
          previewSequence: 0,
          requestedHash: hash,
          intent: "recompute",
          operation: clone(feature.operation),
          parameters: clone(feature.parameters),
          inputs: prepared,
          tolerances,
        });
        outputs = result.outputs || [];
        const current = this.getFeature(feature.id);
        const nowHashes = references(feature.inputs).map(
          (r) => this.getEntity(r.entityId)?.geometry.assetHash,
        );
        if (
          epoch !== this.epoch ||
          !current ||
          current.featureRevision !== revision ||
          current.requestedHash !== hash ||
          canonical(nowHashes) !== canonical(inputHashes)
        ) {
          this.native.release(outputs.map((o) => o.handle));
          continue;
        }
        feature.diagnostics = result.diagnostics || [];
        if (!["ok", "warning", "empty"].includes(result.status)) {
          feature.status =
            result.status === "cancelled" ? "cancelled" : "failed";
          continue;
        }
        this.document.kernel.version =
          (await this.native.start()).occtVersion ?? null;
        Object.assign(
          this.document.assets,
          await this.native.exportAssets(outputs.map((o) => o.handle)),
        );
        const oldSlots = new Map(feature.outputSlots.map((s) => [s.key, s]));
        feature.outputSlots = [];
        const snapshots = [];
        for (const output of outputs) {
          const slot = oldSlots.get(output.slotKey) || {
            key: output.slotKey,
            entityId: id(),
            bodyId: id(),
          };
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
          const body = this.document.bodies.find((b) => b.tipEntityId === e.id);
          if (body) {
            body.tipEntityId = null;
            body.status = "missing";
          }
          for (const downstream of this.document.features)
            for (const ref of references(downstream.inputs))
              if (ref.entityId === e.id) {
                ref.unresolved = true;
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
        if (feature.resultPolicy === "replace")
          for (const ref of references(feature.inputs)) {
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
                if (feature.outputSlots.length > 1) {
                  body.status = "split";
                  body.splitIntoBodyIds = feature.outputSlots.map(
                    (s) => s.bodyId,
                  );
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
        };
        this.resolveBindings();
      } catch (error) {
        if (
          epoch !== this.epoch ||
          this.getFeature(feature.id) !== feature ||
          feature.featureRevision !== revision
        )
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
        if (this.activeFeature === feature.id) this.activeFeature = null;
        this.notify();
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
    for (const b of this.document.outputBindings) {
      const entity =
        b.source.mode === "body-result"
          ? this.getEntity(
              this.document.bodies.find((body) => body.id === b.source.bodyId)
                ?.tipEntityId,
            )
          : this.getEntity(b.source.entityId);
      const f = entity && this.getFeature(entity.producer.featureId);
      b.status = !entity
        ? "missing"
        : !["valid", "warning"].includes(f?.status)
          ? "pending"
          : b.expectedKind === "curve" && entity.kind !== "curve"
            ? "type-changed"
            : "ready";
      b.resolvedEntityId = entity?.id || null;
      b.resolvedResultHash = f?.resultHash || null;
    }
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
  }
  async restore(raw) {
    const prepared = await this.prepareRestore(raw);
    this.commitRestore(prepared);
    this.notify();
  }
}
