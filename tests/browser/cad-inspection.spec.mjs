import { test, expect, selectCadCommand, selectCadMenuItem, clickCadPoint } from "./fixtures/cad.mjs";

async function add(page, commandId, parameters) {
  return page.evaluate(async ({commandId,parameters}) => {
    const {commandById} = await import("/cad/commands/registry.js");
    const {createCommandSession} = await import("/cad/commands/session.js");
    const model=window.PathloomModel, session=createCommandSession(commandById(commandId));
    Object.assign(session.parameters,parameters);
    if (!await model.store.add(session)) throw Error(JSON.stringify(session.diagnostics));
    const f=model.store.document.features.at(-1);
    return structuredClone(model.store.getEntity(f.outputSlots[0].entityId));
  }, {commandId,parameters});
}
async function select(page, entity) {
  const row=page.locator(`.model-outline-body[data-body-id="${entity.bodyId}"] .model-outline-select`);
  await row.click();
  await expect(row).toHaveAttribute("aria-selected","true");
}
async function axis(page, name) {
  await page.locator(`.axis-orbit [data-view="${name}"]`).click();
  await expect.poll(()=>page.evaluate(()=>window.Pathloom.viewState().axis)).toBe(name);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
}
async function clickWorld(page, point) {
  const screen=await page.evaluate(p=>window.PathloomModel.projectPoint(p),point);
  await clickCadPoint(page,screen);
}
async function modelContent(page) {
  return page.evaluate(async()=>{
    const d=await window.PathloomModel.snapshot();
    return JSON.stringify({revision:d.documentRevision,features:d.features,entities:d.entities,
      bodies:d.bodies,assets:d.assets,drafts:d.draftSessions,commands:d.commandDefinitions});
  });
}

test("030 section inspection drags exact live contours without changing the document or history", async ({page},info) => {
  const box=await add(page,"B01",{widthMm:20,depthMm:10,heightMm:10});
  await select(page,box);
  const before=await modelContent(page);
  await selectCadMenuItem(page,"#modelSectionInspection");
  await expect(page.locator(".model-section-controls")).toHaveAttribute("data-state","ready");
  await expect(page.locator(".model-transform-gizmo")).toBeHidden();
  let display=await page.evaluate(()=>window.PathloomModel.displayState().inspection);
  expect(display.curveCount).toBe(4);
  expect(display.lengthMm).toBeCloseTo(60,6);
  expect(display.origin).toEqual([10,5,5]);
  await page.getByRole("button",{name:"断面法線 X",exact:true}).click();
  await expect(page.locator(".model-section-controls")).toHaveAttribute("data-state","ready");
  expect(await page.evaluate(()=>window.PathloomModel.displayState().inspection.lengthMm)).toBeCloseTo(40,6);
  const drag=page.getByRole("button",{name:"切断平面をドラッグ",exact:true});
  const rect=await drag.boundingBox();
  const vector=await page.evaluate(()=>{
    const m=window.PathloomModel,a=m.projectPoint([10,5,5]),b=m.projectPoint([12,5,5]);
    return {x:b.x-a.x,y:b.y-a.y};
  });
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+vector.x,rect.y+rect.height/2+vector.y,{steps:4});
  // Assert the live result before pointer-up, not just a final recomputation.
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.displayState().inspection?.origin[0])).toBeCloseTo(12,4);
  await expect(page.locator(".model-section-controls")).toHaveAttribute("data-state","ready");
  await page.mouse.up();
  expect(await modelContent(page)).toBe(before);
  await page.screenshot({path:info.outputPath("section-live.png")});
  await page.keyboard.press("Escape");
  expect(await page.evaluate(()=>window.PathloomModel.displayState().inspection)).toBeNull();
  expect(await modelContent(page)).toBe(before);
  // Open does not restore an analysis state or add an E14 feature.
  await selectCadMenuItem(page,"#modelSectionInspection");
  await expect(page.locator(".model-section-controls")).toHaveAttribute("data-state","ready");
  await page.evaluate(async()=>{
    const m=window.PathloomModel, snapshot=await m.snapshot();
    m.restorePrepared(await m.prepareRestore(snapshot));
  });
  await expect(page.locator(".model-section-controls")).toBeHidden();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
});

test("030 Extrude measures a face once, preserves rejected targets and survives Undo and Open", async ({page}) => {
  const target=await add(page,"B01",{anchor:[100,100,30],widthMm:10,depthMm:10,heightMm:10});
  await add(page,"B02",{center:[140,150,35],radiusMm:8});
  await add(page,"S01",{anchor:[140,100,40],widthMm:15,heightMm:15,
    plane:{origin:[0,0,0],xAxis:[1,0,0],yAxis:[0,Math.SQRT1_2,Math.SQRT1_2]}});
  const profile=await add(page,"C04",{anchor:[0,0,0],widthMm:20,heightMm:10});
  await select(page,profile);
  await selectCadCommand(page,"Extrude");
  await axis(page,"top");
  const distance=page.locator('[data-parameter="distanceMm"]');
  await clickWorld(page,[105,105,40]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(40,6);
  await page.locator('[data-parameter="direction"]').fill("[0,0,-1]");
  await page.locator('[data-parameter="direction"]').press("Tab");
  await clickWorld(page,[105,105,40]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(-40,6);
  await page.locator('[data-parameter="bothSides"]').check();
  await clickWorld(page,[105,105,40]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(-80,6);
  // A tilted face and a curved face do not change that numeric value.
  await clickWorld(page,[140,100,40]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(-80,6);
  await clickWorld(page,[140,150,43]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(-80,6);
  await axis(page,"right");
  await clickWorld(page,[110,105,35]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(-80,6);
  await axis(page,"top");
  await page.locator('[data-parameter="direction"]').fill("[0,0,1]");
  await page.locator('[data-parameter="direction"]').press("Tab");
  await page.locator('[data-parameter="bothSides"]').uncheck();
  await page.locator('[data-parameter="cap"]').check();
  await clickWorld(page,[105,105,40]);
  await expect.poll(async()=>Number(await distance.inputValue())).toBeCloseTo(40,6);
  await page.getByRole("button",{name:"確定",exact:true}).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(5);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  const feature=await page.evaluate(()=>structuredClone(window.PathloomModel.store.document.features.at(-1)));
  expect(feature.parameters.distanceMm).toBeCloseTo(40,6);
  expect(feature.inputs).toEqual({profile:[{entityId:profile.id,role:"profile"}]});
  await page.keyboard.press("Control+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(5);
  await page.evaluate(async({targetFeature,extrudeFeature})=>{
    const m=window.PathloomModel,f=m.store.getFeature(targetFeature);
    await m.store.edit(f.id,{...f.parameters,anchor:[100,100,60]});
    const e=m.store.getFeature(extrudeFeature);
    if(Math.abs(e.parameters.distanceMm-40)>1e-6)throw Error("measurement followed target");
    const snapshot=await m.snapshot();m.restorePrepared(await m.prepareRestore(snapshot));
  },{targetFeature:target.producer.featureId,extrudeFeature:feature.id});
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.features.at(-1).parameters.distanceMm)).toBeCloseTo(40,6);
  expect(await page.evaluate(()=>window.PathloomModel.store.document.entities.at(-1).bbox.max[2])).toBeCloseTo(40,6);
});
