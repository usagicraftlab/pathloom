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


async function entity(page,feature){return page.evaluate(id=>{const s=window.PathloomModel.store,f=s.getFeature(id);return structuredClone(s.getEntity(f.outputSlots[0].entityId));},feature.id);}

test('P2 S03/B07: holes, islands and independent regions retain all outputs through edit/Undo/v2',async({page})=>{
  const loops=[];for(const [x,y,w,h] of [[0,0,10,10],[2,2,6,6],[4,4,2,2],[20,0,10,10]])loops.push(await add(page,'C04',{anchorMode:'center',anchor:[x+w/2,y+h/2,0],widthMm:w,heightMm:h}));
  await page.getByRole('button',{name:'Planar Region',exact:true}).click();await input(page,'boundaries',loops.map(x=>x.entity));const region=await commit(page);expect(region.command.version).toBe(2);expect(region.outputSlots).toHaveLength(3);
  const areas=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getFeature(id).outputSlots.map(o=>({entity:s.getEntity(o.entityId).id,area:s.getEntity(o.entityId).displayCache.areaMm2}))},region.id);expect(areas.map(x=>Math.round(x.area)).sort((a,b)=>a-b)).toEqual([4,64,100]);
  await page.getByRole('button',{name:'Extrude Surface',exact:true}).click();await input(page,'profile',[areas.find(x=>Math.abs(x.area-64)<1e-6).entity]);await param(page,'distanceMm',5);const extrusion=await commit(page);expect((await entity(page,extrusion)).displayCache.volumeMm3).toBeCloseTo(320,5);
  await page.locator('.model-history-entry').last().click();await param(page,'cap',false);await page.getByRole('button',{name:'設定変更を確定',exact:true}).click();await expect(page.locator('.model-history-entry').last()).toContainText('valid');expect((await entity(page,extrusion)).closure.enclosesVolume).toBe(false);
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await entity(page,extrusion)).closure.enclosesVolume).toBe(true);await page.keyboard.press('Control+Shift+z');await expect.poll(async()=>(await entity(page,extrusion)).closure.enclosesVolume).toBe(false);await roundTrip(page);
});

test('P2 B01/B02: oriented Box modes and exact three-axis ellipsoid use explicit UI settings',async({page})=>{
  await page.getByRole('button',{name:'Box',exact:true}).click();await param(page,'mode','twoCorners');await param(page,'points',[[10,4,0],[0,0,0]]);await param(page,'heightMm',3);const two=await commit(page);expect(two.command.version).toBe(2);expect((await entity(page,two)).displayCache.volumeMm3).toBeCloseTo(120,5);
  await page.getByRole('button',{name:'Box',exact:true}).click();await param(page,'mode','threePoints');await param(page,'points',[[0,0,0],[0,4,0],[0,0,3]]);await param(page,'heightMm',2);const three=await commit(page);expect((await entity(page,three)).bbox.max).toEqual([2,4,3]);
  await page.getByRole('button',{name:'Ellipsoid',exact:true}).click();await param(page,'radiiMm',[2,3,4]);const ellipsoid=await commit(page);expect((await entity(page,ellipsoid)).displayCache.volumeMm3).toBeCloseTo(32*Math.PI,3);await roundTrip(page);
});

test('P2 B03/B04/B05/B06/B08: open pipes and primitives cap into independent closed volumes',async({page})=>{
  const pipes=[];for(const x of [0,20]){const rail=await add(page,'C02',{start:[x,0,0],end:[x,0,10]});await page.getByRole('button',{name:'Pipe',exact:true}).click();await input(page,'rail',[rail.entity]);const pipe=await commit(page);pipes.push(pipe.outputSlots[0].entityId);expect((await entity(page,pipe)).closure.enclosesVolume).toBe(false);}
  await page.getByRole('button',{name:'Cap Openings',exact:true}).click();await input(page,'objects',pipes);const caps=await commit(page);expect(caps.outputSlots).toHaveLength(2);
  const volumes=await page.evaluate(id=>{const s=window.PathloomModel.store;return s.getFeature(id).outputSlots.map(o=>s.getEntity(o.entityId).displayCache.volumeMm3)},caps.id);for(const v of volumes)expect(v).toBeCloseTo(40*Math.PI,4);
  await page.getByRole('button',{name:'Cylinder',exact:true}).click();await param(page,'cap',false);const cylinder=await commit(page);expect((await entity(page,cylinder)).closure.enclosesVolume).toBe(false);
  await page.getByRole('button',{name:'Cone',exact:true}).click();await param(page,'bottomRadiusMm',0);await param(page,'topRadiusMm',2);const cone=await commit(page);expect((await entity(page,cone)).closure.enclosesVolume).toBe(true);
  await page.getByRole('button',{name:'Torus',exact:true}).click();await commit(page);await roundTrip(page);
});

test('P2 B08: assembling open and closed face groups and nonplanar Cap failure preserve exact state',async({page})=>{
  const box=await add(page,'B01',{widthMm:10,depthMm:10,heightMm:10});await page.getByRole('button',{name:'Explode Faces',exact:true}).click();await input(page,'object',[box.entity]);const exploded=await commit(page);expect(exploded.outputSlots).toHaveLength(6);
  await page.getByRole('button',{name:'Assemble Solid',exact:true}).click();await input(page,'objects',exploded.outputSlots.slice(0,5).map(o=>o.entityId));const open=await commit(page,'warning');expect((await entity(page,open)).closure.enclosesVolume).toBe(false);
  await page.locator('.model-history-entry').last().click();await input(page,'objects',exploded.outputSlots.map(o=>o.entityId));await page.getByRole('button',{name:'設定変更を確定',exact:true}).click();await expect(page.locator('.model-history-entry').last()).toContainText('valid');expect((await entity(page,open)).displayCache.volumeMm3).toBeCloseTo(1000,5);
  const bent=await add(page,'S02',{points:[[0,0,0],[10,0,0],[10,10,1],[0,10,0]]});await page.getByRole('button',{name:'Cap Openings',exact:true}).click();await input(page,'objects',[bent.entity]);const count=await page.evaluate(()=>window.PathloomModel.store.document.features.length);await page.locator('#modelCommit').click();await expect(page.locator('#modelDiagnostics')).toContainText('CAD_CAP_NONPLANAR');await expect(page.locator('.model-history-entry')).toHaveCount(count);await page.locator('#modelCancel').click();await roundTrip(page);
});

test('P2 D05/D06: tangent-chain permission and two-distance adjacent-face Chamfer are explicit',async({page})=>{
  const rect=await add(page,'C04',{rounding:true,cornerRadiusMm:3});await page.getByRole('button',{name:'Extrude',exact:true}).click();await input(page,'profile',[rect.entity]);await param(page,'cap',true);const solid=await commit(page);const body=await entity(page,solid);
  const edge=body.displayCache.topology.find(t=>t.kind==='edge'&&Math.abs(t.fingerprint.bbox.min[1]+20)<1e-5&&Math.abs(t.fingerprint.bbox.max[1]+20)<1e-5&&Math.abs(t.fingerprint.bbox.min[2])<1e-5&&Math.abs(t.fingerprint.bbox.max[2])<1e-5&&t.fingerprint.bbox.max[0]-t.fingerprint.bbox.min[0]>40);expect(edge).toBeTruthy();
  await page.getByRole('button',{name:'Fillet Edges',exact:true}).click();await input(page,'body',[body.id]);await input(page,'edges',[{entityId:body.id,topologyId:edge.topologyId}]);await page.locator('#modelCommit').click();await expect(page.locator('#modelDiagnostics')).toContainText('CAD_REFERENCE_AMBIGUOUS');await param(page,'chainPolicy','tangent');const fillet=await commit(page);expect(fillet.command.version).toBe(2);
  const b=await add(page,'B01',{widthMm:10,depthMm:10,heightMm:10});const e=b.summary.topology.find(t=>t.kind==='edge');const f=b.summary.topology.find(t=>t.kind==='face'&&t.fingerprint.bbox.min.every((v,i)=>v<=e.fingerprint.bbox.min[i]+1e-7)&&t.fingerprint.bbox.max.every((v,i)=>v>=e.fingerprint.bbox.max[i]-1e-7));
  await page.getByRole('button',{name:'Chamfer Edges',exact:true}).click();await input(page,'body',[b.entity]);await input(page,'edges',[{entityId:b.entity,topologyId:e.topologyId}]);await param(page,'distance2Mm',2);await input(page,'distance1Faces',[{entityId:b.entity,topologyId:f.topologyId}]);const chamfer=await commit(page);expect((await entity(page,chamfer)).displayCache.volumeMm3).toBeCloseTo(990,5);await roundTrip(page);
});

test('P2 D07: Shell failure retains lastValid and thickness diagnostics through Undo/Redo/v2',async({page})=>{
  const b=await add(page,'B01',{widthMm:10,depthMm:10,heightMm:10});const face=b.summary.topology.find(t=>t.kind==='face');await page.getByRole('button',{name:'Shell',exact:true}).click();await input(page,'body',[b.entity]);await input(page,'removedFaces',[{entityId:b.entity,topologyId:face.topologyId}]);const shell=await commit(page);const hash=(await entity(page,shell)).geometry.assetHash;
  await page.locator('.model-history-entry').last().click();await param(page,'thicknessMm',100);await page.getByRole('button',{name:'設定変更を確定',exact:true}).click();await expect(page.locator('.model-history-entry').last()).toContainText('failed');await expect(page.locator('#modelDiagnostics')).toContainText('CAD_SHELL_FAILED');expect((await entity(page,shell)).geometry.assetHash).toBe(hash);
  await page.keyboard.press('Control+z');await expect(page.locator('.model-history-entry').last()).toContainText('valid');await page.keyboard.press('Control+Shift+z');await expect(page.locator('.model-history-entry').last()).toContainText('failed');const doc=await roundTrip(page);expect(doc.features.at(-1).diagnostics[0].details.thicknessMm).toBe(100);expect(doc.features.at(-1).lastValid).toBeTruthy();
});


test('P2 D01/D03: noncontact Union keeps both solids and face contact stays an open exact result',async({page})=>{
  const a=await add(page,'B01',{widthMm:10,depthMm:10,heightMm:10}),b=await add(page,'B01',{anchor:[20,0,0],widthMm:10,depthMm:10,heightMm:10});
  await page.getByRole('button',{name:'Union',exact:true}).click();await input(page,'arguments',[a.entity,b.entity]);const union=await commit(page);const result=await entity(page,union);expect(result.kind).toBe('compound');expect(result.displayCache.volumeMm3).toBeCloseTo(2000,5);
  const c=await add(page,'B01',{widthMm:10,depthMm:10,heightMm:10}),d=await add(page,'B01',{anchor:[10,0,0],widthMm:10,depthMm:10,heightMm:10});
  await page.getByRole('button',{name:'Intersection',exact:true}).click();await input(page,'arguments',[c.entity]);await input(page,'tools',[d.entity]);const contact=await commit(page);const face=await entity(page,contact);expect(face.kind).toBe('surface');expect(face.closure.enclosesVolume).toBe(false);expect(face.displayCache.areaMm2).toBeCloseTo(100,5);await roundTrip(page);
});
