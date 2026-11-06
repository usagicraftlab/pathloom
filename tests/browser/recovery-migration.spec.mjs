import { test, expect } from "./fixtures/cad.mjs";

test("P4-22: legacy libraries migrate and whole-project recovery includes non-CAD state", async ({ page }) => {
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.__cadStorage({ key: "library" }))).format).toBe("pathloom-library");
  const shape = await page.evaluate(() => window.__cadStorage({ key: "library" }));
  const commands = await page.evaluate(() => window.__cadStorage({ key: "commands" }));
  expect(JSON.parse(shape)).toMatchObject({ schemaVersion: 1, libraryType: "shape", entries: [] });
  expect(JSON.parse(commands)).toMatchObject({ schemaVersion: 1, libraryType: "command", entries: [] });

  await expect.poll(async () => {
    const raw = await page.evaluate(() => window.__cadStorage({ key: "project-recovery" }));
    return raw && JSON.parse(raw).format;
  }, { timeout: 15_000 }).toBe("pathloom-project-recovery");
  const recovery = JSON.parse(await page.evaluate(() => window.__cadStorage({ key: "project-recovery" })));
  expect(recovery.schemaVersion).toBe(1);
  expect(recovery.project.format).toBe("pathloom");
  expect(Array.isArray(recovery.project.sources)).toBe(true);
  expect(recovery.project.settings.printer).toBeTruthy();
});

test("P4-22: unknown project versions recover read-only and save an unchanged copy", async ({ page }) => {
  const future = {
    format: "pathloom",
    version: 77,
    sources: [{ id: "future-source", future: { keep: true } }],
    importedShapes: [],
    futureRoot: { untouched: [1, 2, 3] },
  };
  await page.addInitScript(async (project) => {
    await window.__cadStorage({
      key: "project-recovery",
      content: JSON.stringify({
        format: "pathloom-project-recovery",
        schemaVersion: 1,
        savedAt: "2026-11-01T14:55:00.000Z",
        project,
      }),
    });
  }, future);
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  const recovery = page.locator('dialog button[data-project-recovery="restore"]');
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect(page.locator('dialog button[data-read-only="copy"]')).toBeVisible();
  await expect(page.locator('dialog [data-read-only-reason]')).toContainText("project version 77");
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await page.locator('dialog button[data-read-only="copy"]').click();
  expect(await page.evaluate(() => window.__saved)).toEqual(future);
  expect(await page.evaluate(() => window.__cadStorage({ key: "project-recovery" }))).not.toBeNull();
});
