import { test, expect } from "./fixtures/cad.mjs";

async function add(page, commandId, parameters = {}, selection = []) {
  return page.evaluate(async ({ commandId, parameters, selection }) => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const store = window.PathloomModel.store;
    const session = createCommandSession(commandById(commandId), { selection });
    Object.assign(session.parameters, parameters);
    if (!await store.add(session)) throw new Error(JSON.stringify(session.diagnostics));
    const feature = store.document.features.at(-1);
    return structuredClone(store.getEntity(feature.outputSlots[0].entityId));
  }, { commandId, parameters, selection });
}
async function select(page, entity) {
  const row = page.locator(`.model-outline-body[data-body-id="${entity.bodyId}"] .model-outline-select`);
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
}
async function drag(page, locator, delta, { cancel = false, shift = false, alt = false } = {}) {
  const rect = await locator.boundingBox();
  expect(rect).toBeTruthy();
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  if (shift) await page.keyboard.down("Shift");
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y, { steps: 6 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  if (alt) await page.keyboard.up("Alt");
}
async function last(page) {
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  return page.evaluate(() => {
    const store = window.PathloomModel.store, feature = store.document.features.at(-1);
    return { feature: structuredClone(feature), entity: structuredClone(store.getEntity(feature.outputSlots[0].entityId)) };
  });
}
async function clickWorld(page, point) {
  const projected = await page.evaluate((point) => window.PathloomModel.projectPoint(point), point);
  await page.mouse.move(projected.x, projected.y);
  await page.mouse.click(projected.x, projected.y);
}
async function input(page, key, entityId) {
  const field = page.getByLabel(`CAD input ${key}`, {exact:true});
  const value = await field.locator("option").evaluateAll((options, entityId) => options.find((option) => {
    try { return JSON.parse(option.value).entityId === entityId; } catch { return false; }
  }).value, entityId);
  await field.selectOption(value);
}

test("P3 axis/uniform scale handles, pivot, Move copy and drag-Esc preserve exact history", async ({page}, info) => {
  const box = await add(page, "B01", {widthMm:10,depthMm:20,heightMm:30});
  await select(page, box);
  await page.screenshot({path:info.outputPath("direct-controls.png")});
  await drag(page, page.locator('[data-gizmo="scale"][data-axis="X"]'), 50);
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  let result = await last(page);
  expect(result.feature.command.version).toBe(2);
  expect(result.feature.parameters.axisFactors).toEqual([1.5,1,1]);
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(9000,5);
  // OCCT's general-transform bounds carry the normal 1e-7 bounding margin.
  for (const [axis, value] of [-2.5,0,0].entries()) expect(result.entity.bbox.min[axis]).toBeCloseTo(value,6);
  for (const [axis, value] of [12.5,20,30].entries()) expect(result.entity.bbox.max[axis]).toBeCloseTo(value,6);
  await page.evaluate(async () => {
    const model=window.PathloomModel;
    const snapshot=await model.snapshot();
    model.restorePrepared(await model.prepareRestore(snapshot));
  });
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  result=await last(page);
  expect(result.feature.command.version).toBe(2);
  expect(result.feature.parameters.axisFactors).toEqual([1.5,1,1]);
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(9000,5);
  await select(page, result.entity);
  const before = result.entity.geometry.assetHash;
  await drag(page, page.locator('[data-gizmo="rotate"][data-axis="Z"]'), 32, {cancel:true});
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  result = await last(page);
  expect(result.entity.geometry.assetHash).toBe(before);
  await select(page, result.entity);
  await page.keyboard.down("Control");
  await drag(page, page.locator('[data-gizmo="move"][data-axis="X"]'), 30);
  await page.keyboard.up("Control");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  result = await last(page);
  expect(result.feature.resultPolicy).toBe("independent");
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(9000,5);
  await expect(page.locator(".model-outline-body")).toHaveCount(2);
});

test("P3 array preview/commit retains original and returns all copies in one Undo", async ({page}) => {
  const box = await add(page, "B01", {widthMm:10,depthMm:10,heightMm:10});
  await select(page, box);
  await page.getByRole("button", {name:"配列コピー",exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().addedPreviewCount)).toBe(2);
  await page.getByRole("button", {name:"作成",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await last(page);
  await expect(page.locator(".model-outline-body")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
});

test("P3 visibility/isolate, folders, inline dimension and shortcut help remain usable", async ({page}) => {
  const first = await add(page, "B01", {widthMm:10,depthMm:10,heightMm:10});
  const second = await add(page, "B01", {anchor:[30,0,0],widthMm:5,depthMm:5,heightMm:5});
  await select(page, first);
  await page.keyboard.press("h");
  await expect.poll(() => page.evaluate((id) => window.PathloomModel.store.getEntity(id).visibility, first.id)).toBe("hidden");
  expect(await page.evaluate((id) => window.PathloomModel.displayState().entityIds.includes(id), first.id)).toBe(false);
  await page.keyboard.press("Shift+H");
  await page.keyboard.press("i");
  await expect.poll(() => page.evaluate((id) => window.PathloomModel.store.getEntity(id).visibility, second.id)).toBe("hidden");
  await page.keyboard.press("Shift+H");
  await page.getByRole("button", {name:"選択形状をグループ化",exact:true}).click();
  await expect(page.locator(".model-outline-folder .model-outline-body")).toHaveCount(1);
  await page.locator('.model-projected-dimensions [data-dimension="widthMm"]').dblclick();
  const dimension = page.getByRole("textbox", {name:"3D寸法を編集",exact:true});
  await dimension.fill("15"); await dimension.press("Enter");
  await expect.poll(() => page.evaluate((id) => window.PathloomModel.store.getEntity(id).bbox.max[0], first.id)).toBe(15);
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().originVisible)).toBe(true);
  await page.evaluate(() => document.dispatchEvent(new Event("pathloom:cad-help")));
  await expect(page.locator(".model-shortcut-list")).toContainText("Shift+H");
});

test("P3 history hover/scrub shows consumed earlier geometry without changing saved document or binding", async ({page}) => {
  const box = await add(page, "B01", {widthMm:10,depthMm:10,heightMm:10});
  const moved = await add(page, "transform.move", {translation:[25,0,0]}, [{entityId:box.id,entityKind:box.kind}]);
  await page.evaluate(() => { window.__historyBefore = JSON.stringify(window.PathloomModel.store.document); });
  await page.locator(".model-history-entry").first().hover();
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().entityIds)).toEqual([box.id]);
  const slider = page.getByRole("slider", {name:"履歴表示位置",exact:true});
  await slider.fill("0"); await slider.dispatchEvent("change");
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().entityIds)).toEqual([box.id]);
  expect(await page.evaluate(() => JSON.stringify(window.PathloomModel.store.document) === window.__historyBefore)).toBe(true);
  await slider.dblclick();
  await expect.poll(() => page.evaluate(() => window.PathloomModel.displayState().entityIds)).toEqual([moved.id]);
});

test("P3 Polyline closes by start snap into a real planar face; two-click measurement shows distance", async ({page}) => {
  await page.getByRole("button", {name:"top view",exact:true}).click();
  await page.getByRole("button", {name:"Polyline",exact:true}).click();
  for (const point of [[-20,-15,0],[-10,-15,0],[-10,-5,0]]) await clickWorld(page, point);
  const start = await page.evaluate(() => window.PathloomModel.projectPoint([-20,-15,0]));
  await page.mouse.move(start.x,start.y);
  await expect(page.locator("#modelStatus")).toContainText("閉じる");
  await page.mouse.click(start.x,start.y);
  await page.getByRole("button", {name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  const result = await last(page);
  expect(result.entity.kind).toBe("surface");
  expect(result.entity.displayCache.areaMm2).toBeCloseTo(50,5);
  await page.getByRole("button", {name:"2点の距離を測定",exact:true}).click();
  await clickWorld(page, [-20,-15,0]); await clickWorld(page, [-10,-15,0]);
  await expect(page.getByLabel("測定距離",{exact:true})).toHaveText("10.000 mm");
});

test("P3 Extrude direction switches to exact Difference and multiple body overlap stays plain Extrude", async ({page}) => {
  const body = await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  const rectangle = await add(page,"C04",{anchorMode:"corner",anchor:[2,2,10],widthMm:4,heightMm:4});
  const region = await add(page,"S03",{},[{entityId:rectangle.id,entityKind:rectangle.kind}]);
  await page.getByRole("button",{name:"Extrude Surface",exact:true}).click(); await input(page,"profile",region.id);
  await page.locator('[data-parameter="distanceMm"]').fill("-5");
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(5);
  let result = await last(page);
  expect(result.feature.operation.id).toBe("solid.difference");
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(920,5);
  expect(result.feature.inputs.arguments[0].entityId).toBe(body.id);
  await add(page,"B01",{anchor:[4,0,0],widthMm:10,depthMm:10,heightMm:10});
  const wide = await add(page,"C04",{anchorMode:"corner",anchor:[1,1,0],widthMm:10,heightMm:8});
  const face = await add(page,"S03",{},[{entityId:wide.id,entityKind:wide.kind}]);
  await page.getByRole("button",{name:"Extrude Surface",exact:true}).click(); await input(page,"profile",face.id);
  await page.locator('[data-parameter="distanceMm"]').fill("5");
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(9);
  result = await last(page);
  expect(result.feature.operation.id).toBe("shape.extrude");
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(400,5);
  await expect(page.locator("#modelStatus")).toContainText("複数body");
});

test("P3 numeric wheel, Enter navigation, symmetric arrow and Esc keep draft separate", async ({page}) => {
  const rectangle = await add(page,"C04",{widthMm:10,heightMm:10,anchor:[0,0,0]});
  const face = await add(page,"S03",{},[{entityId:rectangle.id,entityKind:rectangle.kind}]);
  await page.getByRole("button",{name:"Extrude Surface",exact:true}).click(); await input(page,"profile",face.id);
  const distance = page.locator('[data-parameter="distanceMm"]');
  await distance.hover(); await page.mouse.wheel(0,-100); await expect(distance).toHaveValue("11");
  await distance.press("Enter"); await expect(page.locator('[data-parameter="bothSides"]')).toBeFocused();
  await drag(page,page.getByRole("button",{name:"対称押し出しをドラッグ",exact:true}),9);
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  const result = await last(page);
  expect(result.feature.parameters.bothSides).toBe(true);
  expect(result.entity.bbox.min[2]).toBeCloseTo(-10,6);
  expect(result.entity.bbox.max[2]).toBeCloseTo(10,6);
});

test("P3 direction-based range selection uses enclosed versus touching projected geometry", async ({page}) => {
  const body = await add(page,"B01",{anchor:[-20,-20,0],widthMm:20,depthMm:20,heightMm:10});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  const points = await page.evaluate(() => [[-25,-25,10],[-10,-10,10]].map((point) => window.PathloomModel.projectPoint(point)));
  const left = Math.min(points[0].x,points[1].x), right = Math.max(points[0].x,points[1].x);
  const top = Math.min(points[0].y,points[1].y), bottom = Math.max(points[0].y,points[1].y);
  await page.mouse.move(left,top); await page.mouse.down(); await page.mouse.move(right,bottom,{steps:5}); await page.mouse.up();
  expect(await page.evaluate(() => window.PathloomModel.store.document.uiState.selection)).toEqual([]);
  await page.mouse.move(right,top); await page.mouse.down(); await page.mouse.move(left,bottom,{steps:5}); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.uiState.selection.map((reference) => reference.entityId))).toEqual([body.id]);
});

test("P3 adaptive face/edge click, whole-body double click, context action and drag radius operate on exact body", async ({page}) => {
  const body = await add(page,"B01",{anchor:[-20,-20,0],widthMm:20,depthMm:20,heightMm:10});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  await clickWorld(page,[-10,-10,10]);
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.uiState.selection[0]?.kind)).toBe("face");
  const center = await page.evaluate(() => window.PathloomModel.projectPoint([-10,-10,10]));
  await page.mouse.dblclick(center.x,center.y);
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.uiState.selection[0]?.kind || "body")).toBe("body");
  await page.keyboard.press("Escape");
  await clickWorld(page,[-10,-20,10]);
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document.uiState.selection[0]?.kind)).toBe("edge");
  const edge = await page.evaluate(() => window.PathloomModel.projectPoint([-10,-20,10]));
  await page.mouse.click(edge.x,edge.y,{button:"right"});
  await expect(page.getByRole("menuitem",{name:"Fillet",exact:true})).toBeVisible();
  await page.getByRole("menuitem",{name:"Fillet",exact:true}).click();
  await expect(page.locator('[data-parameter="radiusMm"]')).toHaveValue("2");
  await drag(page,page.getByRole("button",{name:"距離・量をドラッグ",exact:true}),1);
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  const result=await last(page);
  expect(result.feature.command.version).toBe(2);
  expect(result.feature.parameters.radiusMm).toBe(3);
  expect(result.entity.displayCache.volumeMm3).toBeLessThan(body.displayCache.volumeMm3);
});

test("P3 command reorder requires edit mode and object drag creates a ready generation binding", async ({page}) => {
  const line = page.getByRole("button",{name:"Line",exact:true});
  const rectangle = page.getByRole("button",{name:"Rectangle",exact:true});
  await expect(line).toHaveAttribute("draggable","false");
  await page.getByRole("button",{name:"配置編集",exact:true}).click();
  await expect(line).toHaveAttribute("draggable","true");
  await rectangle.dragTo(line);
  const ids=await page.locator(".model-command-group").first().locator("[data-command-id]").evaluateAll((elements)=>elements.map((element)=>element.dataset.commandId));
  expect(ids.indexOf("C04")).toBeLessThan(ids.indexOf("C02"));
  await page.getByRole("button",{name:"配置編集",exact:true}).click();
  const body=await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await page.locator(`.model-outline-body[data-body-id="${body.bodyId}"]`).dragTo(page.getByRole("region",{name:"生成で使用",exact:true}));
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.outputBindings.map((binding)=>binding.status))).toEqual(["ready"]);
});

test("P3 pivot picking, uniform scale corner, rotation snap and mirror face preview use exact parameters", async ({page}) => {
  const box = await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await select(page,box);
  await page.getByRole("button",{name:"top view",exact:true}).click();
  await page.getByRole("button",{name:"変換の中心をクリックで指定",exact:true}).click();
  // A top-view ray reaches the visible top vertex, not the occluded bottom.
  await clickWorld(page,[0,0,10]);
  await drag(page,page.getByRole("button",{name:"均等スケールをドラッグ",exact:true}),50);
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  let result = await last(page);
  expect(result.feature.parameters.center).toEqual([0,0,10]);
  expect(result.entity.bbox.min[2]).toBeCloseTo(-5,6);
  expect(result.entity.bbox.max[2]).toBeCloseTo(10,6);
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(3375,5);
  await select(page,result.entity);
  await drag(page,page.locator('[data-gizmo="rotate"][data-axis="Z"]'),32);
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  result=await last(page);
  expect(result.feature.parameters.angleRad).toBeCloseTo(Math.PI/6,8);
  await select(page,result.entity);
  await page.getByRole("button",{name:"Mirror",exact:true}).click();
  const top = result.entity.bbox.max[2];
  await clickWorld(page,[7.5,7.5,top]);
  const plane = JSON.parse(await page.getByRole("textbox",{name:"作業平面",exact:true}).inputValue());
  expect(plane.origin[2]).toBeCloseTo(top,6);
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  result=await last(page);
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(3375,5);
  expect(result.entity.bbox.min[2]).toBeCloseTo(top,6);
});

test("P3 drag previews color actual added/removed volumes and Esc restores the initial document", async ({page}) => {
  const box=await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await select(page,box);
  const handle=page.locator('[data-gizmo="move"][data-axis="X"]'), rect=await handle.boundingBox();
  const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+5,y,{steps:3});
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().addedVolumeMm3)).toBeCloseTo(500,5);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().removedVolumeMm3)).toBeCloseTo(500,5);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  const result=await last(page);
  expect(result.entity.geometry.assetHash).toBe(box.geometry.assetHash);
});

test("P3 Move inference, Alt precision and Shift free rotation keep the requested exact transform", async ({page}) => {
  const box = await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await add(page,"B01",{anchor:[40,20,0],widthMm:10,depthMm:10,heightMm:10});
  await select(page,box);
  await drag(page,page.locator('[data-gizmo="move"][data-axis="X"]'),36);
  let result=await last(page);
  expect(result.feature.parameters.translation).toEqual([35,0,0]);
  await select(page,result.entity);
  await drag(page,page.locator('[data-gizmo="move"][data-axis="Y"]'),15,{alt:true});
  result=await last(page);
  expect(result.feature.parameters.translation).toEqual([0,1.5,0]);
  await select(page,result.entity);
  await drag(page,page.locator('[data-gizmo="rotate"][data-axis="Z"]'),32,{shift:true});
  result=await last(page);
  expect(result.feature.parameters.angleRad).toBeCloseTo(32*Math.PI/180,8);
  expect(result.entity.displayCache.volumeMm3).toBeCloseTo(1000,5);
});

test("P3 Ctrl canvas copy, array cancellation and outliner reorder preserve the source", async ({page}, info) => {
  const body = await add(page,"B01",{anchor:[-40,-40,0],widthMm:10,depthMm:10,heightMm:10});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  const points=await page.evaluate(()=>[[-35,-35,10],[-15,-35,10]].map((point)=>window.PathloomModel.projectPoint(point)));
  await page.keyboard.down("Control");
  await page.mouse.move(points[0].x,points[0].y); await page.mouse.down();
  await page.mouse.move(points[1].x,points[1].y,{steps:8}); await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  const result=await last(page);
  expect(result.feature.resultPolicy).toBe("independent");
  expect(result.feature.parameters.translation).toEqual([20,0,0]);
  await expect(page.locator(".model-outline-body")).toHaveCount(2);
  await select(page,result.entity);
  await page.getByRole("button",{name:"配列コピー",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().addedPreviewCount)).toBe(2);
  await page.getByRole("dialog").getByLabel("個数",{exact:true}).fill("4");
  const arrayPoints=await page.evaluate(()=>[[-15,-35,10],[-5,-35,10]].map((point)=>window.PathloomModel.projectPoint(point)));
  await page.mouse.move(arrayPoints[0].x,arrayPoints[0].y); await page.mouse.down();
  await page.mouse.move(arrayPoints[1].x,arrayPoints[1].y,{steps:8}); await page.mouse.up();
  await expect(page.getByRole("dialog").getByLabel("間隔 XYZ mm",{exact:true})).toHaveValue("10,0,0");
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().addedPreviewCount)).toBe(3);
  await page.screenshot({path:info.outputPath("array-drag.png")});
  await page.getByRole("dialog").getByRole("button",{name:"キャンセル",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().addedPreviewCount)).toBe(0);
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  const source=page.locator(`.model-outline-body[data-body-id="${body.bodyId}"]`);
  const copy=page.locator(`.model-outline-body[data-body-id="${result.entity.bodyId}"]`);
  await copy.dragTo(source);
  expect(await page.locator(".model-outline-body").evaluateAll((rows)=>rows.map((row)=>row.dataset.bodyId))).toEqual([result.entity.bodyId,body.bodyId]);
  expect(await page.evaluate((id)=>window.PathloomModel.store.getEntity(id).geometry.assetHash,body.id)).toBe(body.geometry.assetHash);
});

test("P3 wheel zoom keeps the model point under the cursor", async ({page}) => {
  await page.getByRole("button",{name:"top view",exact:true}).click();
  const point=[-40,-30,0];
  const before=await page.evaluate((point)=>window.PathloomModel.projectPoint(point),point);
  await page.mouse.move(before.x,before.y);
  await page.mouse.wheel(0,-160);
  await expect.poll(async()=>{
    const after=await page.evaluate((point)=>window.PathloomModel.projectPoint(point),point);
    return Math.hypot(after.x-before.x,after.y-before.y);
  }).toBeLessThan(0.1);
  const adjacent=await page.evaluate(()=>window.PathloomModel.projectPoint([-30,-30,0]));
  expect(Math.abs(adjacent.x-before.x)).toBeGreaterThan(20);
});

test("P3 an edge click stays selection-only and an actual drag creates Fillet or Shift-Chamfer", async ({page}) => {
  await add(page,"B01",{anchor:[-20,-20,0],widthMm:20,depthMm:20,heightMm:20});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  const point=[-10,-20,20];
  const dragEdge=async (shift=false)=>{
    await clickWorld(page,point);
    await expect(page.locator(".model-right")).toBeHidden();
    await expect(page.locator(".model-history-entry")).toHaveCount(1);
    const screen=await page.evaluate((point)=>window.PathloomModel.projectPoint(point),point);
    if(shift)await page.keyboard.down("Shift");
    await page.mouse.move(screen.x,screen.y);await page.mouse.down();
    await page.mouse.move(screen.x+5,screen.y,{steps:5});await page.mouse.up();
    if(shift)await page.keyboard.up("Shift");
    await expect(page.locator(".model-history-entry")).toHaveCount(2);
    return last(page);
  };
  let result=await dragEdge();
  expect(result.feature.command.id).toBe("D05");
  expect(result.feature.command.version).toBe(2);
  expect(result.feature.parameters.radiusMm).toBe(7);
  expect(result.entity.displayCache.volumeMm3).toBeLessThan(8000);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Escape");
  result=await dragEdge(true);
  expect(result.feature.command.id).toBe("D06");
  expect(result.feature.parameters.distance1Mm).toBe(6);
  expect(result.entity.displayCache.volumeMm3).toBeLessThan(8000);
});
