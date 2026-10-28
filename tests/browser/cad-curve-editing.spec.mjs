import {test,expect} from './fixtures/cad.mjs';

async function add(page,id,parameters={}){
  return page.evaluate(async({id,parameters})=>{
    const {commandById}=await import('/cad/commands/registry.js');
    const {createCommandSession}=await import('/cad/commands/session.js');
    const s=createCommandSession(commandById(id));Object.assign(s.parameters,parameters);
    const store=window.PathloomModel.store;
    if(!await store.add(s))throw new Error(JSON.stringify(s.diagnostics));
    const f=store.document.features.at(-1),e=store.getEntity(f.outputSlots[0].entityId);
    return {feature:f.id,entity:e.id,hash:e.geometry.assetHash,summary:e.displayCache};
  },{id,parameters});
}
async function input(page,key,ids){
  const values=await page.getByLabel('CAD input '+key,{exact:true}).locator('option').evaluateAll((options,ids)=>ids.map(id=>{
    const option=options.find(o=>{try{const ref=JSON.parse(o.value);return ref.entityId===id.entityId&&(!id.topologyId||ref.topologyId===id.topologyId)}catch{return false}});
    if(!option)throw new Error('Missing CAD option '+JSON.stringify(id));return option.value;
  }),ids.map(id=>typeof id==='string'?{entityId:id}:id));
  await page.getByLabel('CAD input '+key,{exact:true}).selectOption(values);
}
async function param(page,key,value){
  const field=page.locator(`[data-parameter="${key}"]`);
  if(typeof value==='boolean'){await field.setChecked(value);await field.dispatchEvent('input');}
  else if(await field.evaluate(e=>e.tagName==='SELECT')){await field.selectOption(String(value));await field.dispatchEvent('input');}
  else await field.fill(typeof value==='object'?JSON.stringify(value):String(value));
}
async function commit(page,status='valid'){
  const count=await page.evaluate(()=>window.PathloomModel.store.document.features.length);
  await page.locator('#modelCommit').click();
  await expect(page.locator('.model-history-entry')).toHaveCount(count+1);
  await expect(page.locator('.model-history-entry').last()).toContainText(status);
  return page.evaluate(()=>structuredClone(window.PathloomModel.store.document.features.at(-1)));
}
async function roundTrip(page){
  const count=await page.evaluate(()=>window.__saveCount);
  await page.evaluate(()=>document.querySelector('#projectSave').click());
  await expect.poll(()=>page.evaluate(()=>window.__saveCount)).toBe(count+1);
  const before=await page.evaluate(()=>structuredClone(window.__saved.cadDocument));
  await page.evaluate(()=>window.__cadStorage({key:'recovery',discard:true}));
  await page.reload();await page.waitForFunction(()=>window.PathloomModel&&window.PathloomCad);
  await page.evaluate(()=>document.querySelector('#projectOpen').click());
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.id)).toBe(before.id);
  const after=await page.evaluate(()=>window.PathloomModel.snapshot());
  expect(after.features).toEqual(before.features);expect(after.commandDefinitions).toEqual(before.commandDefinitions);
  expect(after.entities.map(e=>e.geometry.assetHash)).toEqual(before.entities.map(e=>e.geometry.assetHash));
  expect(after.entities.map(e=>e.accuracy)).toEqual(before.entities.map(e=>e.accuracy));
  return after;
}
async function visible(page){return page.evaluate(async()=>{const {deriveVisibleEntities}=await import('/cad/document.js');return deriveVisibleEntities(window.PathloomModel.store.document).map(e=>e.id)});}

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

test('P2 E03: Trim retains both intervals and cutters, Undo/Redo and failed lastValid survive v2',async({page})=>{
  const object=await add(page,'C02',{start:[0,0,0],end:[10,0,0]});
  const cutters=[];for(const x of [3,7])cutters.push(await add(page,'C02',{start:[x,-5,0],end:[x,5,0]}));
  await page.getByRole('button',{name:'Trim Curve',exact:true}).click();
  await input(page,'object',[object.entity]);await input(page,'cutters',cutters.map(c=>c.entity));
  await axis(page);await page.getByRole('button',{name:'区間・接続側を画面で指定',exact:true}).click();await clickWorld(page,[5,0,0]);
  const f=await commit(page);expect(f.outputSlots).toHaveLength(2);expect(f.parameters.removePoint[0]).toBeCloseTo(5,0);expect(f.parameters.removePoint[1]).toBeCloseTo(0,4);
  const ids=await visible(page);expect(ids).toHaveLength(4);for(const c of cutters)expect(ids).toContain(c.entity);
  await page.locator('#modelUndo').click();await expect(page.locator('.model-history-entry')).toHaveCount(3);expect(await visible(page)).toContain(object.entity);
  await page.locator('#modelRedo').click();await expect(page.locator('.model-history-entry')).toHaveCount(4);
  await page.locator('.model-history-entry').last().click();await param(page,'removePoint',[3,0,0]);
  await page.getByRole('button',{name:'設定変更を確定',exact:true}).click();
  await expect(page.locator('.model-history-entry').last()).toContainText('failed');
  const after=await roundTrip(page);expect(after.features.at(-1).lastValid.entitySnapshots).toHaveLength(2);expect(after.features.at(-1).diagnostics[0].code).toBe('CAD_REFERENCE_AMBIGUOUS');
});

test('P2 E04: explicit rectangle edge Split keeps every other edge as exact output',async({page})=>{
  const object=await add(page,'C04');const edge=object.summary.curveParameters[0];
  await page.getByRole('button',{name:'Split Curve',exact:true}).click();await input(page,'object',[object.entity]);await input(page,'edge',[{entityId:object.entity,topologyId:edge.topologyId}]);
  await param(page,'splitParameters',[(edge.first+edge.last)/2]);
  const f=await commit(page);expect(f.command.version).toBe(2);expect(f.outputSlots).toHaveLength(5);
  const sum=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getFeature(id).outputSlots.reduce((n,o)=>n+s.getEntity(o.entityId).displayCache.lengthMm,0)},f.id);expect(sum).toBeCloseTo(200,6);
  await roundTrip(page);
});

test('P2 E07: Fillet/Chamfer retain all outputs through keepInputs, Undo and v2',async({page})=>{
  const a=await add(page,'C02',{start:[-10,0,0],end:[0,0,0]}),b=await add(page,'C02',{start:[0,0,0],end:[0,10,0]});
  await page.getByRole('button',{name:'Fillet Curves',exact:true}).click();await input(page,'first',[a.entity]);await input(page,'second',[b.entity]);await param(page,'solutionIndex',1);
  const f=await commit(page);expect(f.outputSlots).toHaveLength(3);expect(await visible(page)).toHaveLength(3);
  await page.locator('.model-history-entry').last().click();await param(page,'keepInputs',true);await page.getByRole('button',{name:'設定変更を確定',exact:true}).click();
  await expect.poll(()=>visible(page)).toHaveLength(5);
  await page.locator('#modelUndo').click();await expect.poll(()=>visible(page)).toHaveLength(3);
  await page.locator('#modelRedo').click();await expect.poll(()=>visible(page)).toHaveLength(5);
  await page.getByRole('button',{name:'Chamfer Curves',exact:true}).click();await input(page,'first',[a.entity]);await input(page,'second',[b.entity]);await param(page,'keepInputs',true);await param(page,'secondDistanceMm',3);
  const chamfer=await commit(page);expect(chamfer.outputSlots).toHaveLength(3);
  const after=await roundTrip(page);expect(after.features.find(x=>x.id===f.id).lastValid.curveKeepInputs).toBe(true);
});

test('P2 E05/E10/E11: approved NURBS continuation, periodic seam and pole editing use explicit inputs',async({page})=>{
  const a=await add(page,'C09');await page.getByRole('button',{name:'Extend Curve',exact:true}).click();await input(page,'object',[a.entity]);await param(page,'distanceMm',5);
  await expect(page.locator('#modelProperties')).toContainText('NURBS/Bezierのcontinuationは接線延長');
  const extended=await commit(page);expect(extended.parameters.method).toBe('continuation');
  const points=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getEntity(s.getFeature(id).outputSlots[0].entityId).displayCache.preview.points.map(p=>p.point)},extended.id);
  expect(points.some(p=>Math.hypot(p[0]-30-5/Math.SQRT2,p[1]+5/Math.SQRT2,p[2])<1e-6)).toBe(true);
  const circle=await add(page,'C06');await page.getByRole('button',{name:'Set Curve Seam',exact:true}).click();await input(page,'object',[circle.entity]);await param(page,'seamParameter',Math.PI/2);const seam=await commit(page);
  await page.getByRole('button',{name:'Reverse Curve',exact:true}).click();await input(page,'object',[seam.outputSlots[0].entityId]);await commit(page);
  const spline=await add(page,'C09');await page.getByRole('button',{name:'Edit Curve Poles',exact:true}).click();await input(page,'object',[spline.entity]);await param(page,'mode','insertKnot');const edited=await commit(page);expect(edited.parameters.mode).toBe('insertKnot');
  const poleCount=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getEntity(s.getFeature(id).outputSlots[0].entityId).displayCache.curveParameters[0].poleCount},edited.id);expect(poleCount).toBe(5);
  await page.getByRole('button',{name:'Edit Curve Poles',exact:true}).click();await input(page,'object',[edited.outputSlots[0].entityId]);await param(page,'mode','removeKnot');await param(page,'multiplicity',0);const removed=await commit(page,'warning');expect(removed.diagnostics[0].details.maxDeviationMm).toBeLessThan(1e-9);
  const source=await add(page,'C09');await page.getByRole('button',{name:'Edit Curve Poles',exact:true}).click();await input(page,'object',[source.entity]);await param(page,'poleIndex',2);await param(page,'position',[10,20,0]);const moved=await commit(page);expect(moved.parameters.position).toEqual([10,20,0]);
  await roundTrip(page);
});

test('P2 E01/E02/E08/E09: groups, Explode, G2 Blend and explicit approximation approval',async({page})=>{
  const a=await add(page,'C02',{start:[0,0,0],end:[10,0,0]}),b=await add(page,'C02',{start:[10,0,0],end:[20,0,0]}),c=await add(page,'C02',{start:[30,0,0],end:[40,0,0]});
  await page.getByRole('button',{name:'Join Curves',exact:true}).click();await input(page,'objects',[a.entity,b.entity,c.entity]);const joined=await commit(page);expect(joined.outputSlots).toHaveLength(2);expect(joined.command.version).toBe(2);
  const poly=await add(page,'C03');await page.getByRole('button',{name:'Explode Curve',exact:true}).click();await input(page,'object',[poly.entity]);const exploded=await commit(page);expect(exploded.outputSlots).toHaveLength(2);
  const x=await add(page,'C02',{start:[0,20,0],end:[10,20,0]}),y=await add(page,'C02',{start:[20,30,0],end:[30,30,0]});
  await page.getByRole('button',{name:'Blend Curves',exact:true}).click();await input(page,'first',[x.entity]);await input(page,'second',[y.entity]);await param(page,'continuity','G2');await commit(page);
  const spline=await add(page,'C09');await page.getByRole('button',{name:'Rebuild Curve',exact:true}).click();await input(page,'object',[spline.entity]);
  await page.locator('#modelPreview').click();await expect(page.locator('#modelStatus')).toContainText('計測最大偏差');
  const count=await page.evaluate(()=>window.PathloomModel.store.document.features.length);
  await page.locator('#modelCommit').click();await expect(page.locator('#modelDiagnostics')).toContainText('CAD_APPROXIMATION_REQUIRES_CONFIRMATION');await expect(page.locator('.model-history-entry')).toHaveCount(count);
  await param(page,'acceptApproximation',true);const rebuilt=await commit(page,'warning');expect(rebuilt.diagnostics[0].details.controlPointCount).toBe(6);
  const after=await roundTrip(page);expect(after.features.at(-1).diagnostics[0].message).toContain('Hausdorff');
});


test('P2 E06: signed Offset, zero unchanged, collapse empty and incompatible plane stay distinct',async({page})=>{
  const a=await add(page,'C06',{radiusMm:10});
  await page.getByRole('button',{name:'Offset Curve',exact:true}).click();await input(page,'curve',[a.entity]);await param(page,'distanceMm',-1);
  const f=await commit(page);
  const length=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getEntity(s.getFeature(id).outputSlots[0].entityId).displayCache.lengthMm},f.id);expect(length).toBeCloseTo(18*Math.PI,6);
  await page.getByRole('button',{name:'Offset Curve',exact:true}).click();await input(page,'curve',[a.entity]);await param(page,'distanceMm',0);await commit(page,'warning');
  await page.getByRole('button',{name:'Offset Curve',exact:true}).click();await input(page,'curve',[a.entity]);await param(page,'distanceMm',-11);const empty=await commit(page,'empty');expect(empty.diagnostics[0].code).toBe('CAD_EMPTY_RESULT');
  const after=await roundTrip(page);expect(after.features.at(-1).status).toBe('empty');
  await page.getByRole('button',{name:'Offset Curve',exact:true}).click();await input(page,'curve',[a.entity]);await param(page,'plane',{origin:[0,0,0],xAxis:[1,0,0],yAxis:[0,0,1]});
  const count=after.features.length;await page.locator('#modelCommit').click();await expect(page.locator('#modelDiagnostics')).toContainText('CAD_INPUT_TYPE');await expect(page.locator('.model-history-entry')).toHaveCount(count);
});
