import { test, expect, selectCadCommand, selectCadMenuItem, clickCadPoint } from "./fixtures/cad.mjs";

async function add(page, commandId, parameters = {}) {
  return page.evaluate(async ({commandId,parameters}) => {
    const {commandById}=await import("/cad/commands/registry.js");
    const {createCommandSession}=await import("/cad/commands/session.js");
    const store=window.PathloomModel.store,session=createCommandSession(commandById(commandId));
    Object.assign(session.parameters,parameters);
    if(!await store.add(session)) throw new Error(JSON.stringify(session.diagnostics));
    const feature=store.document.features.at(-1);
    return structuredClone(store.getEntity(feature.outputSlots[0].entityId));
  },{commandId,parameters});
}
const rowFor=(page,entity)=>page.locator(`.model-outline-body[data-body-id="${entity.bodyId}"]`);
async function select(page,entity,options={}) {
  const row=rowFor(page,entity).locator(".model-outline-select");
  await row.click(options);
  await expect(row).toHaveAttribute("aria-selected","true");
}
const project=(page,point)=>page.evaluate(point=>window.PathloomModel.projectPoint(point),point);
async function clickWorld(page,point,options={}) {
  const screen=await project(page,point);
  await clickCadPoint(page,screen,options);
}

test("027 A multi-selection shows only union WDH, follows orbit target and marks generation registration",async({page})=>{
  const a=await add(page,"B01",{widthMm:10,depthMm:20,heightMm:30});
  const b=await add(page,"B01",{anchor:[30,10,0],widthMm:5,depthMm:10,heightMm:20});
  await select(page,a);
  await select(page,b,{modifiers:["Shift"]});
  await expect(page.locator(".model-selection-dimensions")).toHaveText("W 35.00 × D 20.00 × H 30.00 mm");
  await expect(page.locator(".model-transform-gizmo")).toBeHidden();
  expect(await page.evaluate(()=>window.Pathloom.viewState().target)).toEqual([17.5,10,15]);
  await rowFor(page,a).locator(".model-outline-select").click({button:"right"});
  await page.getByRole("menuitem",{name:"生成で使用",exact:true}).click();
  await expect(rowFor(page,a).locator('[data-state="generation"]')).toBeVisible();
  await page.evaluate(async()=>{
    const model=window.PathloomModel;
    model.restorePrepared(await model.prepareRestore(await model.snapshot()));
  });
  await expect(rowFor(page,a).locator('[data-state="generation"]')).toBeVisible();
});

test("027 A typed unit expressions commit exact dimensions and reject invalid arithmetic",async({page})=>{
  await selectCadCommand(page,"Box");
  const width=page.locator('[data-parameter="widthMm"]');
  await expect(width).toHaveJSProperty("type","text");
  await width.fill("1/0");
  expect(await width.evaluate(input=>input.validity.valid)).toBe(false);
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(0);
  await width.fill("2.5cm");
  await page.locator('[data-parameter="depthMm"]').fill("30/2");
  const height=page.locator('[data-parameter="heightMm"]');
  await height.fill("10+5");
  await height.focus();await height.press("ArrowUp");await height.dispatchEvent("wheel",{deltaY:-100});
  await expect(height).toHaveValue("10+5");
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.entities[0]?.displayCache.volumeMm3)).toBeCloseTo(5625,5);
  const box=await page.evaluate(()=>window.PathloomModel.store.document.entities[0]);
  await select(page,box);await selectCadCommand(page,"Rotate");
  await page.locator('[data-parameter="angleRad"]').fill("90deg/2");
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  expect(await page.evaluate(()=>window.PathloomModel.store.document.features.at(-1).parameters.angleRad)).toBeCloseTo(Math.PI/4,10);
});

test("027 A axis balls and workplane back restore reference and exact face support",async({page})=>{
  for(const [name,axis] of [["right","right"],["back","back"],["top","top"]]){
    await page.getByRole("button",{name:`${name} view`,exact:true}).click();
    expect(await page.evaluate(()=>window.Pathloom.viewState().axis)).toBe(axis);
  }
  await page.getByRole("button",{name:"front view",exact:true}).click();
  await selectCadCommand(page,"Rectangle");
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await clickWorld(page,[10,0,10]);
  expect(await page.evaluate(()=>window.PathloomModel.store.document.uiState.workPlane.yAxis)).toEqual([0,0,1]);
  await page.locator("#modelWorkplaneBack").click();
  expect(await page.evaluate(()=>window.PathloomModel.store.document.uiState.workPlane.yAxis)).toEqual([0,1,0]);
  await page.keyboard.press("Escape");
  const box=await add(page,"B01",{widthMm:20,depthMm:20,heightMm:10});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  await selectCadCommand(page,"Rectangle");
  await clickWorld(page,[10,10,10]);
  const support=await page.evaluate(()=>structuredClone(window.PathloomModel.store.document.uiState.workPlaneSupport));
  expect(support.entityId).toBe(box.id);
  await page.locator("#modelWorkplaneBack").click();
  expect(await page.evaluate(()=>window.PathloomModel.store.document.uiState.workPlaneSupport)).toBeNull();
  await page.locator("#modelWorkplaneBack").click();
  expect(await page.evaluate(()=>window.PathloomModel.store.document.uiState.workPlaneSupport)).toEqual(support);
  await expect(page.getByRole("textbox",{name:"作業平面",exact:true})).toHaveValue(JSON.stringify(await page.evaluate(()=>window.PathloomModel.store.document.uiState.workPlane)));
});

test("027 A Alt edge click selects one exact loop and preserves ordinary and double click",async({page})=>{
  const box=await add(page,"B01",{anchor:[-20,-20,0],widthMm:20,depthMm:20,heightMm:10});
  await page.getByRole("button",{name:"top view",exact:true}).click();
  const edge=[-10,-20,10];
  await page.keyboard.down("Alt");await clickWorld(page,edge);await page.keyboard.up("Alt");
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.uiState.selection.length)).toBe(4);
  const selected=await page.evaluate(()=>window.PathloomModel.store.document.uiState.selection);
  expect(selected.every(ref=>ref.entityId===box.id&&ref.kind==="edge")).toBe(true);
  expect(box.displayCache.edgeLoops.some(loop=>loop.edgeTopologyIds.length===selected.length&&loop.edgeTopologyIds.every(id=>selected.some(ref=>ref.topologyId===id)))).toBe(true);
  await page.keyboard.press("Escape");await clickWorld(page,edge);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.uiState.selection.length)).toBe(1);
  const center=await project(page,[-10,-10,10]);await page.mouse.dblclick(center.x,center.y);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.uiState.selection[0]?.kind||"body")).toBe("body");
  await page.keyboard.press("Escape");await clickWorld(page,[30,15,0]);
  const target=await page.evaluate(()=>window.Pathloom.viewState().target);
  // Browser pointer positions are rounded to screen pixels before ray casting.
  expect(Math.hypot(target[0]-30,target[1]-15)).toBeLessThan(0.5);
  expect(target[2]).toBeCloseTo(0,6);
});

test("027 A a completed drawing preview keeps the view steady until the user orbits",async({page})=>{
  await page.getByRole("button",{name:"top view",exact:true}).click();
  await selectCadCommand(page,"Rectangle");
  const before=await page.evaluate(()=>window.Pathloom.viewState().target);
  await clickWorld(page,[10,10,0]);
  await expect(page.locator("#modelStatus")).toContainText("プレビュー");
  expect(await page.evaluate(()=>window.Pathloom.viewState().target)).toEqual(before);
  const anchor=JSON.parse(await page.getByRole("textbox",{name:"基準点 XYZ",exact:true}).inputValue());
  const point=await project(page,[20,20,0]);
  await page.mouse.move(point.x,point.y);await page.mouse.down({button:"right"});
  await page.mouse.move(point.x+15,point.y+8,{steps:5});await page.mouse.up({button:"right"});
  const target=await page.evaluate(()=>window.Pathloom.viewState().target);
  for(const [axis,value] of anchor.entries()) expect(target[axis]).toBeCloseTo(value,6);
});

test("027 A move origin clears on cancel and commit; Shift rotation has ticks only while held",async({page},info)=>{
  const box=await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await select(page,box);
  const start=async(selector)=>{
    const rect=await page.locator(selector).boundingBox();
    const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    await page.mouse.move(point.x,point.y);await page.mouse.down();
    await expect(page.locator(".model-right")).toBeVisible();
    return point;
  };
  let point=await start('[data-gizmo="move"][data-axis="X"]');
  await page.mouse.move(point.x+12,point.y,{steps:5});
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().moveGhostVisible)).toBe(true);
  await page.screenshot({path:info.outputPath("move-origin.png")});
  await page.keyboard.press("Escape");await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().moveGhostVisible)).toBe(false);
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await select(page,box);
  point=await start('[data-gizmo="move"][data-axis="X"]');
  await page.mouse.move(point.x+12,point.y,{steps:5});await page.mouse.up();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().moveGhostVisible)).toBe(false);
  const moved=await page.evaluate(()=>window.PathloomModel.store.document.entities.at(-1));await select(page,moved);
  point=await start('[data-gizmo="rotate"][data-axis="Z"]');
  await page.mouse.move(point.x+32,point.y,{steps:5});
  await expect(page.locator(".model-rotation-guide")).toBeHidden();
  await page.keyboard.down("Shift");
  await expect(page.locator(".model-angle-tick")).toHaveCount(24);
  await expect(page.locator(".model-rotation-guide")).toBeVisible();
  await page.screenshot({path:info.outputPath("rotation-ticks.png")});
  await page.keyboard.up("Shift");
  await expect(page.locator(".model-rotation-guide")).toBeHidden();await page.mouse.up();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  expect(await page.evaluate(()=>window.PathloomModel.store.document.features.at(-1).parameters.angleRad)).toBeCloseTo(32*Math.PI/180,8);
});

test("027 A zoom snap menu and grid follow scale; snap markers distinguish inferred points",async({page})=>{
  await page.getByRole("button",{name:"top view",exact:true}).click();
  await add(page,"C02",{start:[-30,-20,0],end:[30,-20,0]});
  await add(page,"C02",{start:[10,-35,0],end:[10,5,0]});
  await add(page,"C03",{points:[[-30,5,0],[-15,5,0],[-15,35,0]],closed:false});
  await selectCadCommand(page,"Line");
  // First click only picks a workplane, so the existing geometry stays intact.
  await clickWorld(page,[-40,30,0]);
  for(const [point,kind] of [[[30,-20,0],"endpoint"],[[0,-20,0],"center"],[[10,-20,0],"intersection"],[[-22.5,5,0],"midpoint"]]){
    const screen=await project(page,point);
    await page.mouse.move(screen.x,screen.y);
    await expect(page.locator(".model-snap-guide")).toHaveAttribute("data-snap-kind",kind);
    await expect(page.locator(".model-snap-guide svg")).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().gridStepMm)).toBe(1);
  await selectCadMenuItem(page,"#modelZoomSnap");
  await expect(page.locator("#modelZoomSnap")).toHaveAttribute("aria-pressed","true");
  const step=await page.evaluate(()=>window.PathloomModel.displayState().gridStepMm);
  const center=await project(page,[0,0,0]);await page.mouse.move(center.x,center.y);
  for(let count=0;count<30;count++) await page.mouse.wheel(0,-100);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().gridStepMm)).toBeLessThan(step);
  await selectCadMenuItem(page,"#modelZoomSnap");
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().gridStepMm)).toBe(1);
  await page.mouse.move(center.x,center.y);
  for(let count=0;count<60;count++) await page.mouse.wheel(0,100);
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().gridMinorOpacity)).toBe(0);
});

test("027 A running shape fades and real failed edit receives an outliner mark; recovery clears it",async({page})=>{
  const box=await add(page,"B01",{widthMm:10,depthMm:10,heightMm:10});
  await page.evaluate(()=>{
    const store=window.PathloomModel.store,original=store.native.evaluate.bind(store.native);
    store.native.evaluate=async(request)=>{
      store.native.evaluate=original;
      await new Promise(resolve=>{window.__releaseUxEdit=resolve;});
      return original(request);
    };
    const feature=store.document.features[0];
    window.__uxEdit=store.edit(feature.id,{...feature.parameters,widthMm:15});
  });
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().ghostEntityIds)).toEqual([box.id]);
  await page.evaluate(async()=>{window.__releaseUxEdit();await window.__uxEdit;});
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().ghostEntityIds)).toEqual([]);
  await page.evaluate(async()=>{
    const store=window.PathloomModel.store,feature=store.document.features[0];
    await store.edit(feature.id,{...feature.parameters,widthMm:-5});
  });
  await expect(rowFor(page,box).locator('[data-state="error"]')).toBeVisible();
  await expect(rowFor(page,box)).toHaveClass(/has-recompute-error/);
  await page.evaluate(async()=>{
    const store=window.PathloomModel.store,feature=store.document.features[0];
    await store.edit(feature.id,{...feature.parameters,widthMm:20});
  });
  await expect(rowFor(page,box).locator('[data-state="error"]')).toHaveCount(0);
  await expect(rowFor(page,box)).not.toHaveClass(/has-recompute-error/);
});
