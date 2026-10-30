import { test, expect } from "./fixtures/cad.mjs";

async function commit(page, count) {
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(count);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await expect(page.locator("#modelStatus")).toContainText(
    "形状を確定しました",
  );
}
async function coordinate(page, value) {
  await page.locator("#modelCoordinate").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, value);
}
async function saveReopen(page) {
  await expect(page.locator("#cadStatus")).toContainText("layers");
  await page.evaluate(() => {
    window.__saved = null;
    document.querySelector("#projectSave").click();
  });
  await expect.poll(() => page.evaluate(() => window.__saved?.version)).toBe(2);
  await page.evaluate(() => {
    window.__oldDrawingDocument = window.PathloomModel.store.document;
    document.querySelector("#projectOpen").click();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.PathloomModel.store.document !== window.__oldDrawingDocument,
      ),
    )
    .toBe(true);
}
// Read the active camera for screen projection; all drawing/picking still uses
// real mouse events, ray-plane intersections and the real OCCT daemon.
async function axis(page, name = "top") {
  await page.evaluate(async () => {
    if (window.__drawingCameraHook) return;
    window.__drawingCameraHook = true;
    const THREE = await import("/vendor/three/three.module.js");
    for (const Camera of [THREE.OrthographicCamera, THREE.PerspectiveCamera]) {
      const update = Camera.prototype.updateProjectionMatrix;
      Camera.prototype.updateProjectionMatrix = function (...args) {
        const result = update.apply(this, args);
        window.__drawingCamera = this;
        return result;
      };
    }
  });
  // Some cube faces are hidden in an exactly axial view. Use the existing cube
  // action to set up the camera; drawing and picking below use actual mouse IO.
  await page.evaluate((name) => {
    const cube = document.querySelector(".view-cube");
    cube.dataset.view = name;
    cube.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    delete cube.dataset.view;
  }, name);
  await expect
    .poll(() => page.evaluate(() => window.Pathloom.viewState().axis))
    .toBe(name);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function screen(page, point) {
  return page.evaluate(async (point) => {
    const THREE = await import("/vendor/three/three.module.js");
    const camera = window.__drawingCamera;
    camera.updateMatrixWorld(true);
    const p = new THREE.Vector3(...point).project(camera);
    const box = document.querySelector("#threeCanvas").getBoundingClientRect();
    return {
      x: box.left + ((p.x + 1) * box.width) / 2,
      y: box.top + ((1 - p.y) * box.height) / 2,
      worldPerPixel: (camera.top - camera.bottom) / camera.zoom / box.height,
    };
  }, point);
}
async function clickWorld(page, point, offset = 0) {
  const p = await screen(page, point);
  await page.mouse.move(p.x + offset, p.y);
  await page.mouse.click(p.x + offset, p.y);
  return p;
}
const lastFeature = (page) =>
  page.evaluate(() =>
    structuredClone(window.PathloomModel.store.document.features.at(-1)),
  );

test("P1-05 Rectangle center/two-corner/three-point modes preserve geometry, mode, Undo and Save", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "基準点 XYZ", exact: true })
    .fill("[10,20,0]");
  await commit(page, 1);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].bbox,
    ),
  ).toEqual({ min: [-20, 0, 0], max: [40, 40, 0] });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("twoCorners");
  await page.getByLabel("作図点 1 XYZ").fill("[40,30,0]");
  await page.getByLabel("作図点 2 XYZ").fill("[10,10,0]");
  await commit(page, 2);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities.at(-1).bbox,
    ),
  ).toEqual({ min: [10, 10, 0], max: [40, 30, 0] });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("threePoints");
  for (const [i, p] of [
    [0, 0, -10],
    [10, 0, -10],
    [4, 0, 10],
  ].entries())
    await page.getByLabel(`作図点 ${i + 1} XYZ`).fill(JSON.stringify(p));
  await commit(page, 3);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities.at(-1).bbox,
    ),
  ).toEqual({ min: [0, 0, -10], max: [10, 0, 10] });
  await page.keyboard.press("Control+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await saveReopen(page);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.features.map((f) => f.command.mode),
    ),
  ).toEqual(["center", "twoCorners", "threePoints"]);
  expect((await lastFeature(page)).parameters.plane).toEqual({
    origin: [0, 0, -10],
    xAxis: [1, 0, 0],
    yAxis: [0, 0, 1],
  });
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities.at(-1).bbox.min[2],
    ),
  ).toBe(-10);
});

test("P1-05 Line/Polyline relative XYZ, Circle radius, Move units and focused keys", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.locator("#modelCoordinate").evaluate((input) => {
    input.value = "999,0,0";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
  });
  await coordinate(page, "-5,0,-5");
  await coordinate(page, "@10,0,2");
  await commit(page, 1);
  expect((await lastFeature(page)).parameters).toMatchObject({
    start: [-5, 0, -5],
    end: [5, 0, -3],
  });
  await page.getByRole("button", { name: "Polyline", exact: true }).click();
  for (const text of ["0,0,-5", "@10,0,2", "@0,10,0"])
    await coordinate(page, text);
  await page.locator("#modelCoordinate").evaluate((input) => input.blur());
  await page.keyboard.press("Backspace");
  await coordinate(page, "@0,8,0");
  await commit(page, 2);
  expect((await lastFeature(page)).parameters.points).toEqual([
    [0, 0, -5],
    [10, 0, -3],
    [10, 8, -3],
  ]);
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await coordinate(page, "-10,5,2");
  await coordinate(page, "@4,0,0");
  await commit(page, 3);
  expect((await lastFeature(page)).parameters.radiusMm).toBe(4);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByLabel("移動 X mm", { exact: true }).fill("1cm");
  await page.getByLabel("移動 X mm", { exact: true }).fill("10c");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await page.getByLabel("移動 X mm", { exact: true }).fill("2cm");
  await page.getByLabel("移動 X mm", { exact: true }).press("Control+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await page.getByLabel("移動 X mm", { exact: true }).fill("1cm");
  await page.getByLabel("移動 Z mm", { exact: true }).fill("-2");
  const y = page.getByLabel("移動 Y mm", { exact: true });
  await y.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await y.fill("0");
  await y.press("Enter");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await commit(page, 4);
  const bbox = await page.evaluate(
    () => window.PathloomModel.store.document.entities.at(-1).bbox,
  );
  for (const [i, v] of [-4, 1, 0].entries())
    expect(bbox.min[i]).toBeCloseTo(v, 5);
  for (const [i, v] of [4, 9, 0].entries())
    expect(bbox.max[i]).toBeCloseTo(v, 5);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.locator("#modelCoordinate").evaluate((input) => input.blur());
  await page.keyboard.press("Escape");
  await expect(page.locator(".model-right")).toBeHidden();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
});

test("P1-05 real clicks, endpoint/center snap, Shift selection and single-object Move", async ({
  page,
}) => {
  await axis(page);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await clickWorld(page, [-35, -15, 0]);
  await clickWorld(page, [-15, -15, 0]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator("#modelStatus")).toContainText(
    "形状を確定しました",
  );
  const line = await lastFeature(page);
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await clickWorld(page, line.parameters.end, 3);
  await clickWorld(page, [-8, -15, 0]);
  await commit(page, 2);
  expect((await lastFeature(page)).parameters.center).toEqual(
    line.parameters.end,
  );
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("twoCorners");
  await clickWorld(page, [0, -5, 0]);
  await clickWorld(page, [20, 15, 0]);
  await commit(page, 3);
  const rectangle = await lastFeature(page),
    p = rectangle.parameters;
  const center = p.anchor.map(
    (v, i) =>
      v + (p.widthMm * p.plane.xAxis[i] + p.heightMm * p.plane.yAxis[i]) / 2,
  );
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await clickWorld(page, center, 3);
  await clickWorld(page, [30, 5, 0]);
  await commit(page, 4);
  expect((await lastFeature(page)).parameters.start).toEqual(center);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.locator("#modelSnap").uncheck();
  await clickWorld(page, center, 3);
  await clickWorld(page, [30, 25, 0]);
  await commit(page, 5);
  expect(
    Math.hypot(
      ...(await lastFeature(page)).parameters.start.map(
        (v, i) => v - center[i],
      ),
    ),
  ).toBeGreaterThan(0.05);
  const mid = line.parameters.start.map(
    (v, i) => (v + line.parameters.end[i]) / 2,
  );
  await clickWorld(page, mid);
  const pick = page.getByRole("dialog").filter({ hasText: "重なっている対象" });
  if (await pick.isVisible())
    await pick
      .getByRole("button", { name: "Line · curve", exact: true })
      .click();
  await page.keyboard.down("Shift");
  await clickWorld(page, [20, 5, 0]);
  await page.keyboard.up("Shift");
  if (await pick.isVisible())
    await pick
      .getByRole("button", { name: "Rectangle · curve", exact: true })
      .click();
  const selected = await page.evaluate(() =>
    window.PathloomModel.store.document.uiState.selection.map(
      (r) => r.entityId,
    ),
  );
  expect(new Set(selected).size).toBe(2);
  await page.keyboard.down("Shift");
  await clickWorld(page, [20, 5, 0]);
  await page.keyboard.up("Shift");
  if (await pick.isVisible())
    await pick
      .getByRole("button", { name: "Rectangle · curve", exact: true })
      .click();
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.uiState.selection.length,
    ),
  ).toBe(1);
  await page.keyboard.down("Shift");
  await clickWorld(page, [20, 5, 0]);
  await page.keyboard.up("Shift");
  if (await pick.isVisible())
    await pick
      .getByRole("button", { name: "Rectangle · curve", exact: true })
      .click();
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.uiState.selection.length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.locator("#modelStatus")).toContainText("1件");
  await expect(
    page.getByLabel("CAD input object", { exact: true }),
  ).toHaveValue("");
  const id = rectangle.outputSlots[0].entityId;
  await page
    .getByLabel("CAD input object", { exact: true })
    .selectOption(JSON.stringify({ entityId: id, role: "object" }));
  await page.getByLabel("移動 X mm", { exact: true }).fill("3");
  await page.getByLabel("移動 Y mm", { exact: true }).fill("0");
  await page.getByLabel("移動 Z mm", { exact: true }).fill("0");
  await commit(page, 6);
  expect((await lastFeature(page)).inputs.object[0].entityId).toBe(id);
});

test("P1-05 arbitrary work planes drive real clicks and feed the E06 plane contract", async ({
  page,
}) => {
  await page.locator("#modelSnap").uncheck();
  const planes = [
    { origin: [2, 3, 7], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
    { origin: [2, 3, 7], xAxis: [1, 0, 0], yAxis: [0, 0, 1] },
    { origin: [2, 3, 7], xAxis: [0, 1, 0], yAxis: [0, 0, 1] },
    {
      origin: [2, 3, -7],
      xAxis: [1, 0, 0],
      yAxis: [0, Math.cos(0.4), Math.sin(0.4)],
    },
  ];
  for (const [i, plane] of planes.entries()) {
    await axis(page, ["top", "front", "right", "top"][i]);
    if (i < 3)
      await page.locator("#modelPlane").evaluate((select, value) => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, ["XY", "XZ", "YZ"][i]);
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    if (i < 3) {
      const initial = JSON.parse(
        await page
          .getByRole("textbox", { name: "作業平面", exact: true })
          .inputValue(),
      );
      expect(initial).toEqual({ ...plane, origin: [0, 0, 0] });
    }
    await page
      .getByRole("textbox", { name: "作業平面", exact: true })
      .fill(JSON.stringify(plane));
    const pixel = await clickWorld(page, plane.origin);
    const corner = plane.origin.map(
      (v, j) => v + 10 * plane.xAxis[j] + 5 * plane.yAxis[j],
    );
    await clickWorld(page, corner);
    await commit(page, i + 1);
    const f = await lastFeature(page);
    // Screen pointer coordinates are quantized; numerical-entry fixtures above
    // check exact dimensions, while mouse fixtures use the camera's pixel scale.
    expect(
      Math.hypot(...f.parameters.anchor.map((v, j) => v - plane.origin[j])),
    ).toBeLessThan(2 * pixel.worldPerPixel);
    expect(Math.abs(f.parameters.widthMm - 20)).toBeLessThan(
      5 * pixel.worldPerPixel,
    );
    expect(Math.abs(f.parameters.heightMm - 10)).toBeLessThan(
      5 * pixel.worldPerPixel,
    );
  }
  await page.locator(".model-history-entry").last().click();
  const source = await page.evaluate(
    () =>
      window.PathloomModel.store.document.entities.at(-1).displayCache.lengthMm,
  );
  await page.getByRole("button", { name: "Offset Curve", exact: true }).click();
  const plane = planes.at(-1);
  await page
    .getByRole("textbox", { name: "作業平面", exact: true })
    .fill(JSON.stringify(plane));
  await commit(page, 5);
  expect(
    await page.evaluate(
      () =>
        window.PathloomModel.store.document.entities.at(-1).displayCache
          .lengthMm,
    ),
  ).toBeCloseTo(source + 2 * Math.PI, 4);
  await page.locator(".model-history-entry").first().click();
  await page.getByRole("button", { name: "Offset Curve", exact: true }).click();
  await page
    .getByRole("textbox", { name: "作業平面", exact: true })
    .fill(
      JSON.stringify({ origin: [2, 3, 8], xAxis: [1, 0, 0], yAxis: [0, 1, 0] }),
    );
  await page.locator("#modelPreview").evaluate((button) => button.click());
  await expect(page.locator("#modelDiagnostics")).toContainText(
    "CAD_INPUT_TYPE",
  );
  await expect(page.locator(".model-history-entry")).toHaveCount(5);
});

test("P1-05 constrained rectangle preserves lastValid through nonconvergence, Undo and Save", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "基準点 XYZ", exact: true })
    .fill("[10,20,0]");
  await commit(page, 1);
  await page.locator(".model-history-entry").click();
  await page
    .getByRole("button", { name: "拘束付きスケッチとして編集", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.PathloomModel.store.document.sketches.length),
    )
    .toBe(1);
  await page
    .getByRole("spinbutton", { name: "スケッチ 幅", exact: true })
    .fill("80");
  await page
    .getByRole("spinbutton", { name: "スケッチ 幅", exact: true })
    .press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0].bbox.max[0],
      ),
    )
    .toBeCloseTo(50, 5);
  const stable = await page.evaluate(() => {
    const d = window.PathloomModel.store.document;
    return {
      hash: d.entities[0].geometry.assetHash,
      constraints: structuredClone(d.sketches[0].constraints),
    };
  });
  const conflicting = structuredClone(stable.constraints),
    width = conflicting.find((c) => c.kind === "distanceU");
  conflicting.push({ ...width, id: "fixture-conflicting-width", value: 20 });
  await page
    .getByText("拘束を追加・修正（構造化定義）", { exact: true })
    .click();
  await page.getByLabel("スケッチ拘束定義").fill(JSON.stringify(conflicting));
  await page
    .getByRole("button", { name: "拘束を検証して解く", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.PathloomModel.store.document.sketches[0].solveReport.status,
      ),
    )
    .toBe("no-convergence");
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].geometry.assetHash,
    ),
  ).toBe(stable.hash);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.sketches[0].draft || null,
      ),
    )
    .toBeNull();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0].bbox.max[0],
      ),
    )
    .toBeCloseTo(40, 5);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0].bbox.max[0],
      ),
    )
    .toBeCloseTo(50, 5);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.PathloomModel.store.document.sketches[0].solveReport.status,
      ),
    )
    .toBe("no-convergence");
  await saveReopen(page);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].geometry.assetHash,
    ),
  ).toBe(stable.hash);
  expect(
    await page.evaluate(
      () => !!window.PathloomModel.store.document.sketches[0].draft,
    ),
  ).toBe(true);
  const bbox = await page.evaluate(
    () => window.PathloomModel.store.document.entities[0].bbox,
  );
  for (const [key, expected] of [
    ["min", [-30, 0, 0]],
    ["max", [50, 40, 0]],
  ])
    expected.forEach((v, i) => expect(bbox[key][i]).toBeCloseTo(v, 6));
});

test("P1-05 postselection, hidden/locked objects and snap exclusion", async ({
  page,
}) => {
  await axis(page);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await commit(page, 1);
  const rectangle = await lastFeature(page);
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await coordinate(page, "45,0,0");
  await coordinate(page, "@5,0,0");
  await commit(page, 2);
  const circle = await lastFeature(page);
  await clickWorld(page, [-30, 0, 0]);
  await page.getByRole("button", { name: "ロック", exact: true }).click();
  expect(
    await page.evaluate(
      (id) => window.PathloomModel.store.getEntity(id).locked,
      rectangle.outputSlots[0].entityId,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.getByLabel("CAD input object", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await clickWorld(page, [0, 0, 0], 3);
  await clickWorld(page, [5, 10, 0]);
  await commit(page, 3);
  expect(
    Math.hypot(...(await lastFeature(page)).parameters.start),
  ).toBeGreaterThan(0.05);
  await clickWorld(page, [50, 0, 0]);
  await page.getByRole("button", { name: "非表示", exact: true }).click();
  expect(
    await page.evaluate(
      (id) => window.PathloomModel.store.getEntity(id).visibility,
      circle.outputSlots[0].entityId,
    ),
  ).toBe("hidden");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.getByLabel("CAD input object", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await clickWorld(page, [70, 30, 0]);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.uiState.selection,
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await clickWorld(page, [3, 6, 0]);
  const input = page.getByLabel("CAD input object", { exact: true });
  await expect(input).not.toHaveValue("");
  await page.getByLabel("移動 X mm", { exact: true }).fill("1");
  await commit(page, 4);
});

test("P1-05 mouse Polyline/three-point Rectangle and invalid Circle/plane input", async ({
  page,
}) => {
  await axis(page);
  await page.locator("#modelSnap").uncheck();
  await page.getByRole("button", { name: "Polyline", exact: true }).click();
  for (const point of [
    [-60, 30, 0],
    [-45, 30, 0],
    [-45, 45, 0],
  ])
    await clickWorld(page, point);
  await page.getByRole("checkbox", { name: "閉じる", exact: true }).check();
  await commit(page, 1);
  expect((await lastFeature(page)).parameters.points).toHaveLength(3);
  expect((await lastFeature(page)).parameters.closed).toBe(true);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("threePoints");
  const pixel = await clickWorld(page, [10, -30, 0]);
  await clickWorld(page, [30, -30, 0]);
  await clickWorld(page, [14, -10, 0]);
  await commit(page, 2);
  const rectangle = await lastFeature(page);
  expect(rectangle.command.mode).toBe("threePoints");
  expect(Math.abs(rectangle.parameters.widthMm - 20)).toBeLessThan(
    2 * pixel.worldPerPixel,
  );
  expect(Math.abs(rectangle.parameters.heightMm - 20)).toBeLessThan(
    2 * pixel.worldPerPixel,
  );
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page.getByRole("textbox", { name: "中心 XYZ", exact: true }).fill("[");
  // Hold an older, valid preview across rejected point input. It must not
  // replace the error with a success message when its real OCCT reply arrives.
  await page.evaluate(() => {
    const invoke = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = async (name, args) => {
      if (
        name === "cad_evaluate" &&
        args.request.intent === "preview" &&
        args.request.operation.id === "curve.circle" &&
        !window.__heldCirclePreview
      ) {
        window.__heldCirclePreview = true;
        await new Promise((resolve) => {
          window.__releaseCirclePreview = resolve;
        });
      }
      return invoke(name, args);
    };
  });
  await coordinate(page, "-20,0,0");
  await expect(
    page.getByRole("textbox", { name: "中心 XYZ", exact: true }),
  ).toHaveValue("[-20,0,0]");
  await expect
    .poll(() => page.evaluate(() => !!window.__releaseCirclePreview))
    .toBe(true);
  await coordinate(page, "@0,0,0");
  await expect(page.locator("#modelStatus")).toContainText("中心から離して");
  await coordinate(page, "-16,0,1");
  await expect(page.locator("#modelStatus")).toContainText("同じ平面");
  await page.evaluate(() => window.__releaseCirclePreview());
  await expect
    .poll(() =>
      page.evaluate(() => window.PathloomModel.store.native.jobs.size),
    )
    .toBe(0);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator("#modelStatus")).toContainText("同じ平面");
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await coordinate(page, "-16,0,0");
  const radius = page.getByRole("textbox", { name: "半径 mm", exact: true });
  await radius.fill("0");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator("#modelDiagnostics")).toContainText(
    "CAD_INPUT_DEGENERATE",
  );
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await page.getByRole("textbox", { name: "半径 mm", exact: true }).fill("4");
  await commit(page, 3);
  await page.locator("#modelSnap").check();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await clickWorld(page, [-20, 0, 0], 3);
  await clickWorld(page, [-5, 10, 0]);
  await commit(page, 4);
  expect((await lastFeature(page)).parameters.start).toEqual([-20, 0, 0]);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("threePoints");
  for (const [i, p] of [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ].entries())
    await page.getByLabel(`作図点 ${i + 1} XYZ`).fill(JSON.stringify(p));
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator("#modelStatus")).toContainText("一直線");
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "作業平面", exact: true })
    .fill(
      JSON.stringify({ origin: [0, 0, 0], xAxis: [0, 0, 0], yAxis: [0, 1, 0] }),
    );
  await page.locator("#modelPreview").evaluate((button) => button.click());
  await expect(page.locator("#modelDiagnostics")).toContainText(
    "CAD_INPUT_DEGENERATE",
  );
  await coordinate(page, "1,2");
  await expect(page.locator("#modelStatus")).toContainText(
    "直交する単位ベクトル",
  );
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await page.locator("#modelPlane").evaluate((select) => {
    select.value = "XZ";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page
    .getByRole("textbox", { name: "中心 XYZ", exact: true })
    .fill("[10,0,-3]");
  await coordinate(page, "@4,0,0");
  await commit(page, 5);
  expect((await lastFeature(page)).parameters).toMatchObject({
    center: [10, 0, -3],
    radiusMm: 4,
  });
});
