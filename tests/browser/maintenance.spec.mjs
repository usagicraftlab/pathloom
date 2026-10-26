import {test,expect} from '@playwright/test';

async function start(page,{failure=false,delay=150}={}){
  await page.addInitScript(({failure,delay})=>{
    window.__audit={calls:[],saved:null,failure,delay};
    const post=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...rest){
      if(window.__audit.forceApplyFailure&&!message.kind&&message.steps?.some(step=>step.id==='ai-test-move')){
        window.__audit.forceApplyFailure=false;
        setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:{ok:false,error:'Output must be planar with nonnegative Z'}})),20);return;
      }
      return post.call(this,message,...rest);
    };
    window.__TAURI__={event:{listen:async()=>()=>{}},core:{invoke:async(command,args={})=>{
      window.__audit.calls.push(command);
      if(command==='codex_status')return {connected:true,account:{plan:'Test account'},models:[{model:'test-mini',displayName:'Test mini',isDefault:true}],limits:{rateLimits:{primary:{usedPercent:10}}}};
      if(command==='cad_library')return '[]';
      if(command==='runtime_info')return {name:'Pathloom',platform:'macos',arch:'aarch64',grasshopperEndpoint:'ws://127.0.0.1:8765'};
      if(command==='grasshopper_bridge_status')return {endpoint:'ws://127.0.0.1:8765'};
      if(command==='grasshopper_brep_snapshots')return [];
      if(command==='printer_connection_get')return {settings:{baseUrl:'http://127.0.0.1',authMode:'apiKey',username:'',storage:'usb'},hasCredentials:false};
      if(command==='save_pathloom_project'){window.__audit.saved=JSON.parse(args.content);return '/tmp/audit.pathloom'}
      if(command==='open_pathloom_project')return {path:'/tmp/audit.pathloom',content:JSON.stringify(window.__audit.saved)};
      if(command==='codex_propose'){
        await new Promise(resolve=>setTimeout(resolve,window.__audit.delay));
        if(window.__audit.failure)throw new Error('Invalid geometry: curve intersects at Z 0.6');
        if(window.__audit.invalidCode)return {definition:{format:'pathloom-design-patch',recipes:{upsert:[{id:'invalid-ai-code',version:1,label:'Invalid AI code',accepts:null,returns:'curve',params:{},defaults:{},code:'return input.map( ;'}]},steps:{upsert:[{id:'ai-test-invalid',operation:'recipe:invalid-ai-code',version:1,pendingInputs:true,group:'Transform',params:{}}]}}};
        return {definition:{format:'pathloom-design-patch',steps:{upsert:[{id:'ai-test-move',operation:'translate',version:1,pendingInputs:true,label:'AI Test Move',group:'Transform',params:{offset:[2,0,0]}}]}}};
      }
      if(command==='codex_cancel'||command==='cancel_cad_request')return null;
      throw new Error('Unexpected native call: '+command);
    }}};
  },{failure,delay});
  await page.goto('/');
  await page.waitForFunction(()=>window.Pathloom&&window.PathloomCad);
  await expect(page.locator('.operation-shell').first()).toBeVisible();
  await expect.poll(()=>page.locator('#cadStatus').textContent()).toContain('layers');
}

test('initial workspace exports without changing layer height; all imports enforce bed Z',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page);
  const baseline=await page.evaluate(()=>window.Pathloom.generateGcode());expect(baseline).toContain('End of Pathloom output');
  const rejected=await page.evaluate(()=>{window.Pathloom.upsertLiveToolpath({source:'negative',label:'Below bed',paths:[{order:0,tool:0,points:[[0,0,-1],[10,0,-1]]}]});try{window.Pathloom.generateGcode();return false}catch(e){return e.message}});
  expect(rejected).toContain('below the bed');expect(errors).toEqual([]);
  await page.locator('#modeOutput').click();await page.locator('#executeOutputBtn').click();await expect(page.locator('#outputErrorDetails')).toBeVisible();await expect(page.locator('#outputErrorDetails pre')).toContainText('below the bed');
});

for(const size of [{width:1100,height:700},{width:1920,height:1080}])test(`AI authoring and settings remain reachable at ${size.width} × ${size.height}`,async({page})=>{
  await page.setViewportSize(size);await start(page);await page.getByRole('button',{name:'New AI Component',exact:true}).click();const card=page.locator('.ai-component-card');await expect(card.getByRole('textbox')).toBeVisible();await expect(card.getByRole('button',{name:'生成する',exact:true})).toBeInViewport();
  await card.getByRole('button',{name:'AI設定',exact:true}).click();await expect(page.locator('#aiSettingsDialog')).toBeVisible();await expect(page.getByRole('button',{name:'Close AI settings'})).toBeInViewport();
});

test('canvas prompt visibly creates a detached component at the requested position',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,{delay:500});
  await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await expect(card).toBeVisible();
  await card.getByRole('textbox').fill('入力曲線をX方向に動かすComponentを作って');await card.getByRole('button',{name:'生成する',exact:true}).click();
  await expect(card).toHaveAttribute('aria-busy','true');await expect(card).toHaveAttribute('data-phase','done');
  const node=page.locator('[data-step-id="ai-test-move"]');await expect(node).toBeVisible();
  await page.evaluate(()=>document.querySelector('#projectSave').click());
  await expect.poll(()=>page.evaluate(()=>window.__audit.saved?.sources?.some(s=>s.generator?.steps?.some(step=>step.id==='ai-test-move')))).toBe(true);
  const saved=await page.evaluate(()=>window.__audit.saved);const graph=saved.sources.find(s=>s.generator).generator;
  expect(graph.steps.find(s=>s.id==='ai-test-move').pendingInputs).toBe(true);expect(graph.editor.nodes['ai-test-move']).toBeTruthy();
  page.on('dialog',dialog=>dialog.accept());await page.evaluate(()=>document.querySelector('#projectOpen').click());
  await expect(page.locator('#cadStatus')).toContainText('layers');await expect(page.locator('[data-step-id="ai-test-move"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('blank-canvas click opens an on-screen prompt without using the old chat',async({page})=>{
  await start(page);const viewport=page.locator('.node-viewport'),bounds=await viewport.boundingBox();
  await page.mouse.click(bounds.x+bounds.width-12,bounds.y+bounds.height-12);
  const card=page.locator('.ai-component-card');await expect(card).toBeVisible();
  const rect=await card.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(bounds.x);expect(rect.x+rect.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(bounds.y+bounds.height+1);
  await card.getByRole('textbox').fill('canvasから直接生成');await card.getByRole('textbox').press('Control+Enter');await expect(card).toHaveAttribute('data-phase','done');
  await expect(page.locator('#cadChatForm')).toHaveCount(0);
});

test('closing or repositioning an instruction card preserves its unsent draft',async({page})=>{
  await start(page);await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await card.getByRole('textbox').fill('まだ送っていない指示');await card.getByRole('button',{name:'Close AI Component'}).click();
  await page.getByRole('button',{name:'New AI Component',exact:true}).click();await expect(card.getByRole('textbox')).toHaveValue('まだ送っていない指示');
});

test('project reopening preserves orthographic view, layer and arrangement controls without moving objects',async({page})=>{
  await start(page);await page.getByRole('button',{name:'top view',exact:true}).click();await page.locator('#modeOutput').click();
  await page.evaluate(()=>{document.querySelector('#autoArrangeEnabled').checked=false;document.querySelector('#gridSpacingX').value=99;document.querySelector('#gridRotation').value=15;const layer=document.querySelector('#layerSlider');layer.value=3;layer.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#projectSave').click()});
  await expect.poll(()=>page.evaluate(()=>window.__audit.saved?.view?.projection)).toBe('orthographic');
  const placement=await page.evaluate(()=>JSON.stringify(window.__audit.saved.instances));
  await page.mouse.move(1140,450);await page.mouse.down({button:'right'});await page.mouse.move(1200,500,{steps:5});await page.mouse.up({button:'right'});
  await expect.poll(()=>page.evaluate(()=>window.Pathloom.viewState().projection)).toBe('perspective');
  await page.evaluate(()=>{document.querySelector('#gridSpacingX').value=50;document.querySelector('#gridRotation').value=0});await page.locator('#modeGenerate').click();page.on('dialog',dialog=>dialog.accept());await page.evaluate(()=>document.querySelector('#projectOpen').click());
  await expect(page.locator('#cadStatus')).toContainText('layers');
  await expect.poll(()=>page.evaluate(()=>window.Pathloom.viewState().axis)).toBe('top');expect(await page.evaluate(()=>window.Pathloom.viewState().projection)).toBe('orthographic');
  await expect(page.locator('#gridSpacingX')).toHaveValue('99');await expect(page.locator('#gridRotation')).toHaveValue('15');await expect(page.locator('#autoArrangeEnabled')).not.toBeChecked();await expect(page.locator('#layerSlider')).toHaveValue('3');
  await page.evaluate(()=>document.querySelector('#projectSave').click());await expect.poll(()=>page.evaluate(()=>JSON.stringify(window.__audit.saved.instances))).toBe(placement);
});

test('invalid detached AI code is rejected before it becomes a component',async({page})=>{
  await start(page);await page.evaluate(()=>window.__audit.invalidCode=true);await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await card.getByRole('textbox').fill('新しいアルゴリズム');await card.getByRole('button',{name:'生成する',exact:true}).click();
  await expect(card).toHaveAttribute('data-phase','error');await expect(card.locator('pre')).toContainText('syntax');await expect(page.locator('[data-step-id="ai-test-invalid"]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__audit.calls.filter(c=>c==='codex_propose').length)).toBe(2);
});

test('failure in final printable generation rolls back and is never reported as completed',async({page})=>{
  await start(page);await page.evaluate(()=>window.__audit.forceApplyFailure=true);await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await card.getByRole('textbox').fill('反映失敗でも元のモデルを残す');await card.getByRole('button',{name:'生成する',exact:true}).click();
  await expect(card).toHaveAttribute('data-phase','error');await expect(card.locator('pre')).toContainText('nonnegative Z');await expect(page.locator('[data-step-id="ai-test-move"]')).toHaveCount(0);
  await expect(page.locator('#cadStatus')).toContainText('layers');expect(await page.evaluate(()=>window.Pathloom.generateGcode())).toContain('End of Pathloom output');
});

test('idle viewport stops frame polling and camera changes still render',async({page})=>{
  await page.addInitScript(()=>{const request=window.requestAnimationFrame.bind(window);window.__frames=0;window.requestAnimationFrame=callback=>request(time=>{window.__frames++;callback(time)})});
  await start(page);await page.waitForTimeout(400);await page.evaluate(()=>window.__frames=0);await page.waitForTimeout(400);expect(await page.evaluate(()=>window.__frames)).toBeLessThan(4);
  await page.getByRole('button',{name:'top view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.Pathloom.viewState().axis)).toBe('top');await expect.poll(()=>page.evaluate(()=>window.__frames)).toBeGreaterThan(0);
});

test('invalid numeric edits keep a clearly stale preview, block output, and recover on correction',async({page})=>{
  await start(page);
  await page.evaluate(async()=>{const THREE=await import('/vendor/three/three.module.js'),render=THREE.Scene.prototype.onBeforeRender;THREE.Scene.prototype.onBeforeRender=function(renderer,scene,camera){window.__audit.dimmed=0;scene.traverse(node=>{if(node.geometry?.getAttribute('segmentStart')&&node.visible&&node.parent?.visible&&node.material?.uniforms?.lineOpacity?.value<.5)window.__audit.dimmed++});return render.call(this,renderer,scene,camera)}});
  await page.locator('[data-step-id="stack"]').dblclick();const height=page.getByRole('spinbutton',{name:'stack height value',exact:true});await height.fill('0');await height.dispatchEvent('change');
  await expect(page.locator('#cadStatus')).toHaveAttribute('data-state','error');await expect(page.locator('#cadStatus')).toContainText('前回の形状');await expect.poll(()=>page.evaluate(()=>window.__audit.dimmed)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>{try{window.Pathloom.generateGcode();return false}catch{return true}})).toBe(true);
  await height.fill('60');await height.dispatchEvent('change');await expect(page.locator('#cadStatus')).toHaveAttribute('data-state','ready');expect(await page.evaluate(()=>window.Pathloom.generateGcode())).toContain('End of Pathloom output');
});

test('failed AI retains instructions and visible details, then supports retry',async({page})=>{
  await start(page,{failure:true});await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await card.getByRole('textbox').fill('失敗してもこの指示は残す');await card.getByRole('button',{name:'生成する',exact:true}).click();
  await expect(card).toHaveAttribute('data-phase','error');await expect(card.getByRole('textbox')).toHaveValue('失敗してもこの指示は残す');
  await expect(card.locator('pre')).toContainText('curve intersects');
  await page.evaluate(()=>window.__audit.failure=false);await card.getByRole('button',{name:'再生成する',exact:true}).click();await expect(card).toHaveAttribute('data-phase','done');
});

test('cancel discards late AI replies and preserves the prompt',async({page})=>{
  await start(page,{delay:1500});await page.getByRole('button',{name:'New AI Component',exact:true}).click();
  const card=page.locator('.ai-component-card');await card.getByRole('textbox').fill('中断する生成');await card.getByRole('button',{name:'生成する',exact:true}).click();
  await expect(card).toHaveAttribute('data-phase','generating');await card.getByRole('button',{name:'中断',exact:true}).click();
  await expect(card).toHaveAttribute('data-phase','cancelled');await page.waitForTimeout(1800);await expect(page.locator('[data-step-id="ai-test-move"]')).toHaveCount(0);await expect(card.getByRole('textbox')).toHaveValue('中断する生成');
});

test('AI settings live in a dialog and shared Output tool behavior is preserved',async({page})=>{
  await start(page);await page.getByRole('button',{name:'AI settings',exact:true}).click();await expect(page.locator('#aiSettingsDialog')).toBeVisible();await expect(page.locator('#cadAiModel')).toHaveValue('test-mini');await page.getByRole('button',{name:'Close AI settings'}).click();
  await page.evaluate(()=>{window.Pathloom.upsertLiveToolpath({source:'other',label:'Other',paths:[{tool:0,points:[[0,0,.6],[10,0,.6]]}]});const select=document.querySelector('.tool-output');select.value='2';select.dispatchEvent(new Event('change',{bubbles:true}))});
  expect(await page.locator('.tool-output').evaluateAll(selects=>selects.map(s=>s.value))).toEqual(['2','2']);
});
