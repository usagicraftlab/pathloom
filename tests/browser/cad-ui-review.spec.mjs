import { test, expect } from "./fixtures/cad.mjs";

test("P3 UI review: icon workspace keeps editing in the contextual right panel", async ({ page }, info) => {
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
  await page.screenshot({ path: info.outputPath("workspace-idle.png") });

  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect(page.locator(".model-right")).toBeVisible();
  await expect(page.locator("#modelCommandSearch")).toBeHidden();
  await expect(page.locator("#modelCoordinate")).toBeHidden();
  await expect(page.locator("#modelPlane")).toBeHidden();
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
  await expect(page.locator("#modelCommit")).toBeHidden();
  await expect(page.getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /削除|操作を抑制/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("workspace-edit.png") });

  const object = page.locator("#modelOutliner .model-outline-select").first();
  await object.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "プロパティ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "生成で使用", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "削除", exact: true })).toBeVisible();
});

test("P3 reference planes highlight under the mouse and select the drawing plane directly", async ({ page }, info) => {
  await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    for (const Camera of [THREE.OrthographicCamera, THREE.PerspectiveCamera]) {
      const update = Camera.prototype.updateProjectionMatrix;
      Camera.prototype.updateProjectionMatrix = function (...args) {
        const result = update.apply(this, args);
        window.__planeCamera = this;
        return result;
      };
    }
    const cube = document.querySelector(".view-cube");
    cube.dataset.view = "top";
    cube.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    delete cube.dataset.view;
  });
  await expect.poll(() => page.evaluate(() => window.Pathloom.viewState().axis)).toBe("top");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const project = (point) => page.evaluate(async (point) => {
    const THREE = await import("/vendor/three/three.module.js");
    const camera = window.__planeCamera;
    camera.updateMatrixWorld(true);
    const p = new THREE.Vector3(...point).project(camera);
    const box = document.querySelector("#threeCanvas").getBoundingClientRect();
    return { x: box.left + (p.x + 1) * box.width / 2, y: box.top + (1 - p.y) * box.height / 2 };
  }, point);
  const first = await project([10, 10, 0]);
  await page.mouse.move(first.x, first.y);
  await expect(page.locator(".model-plane-tooltip")).toBeVisible();
  await expect(page.locator(".model-plane-tooltip")).toHaveText("平面を選択");
  await page.screenshot({ path: info.outputPath("plane-hover.png") });
  await page.mouse.click(first.x, first.y);
  await expect(page.locator(".model-plane-tooltip")).toBeHidden();
  const plane = JSON.parse(await page.getByRole("textbox", { name: "作業平面", exact: true }).inputValue());
  expect(plane).toEqual({ origin: [0,0,0], xAxis: [1,0,0], yAxis: [0,1,0] });
  const second = await project([20, 15, 0]);
  await page.mouse.click(second.x, second.y);
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toContainText("valid");
});
