import { test, expect } from "./fixtures/cad.mjs";

test("P3 UI review: icon workspace keeps editing in the contextual right panel", async ({ page }) => {
  await expect(page.locator(".model-right")).toBeHidden();
  for (const id of [
    "#modelUndo",
    "#modelRedo",
    "#modelCommandSearch",
    "#modelPreview",
    "#modelRetry",
    "#modelExportStep",
  ]) await expect(page.locator(id)).toBeHidden();

  const curveGroup = page.locator(".model-command-group").filter({ hasText: "カーブをつくる" });
  await expect(curveGroup).toHaveAttribute("open", "");
  await expect(curveGroup.locator(".model-command-group-buttons")).toHaveCSS("flex-direction", "column");
  await expect(page.locator(".model-left")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.locator(".model-right")).toBeVisible();
  await expect(page.getByRole("button", { name: "プレビュー", exact: true })).toBeHidden();
  await page.getByRole("textbox", { name: "基準点 XYZ", exact: true }).fill("[0,0,0]");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator(".model-right")).toBeHidden();

  const history = page.locator(".model-history-entry").first();
  await history.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "操作を抑制", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "履歴を削除", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "操作を抑制", exact: true }).click();
  await expect(history).toHaveAttribute("aria-label", /suppressed/);

  await history.click({ button: "right" });
  await page.getByRole("menuitem", { name: "操作の抑制を解除", exact: true }).click();
  await expect(history).toHaveAttribute("aria-label", /valid/);
  await history.dblclick();
  await expect(page.locator(".model-right")).toBeVisible();
  await expect(page.getByRole("button", { name: "設定変更を確定", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /削除|操作を抑制/ })).toHaveCount(0);

  const object = page.locator("#modelOutliner .model-outline-select").first();
  await object.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "プロパティ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "生成で使用", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "削除", exact: true })).toBeVisible();
});
