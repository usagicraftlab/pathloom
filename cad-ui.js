import {initCadChat} from './cad-chat.js';
import {DEFAULT_DEFINITION,validateDefinition,sectionPoints} from './cad-kernel.js';
import {migrateDefinition,resolveValue,numberParameters,stageDefinition,displayDefinition,operationSpec,recipeFingerprint,appendComponent,componentGroup,COMPONENT_GROUPS,OPERATIONS} from './cad-pipeline.js';
import {initInputUi} from './cad-input-ui.js';
import {normalizeLibrary,searchLibrary,saveLibraryEntry,applyLibraryOperation} from './cad-library.js';
import {validateProject} from './pathloom-project.js';
const clone=value=>structuredClone(value),$=id=>document.getElementById(id);
export function initCad(api){
  let definition=migrateDefinition(DEFAULT_DEFINITION),sourceId=null,generatorKey=`cad:${crypto.randomUUID()}`,worker=null,timer=null,timeout=null,revision=0;
  let drawing=false,drag=null,pointerStart=null,inputsGroup=null,library=[],history=[],historyIndex=-1,projectPath=null,pending=false,chat=null,inputUi=null,generationError=null;
  let workspaceMode='generate';
  function setMode(mode){if(!['generate','parameters','output'].includes(mode))mode='generate';workspaceMode=mode;document.body.dataset.workspaceMode=mode;for(const button of document.querySelectorAll('.workspace-modes button')){const active=button.dataset.workspaceMode===mode;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1}document.getElementById('cadInputInspector').hidden=true;document.querySelectorAll('.operation-context').forEach(node=>node.hidden=true);if(mode==='output'){stopVisual();stageRevision++;stageWorker?.terminate();stageWorker=null;clearTimeout(stageTimer);api.clearProposal()}else if(selectedStep)previewStep(selectedStep);api.lockPreview(mode!=='output')}
  for(const button of document.querySelectorAll('.workspace-modes button')){button.addEventListener('click',()=>setMode(button.dataset.workspaceMode));button.addEventListener('keydown',event=>{const buttons=[...document.querySelectorAll('.workspace-modes button')];let i=buttons.indexOf(button);if(event.key==='ArrowRight')i=(i+1)%buttons.length;else if(event.key==='ArrowLeft')i=(i+buttons.length-1)%buttons.length;else if(event.key==='Home')i=0;else if(event.key==='End')i=buttons.length-1;else return;event.preventDefault();buttons[i].focus();setMode(buttons[i].dataset.workspaceMode)})}
  let stageWorker=null,stageTimer=null,stageRevision=0,selectedStep=null;
  let visualWorker=null,visualBusy=false,visualLatest=null,visualRevision=0,visualFrame=null,visualTimeout=null;
  function quickPreview(){if(workspaceMode==='output')return;visualLatest={definition:displayDefinition(definition,selectedStep),revision:++visualRevision};if(visualFrame===null)visualFrame=requestAnimationFrame(()=>{visualFrame=null;sendVisual()})}
  function sendVisual(){if(visualBusy||!visualLatest)return;const job=visualLatest;visualLatest=null;if(!visualWorker){visualWorker=new Worker('./cad-worker.js',{type:'module'});visualWorker.onerror=()=>{clearTimeout(visualTimeout);visualBusy=false;visualWorker?.terminate();visualWorker=null;visualLatest=null}}visualBusy=true;visualTimeout=setTimeout(()=>{visualWorker?.terminate();visualWorker=null;visualBusy=false;sendVisual()},1500);visualWorker.onmessage=event=>{clearTimeout(visualTimeout);visualBusy=false;if(job.revision===visualRevision&&event.data.ok)api.previewProposal(event.data.result,true);sendVisual()};visualWorker.postMessage(job.definition)}
  function stopVisual(){clearTimeout(visualTimeout);visualRevision++;visualLatest=null;visualWorker?.terminate();visualWorker=null;visualBusy=false;if(visualFrame!==null)cancelAnimationFrame(visualFrame);visualFrame=null}
  function clearStage(reset=false,keepPreview=false){stageRevision++;stageWorker?.terminate();stageWorker=null;clearTimeout(stageTimer);if(reset){selectedStep=null;stopVisual()}if(!keepPreview&&(reset||!selectedStep))api.clearProposal();for(const node of document.querySelectorAll('.stage-toggle input'))node.checked=node.getAttribute('aria-label')===`Show through ${selectedStep}`;$('cadProcessingStatus').textContent=''}
  function previewStep(id){stopVisual();selectedStep=id||null;clearStage();if(workspaceMode==='output')return;if(!id){if(pending)try{quickPreview()}catch{}return;}for(const node of document.querySelectorAll('.operation-shell'))node.querySelector('.stage-toggle input').checked=node.dataset.stepId===id;const own=stageRevision;try{const next=stageDefinition(definition,id);stageWorker=new Worker('./cad-worker.js',{type:'module'});stageTimer=setTimeout(()=>{if(own===stageRevision){clearStage();$('cadProcessingStatus').textContent='Stage preview exceeded 5 seconds'}},5000);stageWorker.onerror=event=>{if(own===stageRevision){clearStage();$('cadProcessingStatus').textContent=event.message||'Preview failed'}};stageWorker.onmessage=event=>{if(own!==stageRevision)return;stageWorker.terminate();stageWorker=null;clearTimeout(stageTimer);if(!event.data.ok){$('cadProcessingStatus').textContent=event.data.error;return}api.previewProposal(event.data.result,true);$('cadProcessingStatus').textContent=''};stageWorker.postMessage(next)}catch(error){$('cadProcessingStatus').textContent=error.message}}
  $('cadShowFinal').addEventListener('click',()=>clearStage(true));
  const status=message=>{$('cadStatus').textContent=message};
  const invoke=(command,args={})=>{if(!window.__TAURI__?.core?.invoke)throw new Error('This action requires Pathloom Desktop');return window.__TAURI__.core.invoke(command,args)};
  function disposeInputs(){if(!inputsGroup)return;api.preview().scene?.remove(inputsGroup);inputsGroup.traverse(node=>{node.geometry?.dispose();node.material?.dispose()});inputsGroup=null}
  function drawInputs(){
    disposeInputs();const {THREE,scene,dirty}=api.preview();if(!THREE||!scene)return;
    inputsGroup=new THREE.Group();const placement=api.placement(sourceId);inputsGroup.position.set(placement.x,placement.y,0);inputsGroup.rotation.z=placement.rotation*Math.PI/180;inputsGroup.visible=$('cadShowInputs').checked;
    for(const input of definition.inputs.filter(i=>i.visible&&i.exposed===true)){
      const selected=input.id===inputUi?.selectedId(),color=selected?0x227dc7:0x8095a4;
      if(input.type==='curve'){
        const vertices=input.curve.points.map(([x,y])=>new THREE.Vector3(x,y,.1));let sampled=vertices;
        if(vertices.length>=3){if(input.curve.closed)sampled=sectionPoints(input.curve,180).map(([x,y])=>new THREE.Vector3(x,y,.1));else if(input.curve.type==='control')sampled=new THREE.CatmullRomCurve3(vertices,false).getPoints(180)}
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(sampled),new THREE.LineBasicMaterial({color,depthTest:false}));line.renderOrder=20;inputsGroup.add(line);
        if(selected){const handles=new THREE.Points(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.PointsMaterial({color,size:9,sizeAttenuation:false,depthTest:false}));handles.renderOrder=21;inputsGroup.add(handles)}
      }else if(input.type==='point'){
        const point=new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...input.value)]),new THREE.PointsMaterial({color,size:selected?11:7,sizeAttenuation:false,depthTest:false}));point.renderOrder=22;inputsGroup.add(point);
      }
    }
    scene.add(inputsGroup);dirty();
  }
  function render(){ $('cadName').value=definition.name;inputUi?.refresh(); }
  function markPending(message){generationError=message;updateUndo();if(sourceId)api.invalidate(sourceId,message);status(message)}
  function cancelJob(keepPreview=false){if(!keepPreview)stopVisual();clearStage(false,keepPreview);revision++;worker?.terminate();worker=null;clearTimeout(timer);timer=null;clearTimeout(timeout);pending=false}
  function queueGenerate(record=true){chat?.discard();cancelJob(true);drawInputs();markPending('Recalculating…');pending=true;try{quickPreview()}catch{}timer=setTimeout(()=>generate(record),400)}
  function remember(){if(historyIndex>=0&&JSON.stringify(history[historyIndex])===JSON.stringify(definition))return;history=history.slice(0,historyIndex+1);history.push(clone(definition));if(history.length>30)history.shift();historyIndex=history.length-1;updateUndo()}
  function updateUndo(){$('cadUndo').disabled=historyIndex<=0&&!generationError;$('cadRedo').disabled=historyIndex>=history.length-1}
  function generate(record=true){
    syncPrintInputs(false);cancelJob(true);const own=revision;let valid;try{valid=validateDefinition(definition)}catch(error){markPending(error.message);return}
    pending=true;status('Recalculating locally…');worker=new Worker('./cad-worker.js',{type:'module'});
    const fail=message=>{if(own!==revision)return;stopVisual();cancelJob();markPending(message)};
    timeout=setTimeout(()=>fail('Generation exceeded 5 seconds. Reduce samples, layers or copies.'),5000);
    worker.onerror=event=>fail(event.message||'Worker failed');worker.onmessage=event=>{
      if(own!==revision)return;if(!event.data.ok){fail(event.data.error);return}const result=event.data.result;stopVisual();cancelJob(true);
      try{if(definition.editor)result.definition.editor=clone(definition.editor);for(const step of result.definition.steps){const current=definition.steps.find(s=>s.id===step.id);for(const key of ['group','label','origin'])if(current?.[key]!==undefined)step[key]=clone(current[key])}validateDefinition(result.definition);sourceId=api.apply(result,generatorKey);generationError=null;inputUi.syncLinks();inputUi.refresh();if(selectedStep&&definition.steps.some(step=>step.id===selectedStep))previewStep(selectedStep);else clearStage(true);if(record)remember();updateUndo();drawInputs();status(`${new Set(result.paths.map(p=>p.points[0][2])).size} layers · ${result.paths.length} curves${result.warnings.length?' · '+result.warnings.join(' · '):''}`)}catch(error){markPending(error.message)}
    };worker.postMessage(valid);
  }
  function replace(next){definition=validateDefinition(next);render();queueGenerate()}
  function newGenerator(){chat?.cancel();cancelJob();setDrawing(false);sourceId=null;generationError=null;generatorKey=`cad:${crypto.randomUUID()}`;definition=migrateDefinition(DEFAULT_DEFINITION);history=[];historyIndex=-1;inputUi.restoreSelection('section');render();generate()}
  function selectGenerator(id){const source=api.sources().find(s=>s.id===id);if(!source?.generator||id===sourceId)return;chat?.cancel();cancelJob();clearStage(true);setDrawing(false);sourceId=id;generationError=source.generationError||null;generatorKey=source.liveSource||`cad:${id}`;definition=migrateDefinition(source.generator);history=[];historyIndex=-1;remember();render();drawInputs();status('');syncPrintInputs()}
  inputUi=initInputUi({definition:()=>definition,saveComponent:id=>openComponentSave(id),isSavedComponent:step=>isSavedComponent(step),layoutChanged:editor=>{definition.editor=editor;api.setEditorState(sourceId,editor)},editWithAi:id=>{setMode('generate');chat?.editStep(id)},previewStep,previewStepId:()=>selectedStep,sourceId:()=>sourceId,replace,changed:queueGenerate,redraw:drawInputs,visibilityChanged:input=>api.setInputVisibility(sourceId,input.id,input.visible),error:message=>api.toast(message,'error'),printSettings:api.printSettings,printLinks:api.printLinks,setPrintLink:(target,key,on)=>api.setPrintLink(target,sourceId,key,on)});
  function syncPrintInputs(recalculate=true){const values=api.printSettings();let changed=false;for(const input of definition.inputs)if(input.printSetting&&Number.isFinite(values[input.printSetting])&&input.value!==values[input.printSetting]){input.value=values[input.printSetting];input.min=Math.min(input.min,input.value);input.max=Math.max(input.max,input.value);changed=true}if(changed){inputUi.syncValues();if(recalculate)queueGenerate()}return changed}
  document.addEventListener('input',event=>{if(Object.hasOwn(api.printSettings(),event.target.id))syncPrintInputs()});document.addEventListener('pathloom:print-links-changed',()=>syncPrintInputs());
  $('objectList').addEventListener('click',event=>{if(event.target.closest('.object-header'))selectGenerator(event.target.closest('.object-card').dataset.source)});
  document.addEventListener('pathloom:select-source',event=>selectGenerator(event.detail.sourceId));
  function setDrawing(value){drawing=value;const {controls}=api.preview();if(controls)controls.enabled=!value;if(value)status('Click to place curve points. Right-click finishes.');drawInputs()}
  function planePoint(event,z=0){const {THREE,camera,canvas}=api.preview();if(!THREE||!camera)return null;const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-z),hit))return null;const placement=api.placement(sourceId),a=-placement.rotation*Math.PI/180,x=hit.x-placement.x,y=hit.y-placement.y;return[Number((x*Math.cos(a)-y*Math.sin(a)).toFixed(3)),Number((x*Math.sin(a)+y*Math.cos(a)).toFixed(3))]}
  const {canvas}=api.preview();let selectionStart=null;
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||workspaceMode==='output'||!$('cadShowInputs').checked)return;const {THREE,camera}=api.preview();if(!THREE||!camera)return;const rect=canvas.getBoundingClientRect(),placement=api.placement(sourceId),a=placement.rotation*Math.PI/180;let nearest=14;drag=null;
    for(const input of definition.inputs.filter(input=>input.visible&&input.exposed===true)){
      const points=input.type==='point'?[input.value]:input.type==='curve'?input.curve.points:[];
      points.forEach(([x,y,z=.1],index)=>{const point=new THREE.Vector3(x*Math.cos(a)-y*Math.sin(a)+placement.x,x*Math.sin(a)+y*Math.cos(a)+placement.y,z).project(camera),distance=Math.hypot((point.x+1)*rect.width/2+rect.left-event.clientX,(1-point.y)*rect.height/2+rect.top-event.clientY);if(distance<nearest){nearest=distance;drag={inputId:input.id,index,z:input.type==='point'?z:0}}});
    }
    if(!drawing&&!drag)return;
    if(drag)inputUi.choose(drag.inputId);
    event.stopImmediatePropagation();event.preventDefault();if(api.preview().controls)api.preview().controls.enabled=false;pointerStart=[event.clientX,event.clientY];canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{if(!drag)return;const input=definition.inputs.find(i=>i.id===drag.inputId),point=planePoint(event,drag.z);if(input&&point){if(input.type==='curve')input.curve.points[drag.index]=point;else input.value=[...point,input.value[2]];drawInputs()}},true);
  function finishPointer(event){if(!pointerStart)return;
    if(drawing&&!drag&&Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])<5){const input=inputUi.selected(),point=planePoint(event);if(input?.type==='curve'&&point&&input.curve.points.length<256)input.curve.points.push(point)}
    drag=null;pointerStart=null;if(api.preview().controls)api.preview().controls.enabled=!drawing;inputUi.refresh();queueGenerate();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup',finishPointer,true);canvas.addEventListener('pointercancel',finishPointer,true);
  canvas.addEventListener('pointerdown',event=>{if(!drawing&&event.button===0)selectionStart=[event.clientX,event.clientY]});
  canvas.addEventListener('pointerup',event=>{if(!drawing&&selectionStart&&Math.hypot(event.clientX-selectionStart[0],event.clientY-selectionStart[1])<4){const id=api.pickSource(event);if(id)selectGenerator(id)}selectionStart=null});
  canvas.addEventListener('contextmenu',event=>{if(drawing){event.preventDefault();setDrawing(false)}},true);
  $('cadDrawNew').addEventListener('click',()=>{const input=inputUi.selected();if(input?.type!=='curve')return;input.curve.points=[];inputUi.refresh();setDrawing(true);markPending('Place at least three points for a closed section.')});
  $('cadNew').addEventListener('click',newGenerator);$('cadName').addEventListener('change',()=>{definition.name=$('cadName').value;queueGenerate()});$('cadShowInputs').addEventListener('change',drawInputs);
  for(const[id,delta]of [['cadUndo',-1],['cadRedo',1]])$(id).addEventListener('click',()=>{const index=generationError&&delta<0?historyIndex:historyIndex+delta;if(index<0||index>=history.length)return;historyIndex=index;definition=clone(history[index]);render();updateUndo();queueGenerate(false)});
  $('cadToggle').addEventListener('click',()=>{$('cadPanel').hidden=!$('cadPanel').hidden;api.lockPreview(!$('cadPanel').hidden);if($('cadPanel').hidden&&drawing)setDrawing(false);if(!$('cadPanel').hidden){drawInputs();chat?.refresh()}});
  async function loadLibrary(){try{library=normalizeLibrary(JSON.parse(await invoke('cad_library')));renderLibrary()}catch(error){status(error.message)}}
  function renderLibrary(){const host=$('cadLibrary'),previous=host.value;host.replaceChildren();const matches=searchLibrary(library,$('cadLibrarySearch').value,$('cadLibraryFilter').value);for(const entry of matches){const option=document.createElement('option');option.value=entry.id;option.textContent=`${entry.name} · v${entry.revision} · ${entry.kind==='operation'?'Component':'Legacy project'}`;host.append(option)}if(matches.some(entry=>entry.id===previous))host.value=previous;$('cadLibraryInfo').textContent=matches.length?`${matches.length} saved Components`:'No matching Components';inputUi?.refresh()}
  $('cadLibrarySearch').addEventListener('input',renderLibrary);$('cadLibraryFilter').addEventListener('change',renderLibrary);
  $('cadLibrary').addEventListener('change',()=>{const entry=library.find(e=>e.id===$('cadLibrary').value);if(entry){$('cadLibraryInfo').textContent=[entry.description,...entry.tags].filter(Boolean).join(' · ');$('cadLibraryName').value=entry.name;$('cadLibraryDescription').value=entry.description;$('cadLibraryTags').value=entry.tags.join(', ')}});
  $('cadLibrarySave').addEventListener('click',async()=>{
    try{if(pending)throw new Error('Wait for generation to finish');if(generationError)throw new Error('Fix the generation error before saving a library item');const kind='operation',previous=library.find(e=>e.id===$('cadLibrary').value),name=$('cadLibraryName').value||definition.name;
      const entry=saveLibraryEntry(library,{kind,definition,stepId:$('cadLibraryStep').value,name,description:$('cadLibraryDescription').value,tags:$('cadLibraryTags').value.split(',').map(s=>s.trim()).filter(Boolean),previousId:$('cadLibraryRevision').checked&&previous?.kind===kind?previous.id:null},crypto.randomUUID(),new Date().toISOString());
      const next=normalizeLibrary([...library,entry]);await invoke('cad_library',{content:JSON.stringify(next)});library=next;renderLibrary();$('cadLibrary').value=entry.id;status(`Saved ${entry.name} · v${entry.revision}`);
    }catch(error){status(error.message)}
  });
  let savingComponentId=null;
  function isSavedComponent(step){const spec=operationSpec(definition,step);if(!spec?.recipe)return true;return library.some(entry=>entry.kind==='operation'&&entry.step.operation===step.operation&&entry.step.version===step.version&&recipeFingerprint(entry.recipes?.find(r=>r.id===spec.id&&r.version===spec.version))===recipeFingerprint(definition.recipes?.find(r=>r.id===spec.id&&r.version===spec.version)))}
  function openComponentSave(id){const step=definition.steps.find(s=>s.id===id);if(!step)return;savingComponentId=id;const spec=operationSpec(definition,step),previous=library.find(entry=>entry.id===step.origin?.libraryId);$('componentSaveName').value=step.label||spec.label;$('componentSaveGroup').value=previous?.group||componentGroup(definition,step);$('componentRevisionRow').hidden=!previous;$('componentSaveRevision').checked=!!previous;$('componentSaveError').textContent='';$('componentGroupOptions').replaceChildren();for(const group of [...new Set([...COMPONENT_GROUPS,...library.map(e=>e.group).filter(Boolean)])]){const option=document.createElement('option');option.value=group;$('componentGroupOptions').append(option)}$('componentSaveDialog').showModal()}
  $('componentSaveClose').addEventListener('click',()=>$('componentSaveDialog').close());
  $('componentSaveForm').addEventListener('submit',async event=>{event.preventDefault();try{if(pending||generationError)throw new Error('Finish valid generation before saving a Component');const step=definition.steps.find(s=>s.id===savingComponentId);if(!step)throw new Error('Component no longer exists');const group=$('componentSaveGroup').value.trim(),name=$('componentSaveName').value.trim();if(!group||group.length>80)throw new Error('Choose a group');const previous=library.find(e=>e.id===step.origin?.libraryId);const snapshot=clone(definition),saved=snapshot.steps.find(s=>s.id===step.id);saved.group=group;saved.label=name;const entry=saveLibraryEntry(library,{kind:'operation',definition:snapshot,stepId:step.id,name,group,description:previous?.description||'',tags:previous?.tags||[],previousId:$('componentSaveRevision').checked?previous?.id:null},crypto.randomUUID(),new Date().toISOString());const next=normalizeLibrary([...library,entry]);$('componentSaveConfirm').disabled=true;await invoke('cad_library',{content:JSON.stringify(next)});library=next;Object.assign(step,{group,label:name,origin:{libraryId:entry.id,revision:entry.revision}});api.setComponentMetadata(sourceId,step.id,{group,label:name,origin:step.origin});renderLibrary();$('componentSaveDialog').close();api.toast(`Saved Component · ${name}`)}catch(error){$('componentSaveError').textContent=error.message}finally{$('componentSaveConfirm').disabled=false}});
  function useLibraryEntry(id,addNode=false){try{const entry=library.find(e=>e.id===id);if(!entry)return;chat?.cancel();
    if(entry.kind==='operation')replace(applyLibraryOperation(definition,entry,{replaceTerminal:!addNode}));
    else{cancelJob();sourceId=null;generatorKey=`cad:${crypto.randomUUID()}`;definition=migrateDefinition(entry.definition);history=[];historyIndex=-1;render();generate()}
  }catch(error){status(error.message)}}
  $('cadLibraryLoad').addEventListener('click',()=>useLibraryEntry($('cadLibrary').value));
  const addMenu=document.createElement('div');addMenu.className='operation-context add-node-menu';addMenu.hidden=true;addMenu.setAttribute('aria-label','Add Component menu');document.body.append(addMenu);
  function closeAddMenu(){addMenu.hidden=true}
  function createWithAi(){closeAddMenu();setMode('generate');chat?.newComponent()}
  function showAddMenu(event){
    if(workspaceMode!=='generate'||event.defaultPrevented||event.target.closest('.graph-node,.node-toolbar,.node-port,.node-wire,.operation-shell,button,input,textarea,select,summary,a,form,details'))return;
    event.preventDefault();document.getElementById('cadInputInspector').hidden=true;document.querySelectorAll('.operation-context').forEach(menu=>menu.hidden=true);addMenu.replaceChildren();
    const root=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Add Component';root.append(heading);
    const makeGroup=(parent,label)=>{const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=label;detail.append(summary);parent.append(detail);return detail};
    for(const group of COMPONENT_GROUPS.filter(g=>g!=='Custom')){const members=Object.entries(OPERATIONS).filter(([,spec])=>spec.group===group);if(!members.length)continue;const category=makeGroup(root,group);for(const[operation,spec]of members){const button=document.createElement('button');button.type='button';button.textContent=spec.label;button.addEventListener('click',()=>{try{closeAddMenu();replace(appendComponent(definition,operation))}catch(error){api.toast(error.message,'error')}});category.append(button)}}
    const saved=makeGroup(root,'Library'),items=searchLibrary(library,'','operation');if(!items.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No saved Components yet';saved.append(empty)}
    for(const group of [...new Set(items.map(entry=>entry.group||'Custom'))]){const category=makeGroup(saved,group);for(const entry of items.filter(e=>(e.group||'Custom')===group)){const button=document.createElement('button');button.type='button';button.textContent=`${entry.name} · v${entry.revision}`;button.title=entry.description||entry.name;button.addEventListener('click',()=>{closeAddMenu();useLibraryEntry(entry.id,true)});category.append(button)}}
    const create=document.createElement('button');create.type='button';create.textContent='New Component with AI…';create.addEventListener('click',createWithAi);root.append(create);const importButton=document.createElement('button');importButton.type='button';importButton.textContent='Import Component…';importButton.addEventListener('click',()=>{closeAddMenu();$('cadImportDefinition').click()});root.append(importButton);addMenu.append(root);addMenu.hidden=false;
    const rect=addMenu.getBoundingClientRect(),anchor=$('cadSteps').getBoundingClientRect(),x=Number.isFinite(event.clientX)&&event.clientX>0?event.clientX:anchor.left+12,y=Number.isFinite(event.clientY)&&event.clientY>0?event.clientY:anchor.top+12;addMenu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';addMenu.style.top=Math.max(8,Math.min(y,innerHeight-Math.min(420,innerHeight-16)-8))+'px';heading.focus();
  }
  document.querySelector('.cad-chat-column .island-content').addEventListener('contextmenu',showAddMenu);
  document.addEventListener('pointerdown',event=>{if(!addMenu.contains(event.target))closeAddMenu()});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAddMenu()});
  $('cadExportDefinition').addEventListener('click',()=>{try{download('generator.json',JSON.stringify(validateDefinition(definition),null,2))}catch(error){status(error.message)}});
  $('cadExportLibraryItem').addEventListener('click',()=>{const entry=library.find(item=>item.id===$('cadLibrary').value);if(!entry){status('Select a saved library item');return}download('library-item.json',JSON.stringify({format:'pathloom-library-item',version:1,entry},null,2))});
  $('cadImportDefinition').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{
    const raw=JSON.parse(await file.text());
    if(raw.format==='pathloom-library-item'){
      if(raw.version!==1)throw new Error('Unsupported library item version');const[entry]=normalizeLibrary([raw.entry]);
      if(library.some(item=>item.id===entry.id))throw new Error('This library version is already imported');
      const next=normalizeLibrary([...library,entry]);await invoke('cad_library',{content:JSON.stringify(next)});library=next;renderLibrary();status(`Imported ${entry.name}`);
    }else{chat?.cancel();cancelJob();definition=migrateDefinition(validateDefinition(raw));sourceId=null;generatorKey=`cad:${crypto.randomUUID()}`;history=[];historyIndex=-1;render();generate()}
    }catch(error){status(error.message)}event.target.value=''});

  function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  $('cadExportPaths').addEventListener('click',()=>{const source=api.sources().find(s=>s.id===sourceId);if(!source||source.generationError){status('Generate a valid object first');return}download(`${source.label}.toolpath`,JSON.stringify({paths:source.paths},null,2))});
  async function saveProject(as=false){try{if(pending)throw new Error('Wait for generation to finish');if(generationError)throw new Error('Fix the generation error before saving');const project=validateProject(api.captureProject());const path=await invoke('save_pathloom_project',{content:JSON.stringify(project),currentPath:as?null:projectPath});if(path){projectPath=path;api.toast('Project saved');$('projectName').textContent=path.split('/').pop()}}catch(error){api.toast(error.message,'error')}}
  window.__TAURI__?.event?.listen('project-menu',event=>{const id={open:'projectOpen',save:'projectSave','save-as':'projectSaveAs',settings:'openSettings'}[event.payload];if(id)$(id).click()});
  $('projectSave').addEventListener('click',()=>saveProject());$('projectSaveAs').addEventListener('click',()=>saveProject(true));
  $('projectOpen').addEventListener('click',async()=>{if(!window.confirm('Open a project and replace the current workspace? Save your work first.'))return;
    try{const file=await invoke('open_pathloom_project');if(!file)return;const project=validateProject(JSON.parse(file.content));chat?.cancel();cancelJob();setDrawing(false);api.restoreProject(project);projectPath=file.path;$('projectName').textContent=file.path.split('/').pop();const generated=api.sources().filter(s=>s.generator),selected=generated.find(s=>s.id===project.cad?.sourceId)||generated[0];
      if(selected){sourceId=selected.id;generatorKey=selected.liveSource||`cad:${sourceId}`;definition=migrateDefinition(selected.generator)}else{sourceId=null;generatorKey=`cad:${crypto.randomUUID()}`;definition=migrateDefinition(DEFAULT_DEFINITION)}
      generationError=null;chat?.restore(project.cad?.chat);$('cadShowInputs').checked=project.view.showInputs;history=[];historyIndex=-1;remember();inputUi.restoreSelection(project.cad?.selectedInputId||'section');render();drawInputs();status('Project restored.');if(selected){selectedStep=definition.steps.some(step=>step.id===project.cad?.previewStepId)?project.cad.previewStepId:null;$('cadPanel').hidden=false;setMode(project.cad?.mode||'generate');generate(false)}else{$('cadPanel').hidden=false;setMode(project.cad?.mode||'output')}
    }catch(error){api.toast(error.message,'error')}
  });
  document.addEventListener('pathloom:source-removed',event=>{if(event.detail?.liveSource===generatorKey){chat?.cancel();cancelJob();sourceId=null;disposeInputs();status('Generated object deleted')}});
  async function saveAiRecipes(snapshot,before){
    let next=[...library];const updates=[];
    for(const step of snapshot.steps){
      const previous=next.find(entry=>entry.id===step.origin?.libraryId),old=before.steps.find(value=>value.id===step.id);
      if(!previous||!old)continue;
      const signature=(d,item)=>recipeFingerprint({operation:item.operation,version:item.version,params:Object.fromEntries(Object.entries(item.params).map(([key,value])=>[key,resolveValue(d,value)])),recipe:operationSpec(d,item)?.recipe?d.recipes.find(r=>`recipe:${r.id}`===item.operation&&r.version===item.version):null});
      if(signature(before,old)===signature(snapshot,step))continue;
      const entry=saveLibraryEntry(next,{kind:'operation',definition:snapshot,stepId:step.id,name:previous.name,description:previous.description,tags:previous.tags,group:previous.group||componentGroup(snapshot,step),previousId:previous.id},crypto.randomUUID(),new Date().toISOString());next.push(entry);updates.push({id:step.id,group:entry.group,label:entry.name,origin:{libraryId:entry.id,revision:entry.revision}});
    }
    if(updates.length){next=normalizeLibrary(next);await invoke('cad_library',{content:JSON.stringify(next)});library=next;for(const update of updates){const {id,...metadata}=update,current=definition.steps.find(s=>s.id===id);if(current){Object.assign(current,metadata);api.setComponentMetadata(sourceId,id,metadata)}}renderLibrary()}
  }
  chat=initCadChat({definition:()=>clone(definition),library:()=>library,stamp:()=>{const content=clone(definition);delete content.editor;return JSON.stringify({sourceId,definition:content})},preview:result=>api.previewProposal(result),clearPreview:()=>{},async apply(proposed){const before=clone(definition),next=migrateDefinition(proposed);for(const step of next.steps){const old=definition.steps.find(s=>s.id===step.id);for(const key of ['group','label','origin'])if(old?.[key]!==undefined)step[key]=clone(old[key])}if(definition.editor)next.editor=clone(definition.editor);for(const input of next.inputs){const old=definition.inputs.find(i=>i.id===input.id);input.exposed=old?.exposed===true;if(old?.printSetting&&input.type==='number')input.printSetting=old.printSetting}definition=next;render();generate();try{await saveAiRecipes(clone(next),before)}catch(error){api.toast(`Component library: ${error.message}`,'error')}}});
  window.PathloomCad={snapshot:()=>({sourceId,selectedInputId:inputUi.selectedId(),previewStepId:selectedStep,mode:workspaceMode,chat:chat.snapshot()}),isProcessing:()=>workspaceMode!=='output'&&!$('cadPanel').hidden,refreshInputs:drawInputs};
  render();updateUndo();api.lockPreview(true);loadLibrary();chat?.refresh();
}
