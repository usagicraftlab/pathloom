import { test, expect } from "./fixtures/cad.mjs";

async function add(page, id, parameters = {}, inputs = {}) {
  return page.evaluate(async ({ id, parameters, inputs }) => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const session = createCommandSession(commandById(id, 2) || commandById(id));
    Object.assign(session.parameters, parameters);
    for (const [key, references] of Object.entries(inputs))
      session.inputs[key] = references.map((reference) =>
        typeof reference === "string" ? { entityId: reference, role: key } : { ...reference, role: key });
    const store = window.PathloomModel.store;
    if (!(await store.add(session))) throw new Error(JSON.stringify(session.diagnostics));
    const feature = store.document.features.at(-1);
    return {
      featureId: feature.id,
      outputIds: feature.outputSlots.map((slot) => slot.entityId),
      outputs: feature.outputSlots.map((slot) => structuredClone(store.getEntity(slot.entityId))),
    };
  }, { id, parameters, inputs });
}

function topology(entity, kind, predicate) {
  const item = entity.displayCache.topology.find((candidate) =>
    candidate.kind === kind && predicate(candidate));
  if (!item) throw new Error(`Missing ${kind} topology`);
  return {
    entityId: entity.id,
    kind: item.kind,
    semanticPath: item.semanticPath,
    topologyId: item.topologyId,
    recordedResultHash: entity.resultHash,
    recordedAssetHash: entity.geometry.assetHash,
    fingerprint: item.fingerprint,
  };
}

async function roundTrip(page) {
  const count = await page.evaluate(() => window.__saveCount);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saveCount)).toBe(count + 1);
  const before = await page.evaluate(() => structuredClone(window.__saved.cadDocument));
  await page.evaluate(() => window.__cadStorage({ key: "recovery", discard: true }));
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.id)).toBe(before.id);
  return page.evaluate(() => window.PathloomModel.snapshot());
}

test("Issue17 surface edits preserve exact assets through Undo/Redo and v2 Save/Open", async ({ page }) => {
  const face = await add(page, "S01", { anchorMode: "corner", anchor: [0, 0, 0], widthMm: 10, heightMm: 10 });
  const cutter = await add(page, "S02", { points: [[5, -5, -5], [5, 15, -5], [5, 15, 15], [5, -5, 15]] });
  const split = await add(page, "D09", { mode: "split" }, {
    face: [topology(face.outputs[0], "face", () => true)],
    cutters: [cutter.outputIds[0]],
  });
  expect(split.outputs).toHaveLength(2);
  expect(split.outputs.reduce((sum, output) => sum + output.displayCache.areaMm2, 0)).toBeCloseTo(100, 6);

  const extended = await add(page, "F05", { side: "uEnd", parameterDelta: 5 }, {
    surface: [face.outputIds[0]],
  });
  expect(extended.outputs[0].displayCache.areaMm2).toBeCloseTo(150, 6);
  const offsets = await add(page, "F06", { distanceMm: 1, directionMode: "normal", bothSides: true, solidify: false }, {
    surface: [face.outputIds[0]],
  });
  expect(offsets.outputs).toHaveLength(2);

  const featureCount = await page.evaluate(() => window.PathloomModel.store.document.features.length);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(featureCount - 1);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(featureCount);

  const beforeHashes = await page.evaluate(async () =>
    (await window.PathloomModel.snapshot()).entities.map((entity) => entity.geometry.assetHash));
  const after = await roundTrip(page);
  expect(after.entities.map((entity) => entity.geometry.assetHash)).toEqual(beforeHashes);
  expect(after.features.at(-1).command.id).toBe("F06");
});

test("Issue17 connectors record continuity and face operations retain typed provenance", async ({ page }) => {
  const first = await add(page, "S01", { anchorMode: "corner", anchor: [0, 0, 0], widthMm: 10, heightMm: 10 });
  const second = await add(page, "S01", { anchorMode: "corner", anchor: [20, 0, 0], widthMm: 10, heightMm: 10 });
  const firstEdge = topology(first.outputs[0], "edge", (item) => Math.abs(item.fingerprint.centroid[0] - 10) < 1e-7);
  const secondEdge = topology(second.outputs[0], "edge", (item) => Math.abs(item.fingerprint.centroid[0] - 20) < 1e-7);
  const pair = { first: [first.outputIds[0]], firstEdge: [firstEdge], second: [second.outputIds[0]], secondEdge: [secondEdge] };
  const blend = await add(page, "F08", { continuity: "G1", fitToleranceMm: 0.01 }, pair);
  expect(blend.outputs[0].accuracy.achievedContinuity).toBe("G1");
  expect(blend.outputs[0].accuracy.maxBoundaryDeviationMm).toBeGreaterThanOrEqual(0);
  expect(blend.outputs[0].accuracy.fitToleranceMm).toBe(0.01);
  const match = await add(page, "F09", { continuity: "G0", fitToleranceMm: 0.01 }, pair);
  expect(match.outputs[0].accuracy.referenceUnchanged).toBe(true);
  expect(match.outputs[0].accuracy.exactness).toBe("approximate");
  const rebuilt = await add(page, "F10", { uDegree: 3, vDegree: 3, maxSegments: 8, acceptApproximation: true }, {
    surface: [first.outputIds[0]],
  });
  expect(rebuilt.outputs[0].accuracy.classification).toBe("sampled-corresponding-parameter");
  expect(rebuilt.outputs[0].accuracy.maxDeviationMm).toBeLessThanOrEqual(0.01);
  const boundaries = await add(page, "F11.boundaries", { mode: "open" }, { object: [first.outputIds[0]] });
  expect(boundaries.outputs).toHaveLength(4);
  const snapshot = await roundTrip(page);
  expect(snapshot.features.find((feature) => feature.id === blend.featureId).outputSlots).toHaveLength(1);
  expect(snapshot.features.find((feature) => feature.id === match.featureId).parameters.continuity).toBe("G0");
});
