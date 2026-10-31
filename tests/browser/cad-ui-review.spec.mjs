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
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().ghostEntityIds.length)).toBe(1);

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
  await page.getByRole("button", { name: "top view", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const project = (point) => page.evaluate((point) => window.PathloomModel.projectPoint(point), point);
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

test("P3 review additions expose view, panel, command and outliner controls", async ({ page }) => {
  await expect(page.getByRole("button", { name: "top view", exact: true })).toBeVisible();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
  await expect(page.locator("body")).toHaveClass(/model-panels-hidden/);
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
  await expect(page.locator("body")).not.toHaveClass(/model-panels-hidden/);

  const rectangle = page.getByRole("button", { name: "Rectangle", exact: true }).first();
  await page.getByRole("button", { name: "配置編集", exact: true }).click();
  await expect(page.getByRole("button", { name: "配置編集", exact: true })).toHaveAttribute("aria-pressed", "true");
  await rectangle.click({ button: "right" });
  await expect(page.getByRole("region", { name: "ピン留めしたコマンド" })).toBeVisible();
  await page.getByRole("button", { name: "配置編集", exact: true }).click();

  await rectangle.click();
  await page.getByRole("textbox", { name: "基準点 XYZ", exact: true }).fill("[0,0,0]");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  const outliner = page.locator("#modelOutliner .model-outline-select").first();
  await outliner.dblclick();
  const rename = page.getByRole("textbox", { name: "アウトライナー形状名" });
  await rename.fill("レビュー形状");
  await rename.press("Enter");
  await expect(page.locator("#modelOutliner")).toContainText("レビュー形状");
  const color = page.getByLabel("レビュー形状の色タグ");
  await color.fill("#cc5500");
  await expect(color).toHaveValue("#cc5500");
  await page.getByRole("button", { name: "サムネイル表示切替" }).click();
  await expect(page.locator(".model-outline-thumbnail")).toHaveCount(0);
});

test("P3 automatic extrusion composes existing boolean commands as one Undo unit", async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const store = window.PathloomModel.store;
    const add = async (id, parameters = {}, selection = []) => {
      const command = commandById(id);
      const session = createCommandSession(command, { selection });
      Object.assign(session.parameters, parameters);
      if (!await store.add(session)) throw new Error(JSON.stringify(session.diagnostics));
      const feature = store.document.features.at(-1);
      return store.getEntity(feature.outputSlots[0].entityId);
    };
    await add("B01", { anchor: [0, 0, 0], widthMm: 10, depthMm: 10, heightMm: 10 });
    const rectangle = await add("C04", { anchorMode: "corner", anchor: [2, 2, 0], widthMm: 4, heightMm: 4 });
    const region = await add("S03", {}, [{ entityId: rectangle.id, entityKind: rectangle.kind }]);
    return { region: region.id };
  });
  await page.getByRole("button", { name: "Extrude Surface", exact: true }).click();
  await page.getByLabel("CAD input profile", { exact: true }).selectOption(
    await page.getByLabel("CAD input profile", { exact: true }).locator("option").evaluateAll(
      (options, entityId) => options.find((option) => {
        try { return JSON.parse(option.value).entityId === entityId; } catch { return false; }
      }).value,
      ids.region,
    ),
  );
  await page.locator('[data-parameter="distanceMm"]').fill("5");
  await page.evaluate(() => {
    const store = window.PathloomModel.store;
    const originalRecompute = store.recompute.bind(store);
    const originalUndo = store.transactions.undo.bind(store.transactions);
    const originalRedo = store.transactions.redo.bind(store.transactions);
    let releaseUnion;
    const unionGate = new Promise((resolve) => { releaseUnion = resolve; });
    window.__pathloomCompositeCommitProbe = {
      started: false,
      undoCalls: 0,
      redoCalls: 0,
      release: releaseUnion,
    };
    store.recompute = async (...args) => {
      if (!window.__pathloomCompositeCommitProbe.started &&
          store.document.features.at(-1)?.operation.id === "solid.union") {
        window.__pathloomCompositeCommitProbe.started = true;
        await unionGate;
      }
      return originalRecompute(...args);
    };
    store.transactions.undo = () => {
      window.__pathloomCompositeCommitProbe.undoCalls += 1;
      return originalUndo();
    };
    store.transactions.redo = () => {
      window.__pathloomCompositeCommitProbe.redoCalls += 1;
      return originalRedo();
    };
  });
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__pathloomCompositeCommitProbe.started)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(5);
  await expect.poll(() => page.evaluate(() =>
    window.PathloomModel.store.document.features.slice(-2).map((feature) => feature.operation.id),
  )).toEqual(["shape.extrude", "solid.union"]);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(5);
  await expect.poll(() => page.evaluate(() => ({
    undo: window.__pathloomCompositeCommitProbe.undoCalls,
    redo: window.__pathloomCompositeCommitProbe.redoCalls,
  }))).toEqual({ undo: 0, redo: 0 });
  await page.evaluate(() => window.__pathloomCompositeCommitProbe.release());
  await expect.poll(() => page.evaluate(() => ({
    undo: window.__pathloomCompositeCommitProbe.undoCalls,
    redo: window.__pathloomCompositeCommitProbe.redoCalls,
  }))).toEqual({ undo: 1, redo: 1 });
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(5);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(3);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.features.length)).toBe(5);
});
