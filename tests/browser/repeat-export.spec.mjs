import {test,expect} from './fixtures/cad.mjs';
import {readFile} from 'node:fs/promises';

async function saves(page){
  await page.evaluate(()=>{
    window.__repeat={calls:[],writes:[],next:null};
    const invoke=window.__TAURI__.core.invoke;
    const wrapped=async(name,args={})=>{
      if(name!=='save_gcode_file'&&name!=='save_cad_step')return invoke(name,args);
      window.__repeat.calls.push({name,...structuredClone(args)});
      const next=window.__repeat.next;window.__repeat.next=null;
      if(next==='cancel')return null;
      if(next==='fail')throw Error('fixture disk full');
      if(next==='delay')await new Promise(resolve=>window.__repeat.release=resolve);
      window.__repeat.writes.push({name,...structuredClone(args)});
      return args.currentPath||(name==='save_cad_step'?'/tmp/chosen.STP':'/tmp/chosen.GCODE');
    };
    window.__TAURI__.core.invoke=wrapped;
    window.PathloomModel.store.native.invoke=wrapped;
  });
}
const count=page=>page.evaluate(()=>window.__repeat.writes.length);
const idle=page=>expect.poll(()=>page.evaluate(async()=>(await import('/repeat-export.js')).repeatExport.busy)).toBe(false);
async function download(page,action){
  const next=page.waitForEvent('download');await action();const file=await next;
  return {name:file.suggestedFilename(),text:await readFile(await file.path(),'utf8')};
}
const repeat=page=>page.getByRole('button',{name:'前回設定で書き出し',exact:true});

test('031 G-code repeats exact saved settings and targets, retaining success across cancel, failure and double click',async({page})=>{
  await saves(page);await expect(repeat(page)).toBeHidden();
  await page.evaluate(()=>window.Pathloom.upsertLiveToolpath({source:'repeat-main',label:'Repeat target',paths:[{order:0,tool:0,points:[[0,0,.6],[10,0,.6],[10,10,.6],[0,0,.6]]}]}));
  await page.locator('#modeOutput').click();
  await page.locator('#printSpeed').fill('27');await page.locator('#nozzleTemperature').fill('203');
  await page.locator('#executeOutputBtn').click();await expect.poll(()=>count(page)).toBe(1);await idle(page);
  const first=await page.evaluate(()=>window.__repeat.writes[0]);
  expect(first.content).toContain('End of Pathloom output');expect(first.currentPath).toBeUndefined();
  await expect(repeat(page)).toBeVisible();
  await page.locator('#printSpeed').fill('99');await page.locator('#nozzleTemperature').fill('250');
  await page.evaluate(()=>window.Pathloom.upsertLiveToolpath({source:'added-after-export',label:'New target',paths:[{order:0,tool:0,points:[[0,0,.6],[10,0,.6],[10,10,.6],[0,0,.6]]}]}));
  await page.locator('#modeGenerate').click();
  await repeat(page).click();await expect.poll(()=>count(page)).toBe(2);await idle(page);
  const second=await page.evaluate(()=>window.__repeat.writes[1]);
  expect(second.content).toBe(first.content);expect(second.currentPath).toBe('/tmp/chosen.GCODE');expect(second.filename).toBe(first.filename);
  await expect(page.locator('#modeGenerate')).toHaveAttribute('aria-selected','true');
  expect(await page.locator('#printSpeed').inputValue()).toBe('99');
  for(const next of ['cancel','fail']){
    await page.locator('#modeOutput').click();await page.evaluate(next=>window.__repeat.next=next,next);
    await page.locator('#executeOutputBtn').click();await idle(page);
    await page.locator('#modeGenerate').click();await repeat(page).click();await idle(page);
    expect(await page.evaluate(()=>window.__repeat.writes.at(-1).content)).toBe(first.content);
  }
  const before=await count(page);await page.evaluate(()=>window.__repeat.next='delay');
  await repeat(page).dblclick();await expect(repeat(page)).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>typeof window.__repeat.release)).toBe('function');
  await page.evaluate(()=>window.__repeat.release());await idle(page);expect(await count(page)).toBe(before+1);
  // Invalid current geometry still goes through the ordinary validation guards.
  await page.evaluate(()=>window.Pathloom.upsertLiveToolpath({source:'repeat-main',label:'Repeat target',paths:[{order:0,tool:0,points:[[0,0,-1],[10,0,-1]]}]}));
  await repeat(page).click();await idle(page);expect(await count(page)).toBe(before+1);
  await expect(page.locator('#outputErrorDetails pre')).toContainText('below the bed');
});

test('031 STEP uses the previous body current tip and destination, never the new selection, and clears on Open',async({page})=>{
  await saves(page);
  const targets=await page.evaluate(async()=>{
    const {commandById}=await import('/cad/commands/registry.js'),{createCommandSession}=await import('/cad/commands/session.js'),store=window.PathloomModel.store;
    const targets=[];
    for(const width of [20,8]){const session=createCommandSession(commandById('B01'));Object.assign(session.parameters,{widthMm:width,depthMm:20,heightMm:20});if(!await store.add(session))throw Error(JSON.stringify(session.diagnostics));const f=store.document.features.at(-1);targets.push({featureId:f.id,bodyId:f.outputSlots[0].bodyId,entityId:f.outputSlots[0].entityId});}
    return targets;
  });
  await page.locator(`.model-outline-body[data-body-id="${targets[0].bodyId}"] .model-outline-select`).click();
  await expect(page.locator(`.model-outline-body[data-body-id="${targets[0].bodyId}"] .model-outline-select`)).toHaveAttribute('aria-selected','true');
  await page.locator('#modelExportStep').evaluate(b=>b.click());await expect.poll(()=>count(page)).toBe(1);await idle(page);
  const first=await page.evaluate(()=>window.__repeat.writes[0]);expect(first.currentPath).toBeUndefined();
  await page.locator(`.model-outline-body[data-body-id="${targets[1].bodyId}"] .model-outline-select`).click();
  await expect(page.locator(`.model-outline-body[data-body-id="${targets[1].bodyId}"] .model-outline-select`)).toHaveAttribute('aria-selected','true');
  await page.evaluate(async id=>{const s=window.PathloomModel.store,f=s.getFeature(id);await s.edit(id,{...f.parameters,widthMm:30})},targets[0].featureId);
  await repeat(page).click();await expect.poll(()=>count(page)).toBe(2);await idle(page);
  const second=await page.evaluate(()=>window.__repeat.writes[1]);expect(second.currentPath).toBe('/tmp/chosen.STP');expect(second.filename).toBe(first.filename);
  const reread=await page.evaluate(content=>window.__cadKernel({type:'import-step',step:content}),second.content);
  expect(reread.summary.volumeMm3).toBeCloseTo(12000,6);expect(reread.summary.bbox.max[0]-reread.summary.bbox.min[0]).toBeCloseTo(30,6);
  await page.evaluate(id=>window.PathloomModel.store.remove(id),targets[0].featureId);
  await expect(repeat(page)).toBeDisabled();expect(await count(page)).toBe(2);
  await page.evaluate(async()=>{const m=window.PathloomModel,snapshot=await m.snapshot();m.restorePrepared(await m.prepareRestore(snapshot))});
  await expect(repeat(page)).toBeHidden();
});

test('031 existing generator, toolpath and library JSON downloads repeat the same target and bytes',async({page})=>{
  await page.locator('#modeGenerate').click();
  const originalId=await page.evaluate(()=>window.PathloomCad.snapshot().sourceId);
  const original=await download(page,()=>page.locator('#cadExportDefinition').evaluate(b=>b.click()));
  expect(original.name).toBe('generator.json');
  await page.locator('#cadNew').evaluate(b=>b.click());
  await expect.poll(()=>page.evaluate(()=>window.PathloomCad.snapshot().sourceId)).not.toBe(originalId);
  await expect.poll(()=>page.evaluate(()=>window.PathloomCad.snapshot().sourceId)).toBeTruthy();
  expect(await download(page,()=>repeat(page).click())).toEqual(original);
  const paths=await download(page,()=>page.locator('#cadExportPaths').evaluate(b=>b.click()));
  expect(paths.name).toMatch(/\.toolpath$/);expect(JSON.parse(paths.text).paths.length).toBeGreaterThan(0);
  await page.evaluate(id=>document.dispatchEvent(new CustomEvent('pathloom:select-source',{detail:{sourceId:id}})),originalId);
  expect(await download(page,()=>repeat(page).click())).toEqual(paths);
  const entries=await page.evaluate(async()=>{
    const {saveLibraryEntry}=await import('/cad-library.js'),{DEFAULT_DEFINITION}=await import('/cad-kernel.js'),{migrateDefinition}=await import('/cad-pipeline.js');
    const definition=migrateDefinition(DEFAULT_DEFINITION);
    return ['a','b'].map(id=>saveLibraryEntry([],{kind:'operation',definition,stepId:definition.steps[0].id,name:`Repeat ${id}`},`repeat-${id}`,'2026-11-04'));
  });
  await expect.poll(()=>page.evaluate(async()=>JSON.parse(await window.__cadStorage({key:'library'}))?.format)).toBe('pathloom-library');
  for(const entry of entries){await page.locator('#cadImportDefinition').setInputFiles({name:'item.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'pathloom-library-item',version:1,entry}))});await expect(page.locator(`#cadLibrary option[value="${entry.id}"]`)).toHaveCount(1);}
  await page.locator('#cadLibrary').evaluate(b=>b.value='repeat-a');
  const library=await download(page,()=>page.locator('#cadExportLibraryItem').evaluate(b=>b.click()));
  expect(JSON.parse(library.text).entry.id).toBe('repeat-a');
  await page.locator('#cadLibrary').evaluate(b=>b.value='repeat-b');
  expect(await download(page,()=>repeat(page).click())).toEqual(library);
});
