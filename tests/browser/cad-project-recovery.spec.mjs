import { test, expect } from './fixtures/cad.mjs';
import { spawnSync } from 'node:child_process';

async function rectangle(page) {
  await page.getByRole('button', {name:'Rectangle',exact:true}).click();
  await page.getByRole('button', {name:'確定',exact:true}).click();
  await expect(page.locator('.model-history-entry').last()).toContainText('valid');
}
async function save(page) {
  // Open may have restored a generator whose worker is still recomputing.
  // Production correctly rejects Save while that operation is pending.
  await expect(page.locator('#cadStatus')).not.toHaveAttribute('data-state','busy');
  const count=await page.evaluate(()=>window.__saveCount);
  await page.evaluate(()=>document.querySelector('#projectSave').click());
  await expect.poll(()=>page.evaluate(()=>window.__saveCount)).toBe(count+1);
  return page.evaluate(()=>structuredClone(window.__saved));
}
async function reloadRecovery(page) {
  await page.reload();
  await page.waitForFunction(()=>window.PathloomModel&&window.PathloomCad);
  await page.locator('#modeModel').click();
  await expect(page.getByRole('button',{name:'CADを回復',exact:true})).toBeVisible();
}

test('P1-07: defer preserves A, explicit discard resumes B autosave, restore adopts A',async({page})=>{
  await rectangle(page);
  await expect.poll(()=>page.evaluate(async()=>JSON.parse(await window.__cadStorage({key:'recovery'}))?.features.length)).toBe(1);
  const a=await page.evaluate(()=>window.__cadStorage({key:'recovery'}));
  await reloadRecovery(page);
  await page.getByRole('button',{name:'今はしない',exact:true}).click();
  await rectangle(page);
  await expect(page.locator('#modelRecoveryStatus')).toContainText('保留');
  // Observe past both the one-second idle and the ten-second throttle: no silent overwrite.
  await page.waitForTimeout(11000);
  expect(await page.evaluate(()=>window.__cadStorage({key:'recovery'}))).toBe(a);
  const b=await page.evaluate(()=>window.PathloomModel.store.document.id);
  expect(b).not.toBe(JSON.parse(a).id);
  await page.getByRole('button',{name:'保留中の回復データを確認',exact:true}).click();
  await page.getByRole('button',{name:'回復データを破棄',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>JSON.parse(await window.__cadStorage({key:'recovery'}))?.id)).toBe(b);
  await reloadRecovery(page);
  await page.getByRole('button',{name:'CADを回復',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.id)).toBe(b);
  await expect(page.locator('#modelRecoveryStatus')).toBeEmpty();
  await expect(page.locator('.model-history-entry')).toHaveCount(1);
});

test('P1-07: opening v1 does not rewrite its bytes; next explicit Save writes v2',async({page})=>{
  const saved=await save(page);
  const legacy={...saved,version:1};delete legacy.cadDocument;
  const bytes=JSON.stringify(legacy);
  await rectangle(page);
  const count=await page.evaluate(()=>window.__saveCount);
  await page.evaluate(async bytes=>{
    await window.__cadStorage({key:'project',content:bytes});
    document.querySelector('#projectOpen').click();
  },bytes);
  await expect(page.locator('#projectName')).toContainText('次回保存はv2');
  await expect(page.locator('.model-history-entry')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__cadStorage({key:'project'}))).toBe(bytes);
  expect(await page.evaluate(()=>window.__saveCount)).toBe(count);
  const next=await save(page);
  expect(next.version).toBe(2);expect(next.cadDocument.features).toEqual([]);
  expect(next.settings).toEqual(legacy.settings);
  expect(next.instances).toEqual(legacy.instances);
});

test('P1-07: cancelled, corrupt, hash-invalid and command-conflicting Open retain current work',async({page})=>{
  await rectangle(page);
  const project=await save(page);
  await page.evaluate(()=>{
    window.__originalOpenInvoke=window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke=async(name,args)=>{
      if(name==='open_pathloom_project'){
        window.__openObserved=(window.__openObserved||0)+1;
        return window.__nextOpen;
      }
      return window.__originalOpenInvoke(name,args);
    };
  });
  const corrupt=structuredClone(project),hash=Object.keys(corrupt.cadDocument.assets)[0];
  corrupt.cadDocument.assets[hash].data+='x';
  const conflict=structuredClone(project);conflict.cadDocument.commandDefinitions[0].displayName+=' conflict';
  const unreadable=await page.evaluate(async project=>{
    const {sha256}=await import('/cad/document.js');
    const hash=Object.keys(project.cadDocument.assets)[0],data='not an OCCT B-rep';
    project.cadDocument.assets[hash]={...project.cadDocument.assets[hash],data,byteLength:new TextEncoder().encode(data).byteLength};
    return JSON.stringify(project).split(hash).join(await sha256(data));
  },structuredClone(project));
  for(const file of [null,{path:'/tmp/broken.pathloom',content:'{'},{path:'/tmp/hash.pathloom',content:JSON.stringify(corrupt)},{path:'/tmp/native.pathloom',content:unreadable},{path:'/tmp/command.pathloom',content:JSON.stringify(conflict)}]){
    const before=await page.evaluate(async()=>{
      window.__currentDocument=window.PathloomModel.store.document;
      return {doc:await window.PathloomModel.snapshot(),cad:window.PathloomCad.snapshot(),name:document.querySelector('#projectName').textContent,count:window.__saveCount};
    });
    await page.evaluate(file=>{window.__nextOpen=file;window.__openObserved=0;document.querySelector('#toast').hidden=true;document.querySelector('#projectOpen').click();},file);
    await expect.poll(()=>page.evaluate(()=>window.__openObserved)).toBe(1);
    if(file) await expect(page.locator('#toast.error')).toBeVisible();
    const after=await page.evaluate(async()=>({same:window.PathloomModel.store.document===window.__currentDocument,doc:await window.PathloomModel.snapshot(),cad:window.PathloomCad.snapshot(),name:document.querySelector('#projectName').textContent,count:window.__saveCount}));
    expect(after.same).toBe(true);delete after.same;expect(after).toEqual(before);
  }
});

test('P1-07: open curves, open faces, NURBS, failed lastValid, command version and draft survive restart',async({page},info)=>{
  const before=await page.evaluate(async()=>{
    const {commandById}=await import('/cad/commands/registry.js');
    const {createCommandSession}=await import('/cad/commands/session.js');
    const store=window.PathloomModel.store;
    for(const id of ['C02','S01','C09']){
      const session=createCommandSession(commandById(id));
      if(!await store.add(session))throw new Error(JSON.stringify(session.diagnostics));
    }
    const line=store.document.features[0];
    await store.edit(line.id,{...line.parameters,end:line.parameters.start});
    if(line.status!=='failed'||!line.lastValid)throw new Error('Expected failed line with lastValid');
    window.PathloomModel.render();
    return {id:store.document.id,features:structuredClone(store.document.features),entities:store.document.entities.map(e=>({id:e.id,kind:e.kind,hash:e.geometry.assetHash,bbox:e.bbox,summary:e.displayCache}))};
  });
  await page.getByRole('button',{name:'Polyline',exact:true}).click();
  const project=await save(page);
  expect(project.cadDocument.draftSessions.length).toBeGreaterThan(0);
  const python=process.env.PATHLOOM_BREP_PYTHON||'.pathloom-runtime/python/bin/python';
  const fresh=spawnSync(python,['-c',"import sys,json,os;sys.path.insert(0,'native');from cad_runtime import Runtime;r=Runtime();d=json.load(sys.stdin);print(json.dumps({'pid':os.getpid(),'assets':{h:r.handle(dict(type='import',hash=h,asset=a)) for h,a in d['assets'].items()}}))"],{input:JSON.stringify(project.cadDocument),encoding:'utf8',maxBuffer:20_000_000});
  expect(fresh.status,fresh.stderr).toBe(0);
  const imported=JSON.parse(fresh.stdout);
  for(const entity of before.entities){const actual=imported.assets[entity.hash];expect(actual.geometryHash).toBe(entity.hash);expect(actual.kind).toBe(entity.kind);expect(actual.summary.bbox).toEqual(entity.bbox);expect(actual.summary.valid).toBe(true);}
  const [line,face,nurbs]=before.entities.map(e=>imported.assets[e.hash].summary);
  expect(line.closure.curveClosed).toBe(false);expect(line.lengthMm).toBe(20);
  expect(face.closure.enclosesVolume).toBe(false);expect(face.areaMm2).toBeCloseTo(1200,6);
  expect(nurbs.exactness).toBe('nurbs');expect(nurbs.closure.curveClosed).toBe(false);
  await info.attach('fresh-native-process',{body:JSON.stringify(imported),contentType:'application/json'});
  await page.evaluate(()=>window.__cadStorage({key:'recovery',discard:true}));
  await page.reload();
  await page.waitForFunction(()=>window.PathloomModel&&window.PathloomCad);
  await page.evaluate(()=>document.querySelector('#projectOpen').click());
  await expect.poll(()=>page.evaluate(()=>window.PathloomModel.store.document.id)).toBe(before.id);
  const after=await page.evaluate(async()=>window.PathloomModel.snapshot());
  expect(after.features).toEqual(project.cadDocument.features);
  expect(after.commandDefinitions).toEqual(project.cadDocument.commandDefinitions);
  expect(after.draftSessions).toEqual(project.cadDocument.draftSessions.map(d=>({...d,state:'repairing'})));
  expect(after.features[0].status).toBe('failed');
  expect(after.features[0].lastValid.resultHash).toBe(before.features[0].lastValid.resultHash);
});

test('P1-07: failed/cancelled Save preserves bytes and a delayed Save labels newer edits unsaved',async({page})=>{
  await rectangle(page);await save(page);
  const bytes=await page.evaluate(()=>window.__cadStorage({key:'project'}));
  await page.evaluate(()=>{
    const invoke=window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke=async(name,args)=>{
      if(name==='save_pathloom_project'){
        if(window.__saveMode==='fail')throw new Error('test project storage denied');
        if(window.__saveMode==='cancel')return null;
        if(window.__saveMode==='hold')await new Promise(resolve=>{window.__releaseSave=resolve;});
      }
      return invoke(name,args);
    };
  });
  for(const mode of ['fail','cancel']){
    await page.evaluate(mode=>{window.__saveMode=mode;document.querySelector('#toast').hidden=true;document.querySelector('#projectSave').click();},mode);
    if(mode==='fail')await expect(page.locator('#toast')).toHaveText('test project storage denied');
    else await expect(page.locator('#toast')).toBeHidden();
    expect(await page.evaluate(()=>window.__cadStorage({key:'project'}))).toBe(bytes);
    await expect(page.locator('.model-history-entry')).toHaveCount(1);
  }
  const count=await page.evaluate(()=>window.__saveCount);
  await page.evaluate(()=>{window.__saveMode='hold';document.querySelector('#projectSave').click();});
  await expect.poll(()=>page.evaluate(()=>typeof window.__releaseSave)).toBe('function');
  await rectangle(page);
  await expect(page.locator('.model-history-entry')).toHaveCount(2);
  await page.evaluate(()=>window.__releaseSave());
  await expect.poll(()=>page.evaluate(()=>window.__saveCount)).toBe(count+1);
  await expect(page.locator('#projectName')).toContainText('未保存の変更あり');
  await expect(page.locator('#toast')).toContainText('newer changes remain unsaved');
  expect((await page.evaluate(()=>window.__saved)).cadDocument.features).toHaveLength(1);
  expect(await page.evaluate(()=>window.PathloomModel.store.document.features)).toHaveLength(2);
});

test('P1-07: corrupt recovery is retained until explicit discard and failed restore keeps B',async({page})=>{
  await page.evaluate(()=>window.__cadStorage({key:'recovery',content:'null'}));
  await reloadRecovery(page);
  const id=await page.evaluate(()=>window.PathloomModel.store.document.id);
  await page.getByRole('button',{name:'CADを回復',exact:true}).click();
  await expect(page.locator('#modelStatus')).toContainText('回復候補を読み取れません');
  expect(await page.evaluate(()=>window.PathloomModel.store.document.id)).toBe(id);
  expect(await page.evaluate(()=>window.__cadStorage({key:'recovery'}))).toBe('null');
  await page.getByRole('button',{name:'今はしない',exact:true}).click();
  await rectangle(page);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(()=>window.__cadStorage({key:'recovery'}))).toBe('null');
  await page.getByRole('button',{name:'保留中の回復データを確認',exact:true}).click();
  await page.getByRole('button',{name:'回復データを破棄',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>JSON.parse(await window.__cadStorage({key:'recovery'}))?.id)).toBe(id);
});
