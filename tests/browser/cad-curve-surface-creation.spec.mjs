import { test, expect } from "./fixtures/cad.mjs";

async function add(page, id, parameters = {}, inputs = {}) {
  return page.evaluate(
    async ({ id, parameters, inputs }) => {
      const { commandById } = await import("/cad/commands/registry.js");
      const { createCommandSession } = await import("/cad/commands/session.js");
      const session = createCommandSession(commandById(id));
      Object.assign(session.parameters, parameters);
      for (const [key, entityIds] of Object.entries(inputs))
        session.inputs[key] = entityIds.map((entityId) => ({ entityId, role: key }));
      const store = window.PathloomModel.store;
      if (!(await store.add(session))) throw new Error(JSON.stringify(session.diagnostics));
      const feature = store.document.features.at(-1);
      return {
        featureId: feature.id,
        outputIds: feature.outputSlots.map((slot) => slot.entityId),
        outputs: feature.outputSlots.map((slot) =>
          structuredClone(store.getEntity(slot.entityId)),
        ),
      };
    },
    { id, parameters, inputs },
  );
}

test("Issue16 C11/C12 use registry sessions, exact assets and one-step Undo/Redo", async ({ page }) => {
  const helix = await add(page, "C11", { turns: 2, pitchMm: 3, radiusMm: 5 });
  const spiral = await add(page, "C12", { turns: 2, startRadiusMm: 1, endRadiusMm: 6 });
  expect(helix.outputs[0].geometry.assetHash).toBeTruthy();
  expect(helix.outputs[0].accuracy.estimatedMaxDeviationMm).toBeGreaterThan(0);
  expect(spiral.outputs[0].displayCache.closure.curveClosed).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(1);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(2);
});

test("Issue16 Network/Patch keep ordered inputs and fitted accuracy through v2 Save/Open", async ({ page }) => {
  const lines = [];
  for (const [start, end] of [
    [[0, 0, 0], [10, 0, 0]],
    [[0, 10, 0], [10, 10, 0]],
    [[0, 0, 0], [0, 10, 0]],
    [[10, 0, 0], [10, 10, 0]],
  ]) lines.push(await add(page, "C02", { start, end }));
  const network = await add(page, "S10", {}, {
    uCurves: [lines[0].outputIds[0], lines[1].outputIds[0]],
    vCurves: [lines[2].outputIds[0], lines[3].outputIds[0]],
  });
  const patch = await add(page, "S11", {}, {
    boundaries: [lines[0].outputIds[0], lines[1].outputIds[0]],
  });
  const sweepInputs = [];
  for (const [start, end] of [
    [[0, 0, 0], [0, 0, 10]],
    [[5, 0, 0], [5, 0, 10]],
    [[0, 0, 0], [5, 0, 0]],
    [[0, 0, 10], [5, 0, 10]],
  ]) sweepInputs.push(await add(page, "C02", { start, end }));
  const sweep = await add(page, "S08", {
    sectionReversed: [false, false], sectionStations: [0, 1],
    sampleCount: 9, sectionSampleCount: 9, fitToleranceMm: 0.01,
  }, {
    rails: [sweepInputs[0].outputIds[0], sweepInputs[1].outputIds[0]],
    sections: [sweepInputs[2].outputIds[0], sweepInputs[3].outputIds[0]],
  });
  expect(network.outputs[0].displayCache.areaMm2).toBeCloseTo(100, 4);
  expect(network.outputs[0].accuracy.maxIntersectionGapMm).toBeLessThan(1e-6);
  expect(network.outputs[0].accuracy.intersectionToleranceMm).toBe(0.01);
  expect(patch.outputs[0].accuracy.maxDeviationMm).toBeLessThanOrEqual(0.01);
  expect(patch.outputs[0].accuracy.exactness).toBe("approximate");
  expect(sweep.outputs[0].accuracy.maxRailDeviationMm).toBeLessThanOrEqual(0.01);
  expect(sweep.outputs[0].accuracy.maxSectionDeviationMm).toBeLessThanOrEqual(0.01);

  const saveCount = await page.evaluate(() => window.__saveCount);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saveCount)).toBe(saveCount + 1);
  const before = await page.evaluate(() => structuredClone(window.__saved.cadDocument));
  await page.evaluate(() => window.__cadStorage({ key: "recovery", discard: true }));
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.id)).toBe(before.id);
  const after = await page.evaluate(() => window.PathloomModel.snapshot());
  expect(after.features).toEqual(before.features);
  expect(after.entities.map((entity) => entity.geometry.assetHash)).toEqual(
    before.entities.map((entity) => entity.geometry.assetHash),
  );
  expect(after.entities.at(-1).accuracy.maxDeviationMm).toBeLessThanOrEqual(0.01);
});
