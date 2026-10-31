import { test, expect } from "./fixtures/cad.mjs";
import { readFile } from "node:fs/promises";
const fixtureShape = JSON.parse(
  await readFile(new URL("../fixtures/editable-cube.json", import.meta.url), "utf8"),
).shape;

test("existing editable STEP enters CAD history, persists provenance, and exports for independent reread", async ({ page }) => {
  await page.evaluate((shape) => window.Pathloom.addImportedStep({ ...shape, id: "legacy-step-1", placementMatrix: [1,0,0,12,0,1,0,-4,0,0,1,3,0,0,0,1] }), fixtureShape);
  await page.locator("#modeGenerate").click();
  await expect(page.getByText("pathloom-cube.step · 6 CAD faces")).toHaveCount(1);
  await page.locator("#importedShapeList button", { hasText: "CAD履歴へ取り込む" }).evaluate((button) => button.click());
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator(".model-history-entry").first()).toContainText("valid");

  const imported = await page.evaluate(() => {
    const store = window.PathloomModel.store, feature = store.document.features[0], entity = store.getEntity(feature.outputSlots[0].entityId);
    return { feature: structuredClone(feature), entity: structuredClone(entity), asset: structuredClone(store.document.assets[entity.geometry.assetHash]) };
  });
  expect(imported.feature.operation.id).toBe("import.step");
  expect(imported.feature.parameters.units).toBe("mm");
  expect(imported.feature.parameters.source.importedShapeId).toBe("legacy-step-1");
  expect(imported.feature.parameters.placementMatrix).toEqual([1,0,0,12,0,1,0,-4,0,0,1,3,0,0,0,1]);
  expect(imported.asset.provenance.originalHash).toBe(imported.feature.parameters.originalAssetHash);
  expect(imported.entity.displayCache.volumeMm3).toBeCloseTo(8000, 6);

  const moved = await page.evaluate(async (entityId) => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const store = window.PathloomModel.store, entity = store.getEntity(entityId);
    const session = createCommandSession(commandById("transform.move"), {
      selection: [{ entityId, entityKind: entity.kind }],
    });
    session.parameters.translation = [5, 0, 0];
    if (!await store.add(session)) throw new Error(JSON.stringify(session.diagnostics));
    const feature = store.document.features.at(-1);
    return feature.outputSlots[0].entityId;
  }, imported.entity.id);
  await expect(page.locator(".model-history-entry")).toHaveCount(2);

  const saves = await page.evaluate(() => window.__saveCount);
  await page.locator("#projectSave").evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__saveCount)).toBe(saves + 1);
  const saved = await page.evaluate(() => structuredClone(window.__saved));
  expect(saved.importedShapes).toHaveLength(1);
  expect(saved.importedShapes[0].id).toBe("legacy-step-1");
  expect(saved.importedShapes[0].placementMatrix).toEqual([1,0,0,12,0,1,0,-4,0,0,1,3,0,0,0,1]);
  expect(saved.cadDocument.features.map((f) => f.operation.id)).toEqual(["import.step", "shape.transform"]);

  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#projectOpen").evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(2);
  const recoveryLater = page.locator('dialog[open] button[data-recovery="later"]');
  if (await recoveryLater.count()) await recoveryLater.click();
  expect(await page.evaluate(() => window.Pathloom.getImportedStep("legacy-step-1")?.brep?.data.length)).toBeGreaterThan(100);
  await page.locator("#modeModel").click();
  await page.locator(".model-history-entry").last().click();
  // The reviewed CAD workspace removes the STEP toolbar button. Exercise the
  // existing export transport here; independent reread assertions stay below.
  await page.locator("#modelExportStep").evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__savedStep?.filename)).toBe("Move.step");
  const reread = await page.evaluate(() => window.__cadKernel({ type: "import-step", step: window.__savedStep.content }));
  expect(reread.kind).toBe("solid");
  expect(reread.summary.valid).toBe(true);
  expect(reread.summary.closure.enclosesVolume).toBe(true);
  expect(reread.summary.volumeMm3).toBeCloseTo(8000, 6);
  expect(reread.summary.bbox.min[0]).toBeCloseTo(5, 6);
  expect(reread.summary.bbox.max[0]).toBeCloseTo(25, 6);
  const current = await page.evaluate((entityId) => {
    const e = window.PathloomModel.store.getEntity(entityId);
    return { volume: e.displayCache.volumeMm3, bbox: e.bbox };
  }, moved);
  expect(current.volume).toBeCloseTo(reread.summary.volumeMm3, 6);
  expect(current.bbox.min[0]).toBeCloseTo(reread.summary.bbox.min[0], 6);
  expect(current.bbox.max[0]).toBeCloseTo(reread.summary.bbox.max[0], 6);
});

test("display-only STEP remains legacy-only and reports that CAD history needs exact B-rep", async ({ page }) => {
  await page.evaluate(() => window.Pathloom.addImportedStep({
    id: "display-only", name: "mesh.step", visible: true,
    meshes: [{ name: "mesh", positions: [0,0,0,1,0,0,0,1,0], normals: [], indices: [0,1,2], color: [.7,.7,.7] }],
  }));
  await page.locator("#modeGenerate").click();
  await expect(page.getByText("mesh.step", { exact: true })).toHaveCount(1);
  await expect(page.getByText("CAD履歴化には正確なB-repが必要です", { exact: true })).toHaveCount(1);
  await expect(page.locator("#importedShapeList button", { hasText: "CAD履歴へ取り込む" })).toHaveCount(0);
  expect(await page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(0);
});
