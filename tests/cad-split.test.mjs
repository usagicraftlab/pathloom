import test from "node:test";
import assert from "node:assert/strict";
import { CadStore } from "../cad/store.js";
import {
  id,
  sha256,
  clone,
  validateCadDocument,
  deriveVisibleEntities,
} from "../cad/document.js";
import { markDirty } from "../cad/history.js";
import { bindBody } from "../cad/generation-adapter.js";
import { packageShapes, insertShapes } from "../cad/shape-library.js";
import { makeSubshapeRef, resolveSubshape } from "../cad/references.js";

function feature(operation, inputs = {}, parameters = {}) {
  return {
    id: id(),
    name: operation,
    operation: { id: operation, version: 1 },
    command: { id: operation, version: 1 },
    inputs,
    parameters,
    toleranceOverrides: {},
    resultPolicy: "replace",
    outputSlots: [{ key: "result", entityId: id(), bodyId: id() }],
    featureRevision: 1,
    requestedHash: null,
    resultHash: null,
    status: "dirty",
    diagnostics: [],
    lastValid: null,
  };
}
function nativeFixture() {
  const outputs = new Map(),
    assets = new Map();
  return {
    runtimeEpoch: 1,
    released: [],
    calls: [],
    async start() {
      return { runtimeEpoch: this.runtimeEpoch, ocpVersion: "split-fixture" };
    },
    cancelAll() {},
    release(handles) {
      this.released.push(...handles);
    },
    async output(data, kind = "solid") {
      const geometryHash = await sha256(data),
        handle = id();
      const summary = {
        kind,
        bbox: { min: [0, 0, 0], max: [10, 10, 10] },
        closure: { enclosesVolume: kind === "solid" },
        exactness: "analytic",
        accuracy: null,
        preview: { meshes: kind === "solid" ? [{}] : [], curves: [] },
        topology: [],
      };
      const output = { handle, geometryHash, kind, summary };
      outputs.set(handle, output);
      assets.set(geometryHash, {
        format: "occt-brep",
        encoding: "utf-8",
        data,
        byteLength: new TextEncoder().encode(data).length,
      });
      return output;
    },
    async evaluate(request) {
      this.calls.push(clone(request));
      const result = [];
      if (request.operation.id.endsWith(".split")) {
        for (const source of request.inputs.targets)
          for (const part of request.parameters.parts || ["left", "right"]) {
            const output = await this.output(part);
            result.push({
              ...output,
              sourceKey: source.sourceKey,
              slotKey: `${request.operation.id}/${source.sourceKey}/${output.geometryHash}`,
            });
          }
      } else
        result.push({
          ...(await this.output(
            request.featureId + JSON.stringify(request.parameters),
          )),
          slotKey: "result",
        });
      return { status: "ok", outputs: result, diagnostics: [] };
    },
    async exportAssets(handles) {
      return Object.fromEntries(
        handles.map((handle) => {
          const hash = outputs.get(handle).geometryHash;
          return [hash, assets.get(hash)];
        }),
      );
    },
    async importAsset(hash, asset) {
      return this.output(asset.data);
    },
  };
}

test("AUD-002/AUD-003 integration: retained Difference tools remain visible when also used as Split cutters", async () => {
  const { store, split } = await setup();
  const tool = feature("solid.box"),
    target = feature("solid.box");
  store.document.features.push(tool, target);
  await store.recompute();
  const toolId = tool.outputSlots[0].entityId;
  await store.repair(split.id, "cutters", [{ entityId: toolId }]);
  const difference = feature(
    "solid.difference",
    {
      arguments: [{ entityId: target.outputSlots[0].entityId }],
      tools: [{ entityId: toolId }],
    },
    { keepTools: true },
  );
  store.document.features.push(difference);
  await store.recompute();
  assert.equal(difference.status, "valid");
  assert.ok(deriveVisibleEntities(store.document).some((e) => e.id === toolId));
  assert.equal(
    store.document.bodies.find((b) => b.id === tool.outputSlots[0].bodyId)
      .status,
    "ready",
  );
});

test("AUD-002/AUD-003 integration: Difference tool policy preserves per-source Split body candidates", async () => {
  const native = nativeFixture(),
    store = new CadStore(native);
  const tool = feature("solid.box"),
    other = feature("solid.box"),
    target = feature("solid.box"),
    cutter = feature("surface.plane");
  store.document.features.push(tool, other, target, cutter);
  await store.recompute();
  const toolId = tool.outputSlots[0].entityId;
  const split = feature("solid.split", {
    targets: [
      { entityId: toolId },
      { entityId: other.outputSlots[0].entityId },
    ],
    cutters: [{ entityId: cutter.outputSlots[0].entityId }],
  });
  store.document.features.push(split);
  await store.recompute();
  const candidates = split.outputSlots
    .filter((s) => s.sourceEntityId === toolId)
    .map((s) => s.bodyId);
  const difference = feature(
    "solid.difference",
    {
      arguments: [{ entityId: target.outputSlots[0].entityId }],
      tools: [{ entityId: toolId }],
    },
    { keepTools: true },
  );
  store.document.features.push(difference);
  await store.recompute();
  assert.equal(difference.status, "valid");
  const body = store.document.bodies.find(
    (b) => b.id === tool.outputSlots[0].bodyId,
  );
  assert.equal(body.status, "split");
  assert.deepEqual(body.splitIntoBodyIds, candidates);
  assert.ok(
    !deriveVisibleEntities(store.document).some((e) => e.id === toolId),
  );
});
async function setup({ multiple = false, operation = "solid.split" } = {}) {
  const native = nativeFixture(),
    store = new CadStore(native);
  const source = feature("solid.box"),
    cutter = feature("surface.plane");
  store.document.features.push(source, cutter);
  await store.recompute();
  const targetId = source.outputSlots[0].entityId;
  const targets = [{ entityId: targetId }];
  if (multiple) {
    const source2 = feature("solid.box");
    store.document.features.push(source2);
    await store.recompute();
    targets.push({ entityId: source2.outputSlots[0].entityId });
  }
  const split = feature(operation, {
    targets,
    cutters: [{ entityId: cutter.outputSlots[0].entityId }],
  });
  store.document.features.push(split);
  await store.recompute();
  return { native, store, source, cutter, split };
}
async function rerun(store, feature) {
  feature.lastValid.resultHash = "force-native-evaluation";
  markDirty(store.document, [feature.id]);
  await store.recompute();
}

for (const operation of ["solid.split", "surface.split"]) {
  test(`AUD-003 ${operation}: native rerun/reorder/cache preserve entity, body, references and bindings`, async () => {
    const { store, split, native, cutter } = await setup({
      multiple: true,
      operation,
    });
    const initial = clone(split.outputSlots);
    const binding = bindBody(
      store.document,
      store.getEntity(initial[0].entityId),
    );
    const dependent = feature("shape.transform", {
      object: [{ entityId: initial[0].entityId }],
    });
    store.document.features.push(dependent);
    await store.recompute();
    split.inputs.targets.reverse();
    split.parameters.parts = ["right", "left"];
    await rerun(store, split);
    assert.deepEqual(
      new Map(split.outputSlots.map((s) => [s.key, s])),
      new Map(initial.map((s) => [s.key, s])),
    );
    assert.equal(dependent.status, "valid");
    assert.equal(binding.status, "ready");
    assert.equal(binding.resolvedEntityId, initial[0].entityId);
    const before = native.calls.length;
    markDirty(store.document, [split.id]);
    await store.recompute();
    assert.equal(native.calls.length, before);
    assert.ok(
      deriveVisibleEntities(store.document).some(
        (e) => e.id === cutter.outputSlots[0].entityId,
      ),
    );
    validateCadDocument(await store.snapshot());
  });
}

test("AUD-003 changed same-count partitions block dependents and bindings until explicit repair", async () => {
  const { store, split } = await setup();
  const old = clone(split.outputSlots),
    entity = store.getEntity(old[0].entityId);
  const binding = bindBody(store.document, entity);
  const dependent = feature("shape.transform", {
    object: [{ entityId: entity.id }],
  });
  dependent.resultPolicy = "new";
  store.document.features.push(dependent);
  await store.recompute();
  await store.edit(split.id, { parts: ["moved-left", "moved-right"] });
  assert.ok(
    split.outputSlots.every(
      (s) =>
        !old.some((o) => o.entityId === s.entityId || o.bodyId === s.bodyId),
    ),
  );
  assert.equal(dependent.status, "blocked");
  assert.equal(dependent.inputs.object[0].unresolved, true);
  assert.equal(binding.status, "split");
  assert.equal(binding.resolvedEntityId, null);
  assert.deepEqual(
    new Set(binding.candidateBodyIds),
    new Set(split.outputSlots.map((s) => s.bodyId)),
  );
  const selected = split.outputSlots[1];
  await store.repair(dependent.id, "object", [{ entityId: selected.entityId }]);
  store.rebindOutput(binding.id, selected.entityId);
  assert.equal(dependent.status, "valid");
  assert.equal(binding.id, store.document.outputBindings[0].id);
  assert.equal(binding.status, "ready");
  assert.equal(binding.resolvedEntityId, selected.entityId);
});

test("AUD-003 count changes preserve only exact parts and persist unresolved candidates across restore", async () => {
  const { store, split } = await setup();
  const [left, right] = clone(split.outputSlots);
  const binding = bindBody(store.document, store.getEntity(right.entityId));
  const dependent = feature("shape.transform", {
    object: [{ entityId: right.entityId }],
  });
  store.document.features.push(dependent);
  await store.recompute();
  await store.edit(split.id, { parts: ["left", "middle", "new-right"] });
  assert.equal(split.outputSlots[0].entityId, left.entityId);
  assert.equal(dependent.status, "blocked");
  assert.equal(binding.status, "split");
  const saved = JSON.parse(JSON.stringify(await store.snapshot()));
  const restored = new CadStore(nativeFixture());
  await restored.restore(saved);
  const next = restored.getFeature(split.id),
    before = clone(next.outputSlots);
  await rerun(restored, next);
  assert.deepEqual(next.outputSlots, before);
  assert.equal(restored.getFeature(dependent.id).status, "blocked");
  assert.equal(restored.document.outputBindings[0].status, "split");
  validateCadDocument(await restored.snapshot());
});

test("AUD-003 old source-body bindings expose per-source candidates without picking a partition", async () => {
  const { store, source, split } = await setup({ multiple: true });
  const binding = bindBody(
    store.document,
    store.getEntity(source.outputSlots[0].entityId),
  );
  store.resolveBindings();
  assert.equal(binding.status, "split");
  assert.equal(binding.resolvedEntityId, null);
  assert.deepEqual(
    binding.candidateBodyIds,
    split.outputSlots
      .filter((s) => s.sourceEntityId === source.outputSlots[0].entityId)
      .map((s) => s.bodyId),
  );
  const before = clone(binding);
  assert.throws(
    () => store.rebindOutput(binding.id, source.outputSlots[0].entityId),
    /現在のbody/,
  );
  assert.deepEqual(binding, before);
  binding.expectedKind = "curve";
  assert.throws(
    () => store.rebindOutput(binding.id, split.outputSlots[0].entityId),
    /同じ種類/,
  );
});

test("AUD-003 a unique exact legacy UUID slot migrates; changed geometry and multiple-source ambiguity do not", async () => {
  for (const multiple of [false, true]) {
    const { store, split } = await setup({ multiple });
    const before = clone(split.outputSlots);
    for (const slot of split.outputSlots) {
      slot.key = id();
      delete slot.sourceEntityId;
      store.getEntity(slot.entityId).producer.slotKey = slot.key;
    }
    await rerun(store, split);
    assert.equal(
      split.outputSlots.some((s) =>
        before.some((old) => old.entityId === s.entityId),
      ),
      !multiple,
    );
  }
});

test("AUD-003 Library remaps source/slot/body provenance and recomputation keeps both independent copies stable", async () => {
  const { store, split } = await setup();
  split.parameters.label = split.inputs.targets[0].entityId;
  const entry = packageShapes(store.document, [split.outputSlots[0].entityId]);
  const first = insertShapes(store.document, entry),
    second = insertShapes(store.document, entry);
  for (const patch of [first, second]) {
    const copied = patch.features.find((f) => f.operation.id === "solid.split");
    assert.equal(copied.parameters.label, split.parameters.label);
    for (const slot of copied.outputSlots) {
      assert.equal(slot.sourceEntityId, copied.inputs.targets[0].entityId);
      assert.ok(slot.key.startsWith(`solid.split/${slot.sourceEntityId}/`));
      assert.equal(
        patch.entities.find((e) => e.id === slot.entityId).producer.slotKey,
        slot.key,
      );
      assert.equal(
        copied.lastValid.entitySnapshots.find((e) => e.id === slot.entityId)
          .producer.slotKey,
        slot.key,
      );
    }
    const isolated = new CadStore(nativeFixture());
    Object.assign(isolated.document, {
      ...patch,
      outputBindings: [],
      draftSessions: [],
    });
    const before = clone(copied.outputSlots);
    await isolated.recompute();
    // Fixture input assets change under remapped primitive IDs, but exact part assets are identical.
    assert.deepEqual(copied.outputSlots, before);
    validateCadDocument(await isolated.snapshot());
  }
  assert.notEqual(first.selectedEntityIds[0], second.selectedEntityIds[0]);
});

test("AUD-003 suppression/restore from cache and deletion retain cutters and recover the source body", async () => {
  const { store, source, cutter, split } = await setup();
  const initial = clone(split.outputSlots);
  await store.suppress(split.id, true);
  assert.ok(
    deriveVisibleEntities(store.document).some(
      (e) => e.id === source.outputSlots[0].entityId,
    ),
  );
  await store.suppress(split.id, false);
  assert.deepEqual(split.outputSlots, initial);
  assert.ok(
    deriveVisibleEntities(store.document).some(
      (e) => e.id === cutter.outputSlots[0].entityId,
    ),
  );
  store.remove(split.id);
  assert.ok(
    deriveVisibleEntities(store.document).some(
      (e) => e.id === source.outputSlots[0].entityId,
    ),
  );
  validateCadDocument(await store.snapshot());
});

test("AUD-003 exact part subshape survives a changed feature hash; changed assets never use an ordinal", async () => {
  const { store, split } = await setup();
  const entity = store.getEntity(split.outputSlots[0].entityId);
  const topology = {
    kind: "face",
    topologyId: `${entity.geometry.assetHash}:face:0`,
    semanticPath: null,
  };
  entity.displayCache.topology = [topology];
  const ref = makeSubshapeRef(entity, topology);
  entity.resultHash = "different-feature-request";
  assert.equal(resolveSubshape(ref, entity).status, "ready");
  entity.geometry.assetHash = "different-part";
  entity.displayCache.topology = [
    { ...topology, topologyId: "different-part:face:0" },
  ];
  assert.equal(resolveSubshape(ref, entity).status, "missing");
});

test("AUD-003 changed legacy geometry gets new IDs and a one-part result stays an explicit binding choice", async () => {
  const { store, source, split } = await setup();
  const before = clone(split.outputSlots);
  const binding = bindBody(
    store.document,
    store.getEntity(source.outputSlots[0].entityId),
  );
  for (const slot of split.outputSlots) {
    slot.key = id();
    delete slot.sourceEntityId;
  }
  await store.edit(split.id, { parts: ["unsplit-shape"] });
  assert.equal(split.outputSlots.length, 1);
  assert.ok(
    before.every((old) => old.entityId !== split.outputSlots[0].entityId),
  );
  assert.equal(binding.status, "split");
  assert.equal(binding.resolvedEntityId, null);
  assert.deepEqual(binding.candidateBodyIds, [split.outputSlots[0].bodyId]);
});

test("AUD-003 ambiguous returned slots keep lastValid identities and release unadopted handles", async () => {
  const { store, split, native } = await setup();
  const before = clone(split.outputSlots),
    lastValid = clone(split.lastValid);
  await store.edit(split.id, { parts: ["left", "left"] });
  assert.equal(split.status, "failed");
  assert.deepEqual(split.outputSlots, before);
  assert.deepEqual(split.lastValid, lastValid);
  assert.equal(native.released.length, 2);
});

test("AUD-003 suppressing a parallel Split retains the other Split's explicit source-body candidates", async () => {
  const { store, source, split } = await setup();
  const binding = bindBody(
    store.document,
    store.getEntity(source.outputSlots[0].entityId),
  );
  const other = feature("solid.split", clone(split.inputs), {
    parts: ["other-left", "other-right"],
  });
  store.document.features.push(other);
  await store.recompute();
  await store.suppress(other.id, true);
  assert.equal(binding.status, "split");
  assert.equal(binding.resolvedEntityId, null);
  assert.deepEqual(
    binding.candidateBodyIds,
    split.outputSlots.map((slot) => slot.bodyId),
  );
});
