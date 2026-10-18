import {OPERATIONS,RECIPE_FORMAT,assertRecipeUpgrade,operationSpec,validateStepEdit,validateNewComponent} from './cad-pipeline.js';
import {searchLibrary} from './cad-library.js';
import {validateDefinition} from './cad-kernel.js';
const $=id=>document.getElementById(id);
export function selectDefaultModel(models){return models.find(m=>/mini|nano/i.test(m.model+' '+m.displayName))||models.find(m=>m.isDefault)||models[0]}
export function formatUsage(limits){
  const bucket=limits?.rateLimits;if(!bucket?.primary)return 'Usage unavailable. Open Usage details for your plan limits.';
  return ['primary','secondary'].flatMap(key=>{const window=bucket[key];if(!window||!Number.isFinite(window.usedPercent))return[];const reset=Number.isFinite(window.resetsAt)?new Date(window.resetsAt*1000).toLocaleString():'unknown';return [`${Math.max(0,100-window.usedPercent)}% remaining · resets ${reset}`]}).join('\n');
}
export function relevantLibrary(library,request){
  const exact=searchLibrary(library,request),remaining=searchLibrary(library,'');
  const terms=request.toLowerCase().split(/\s+/).filter(Boolean);
  const score=entry=>terms.reduce((n,term)=>n+([entry.name||entry.definition?.name,entry.description,...(entry.tags||[])].join(' ').toLowerCase().includes(term)?1:0),0);
  return [...exact,...remaining.filter(entry=>!exact.some(item=>item.id===entry.id)).sort((a,b)=>score(b)-score(a))].slice(0,4).map(entry=>({id:entry.id,kind:entry.kind||'generator',name:entry.name||entry.definition?.name,description:entry.description,tags:entry.tags,revision:entry.revision||1,...(entry.kind==='operation'?{step:entry.step,inputs:entry.inputs,recipes:entry.recipes}:{definition:entry.definition})}));
}
export function initCadChat(api){
  let connected=false,busy=false,requestId=0,proposal=null,messages=[],loginTimer=null,loginPolls=0,editTarget=null,creating=false;
  const invoke=(command,args={})=>{if(!window.__TAURI__?.core?.invoke)throw new Error('Chat requires Pathloom Desktop');return window.__TAURI__.core.invoke(command,args)};
  function render(){const host=$('cadChatMessages');host.replaceChildren();for(const message of messages){const div=document.createElement('div');div.className='cad-chat-message';div.dataset.role=message.role;div.textContent=message.text;host.append(div)}host.scrollTop=host.scrollHeight}
  function say(role,text){if(role==='assistant')$('cadProcessingStatus').textContent=String(text);messages.push({role,text:String(text).slice(0,12000)});messages=messages.slice(-30);render()}
  function showEditTarget(){const step=api.definition().steps.find(step=>step.id===editTarget);if(!step)editTarget=null;$('cadEditTarget').hidden=!editTarget&&!creating;$('cadEditTargetLabel').textContent=step?`Editing · ${api.definition().steps.findIndex(item=>item.id===step.id)+1}. ${operationSpec(api.definition(),step).label}`:creating?'New Component':''}
  function clearEditTarget(){editTarget=null;creating=false;showEditTarget()}
  function editStep(id){cancel();const step=api.definition().steps.find(step=>step.id===id);if(!step)return;editTarget=id;showEditTarget();const input=$('cadChatInput');if(!input.value.trim())input.value='このComponentを修正して。変更内容：';input.focus();input.setSelectionRange(input.value.length,input.value.length)}
  function newComponent(){cancel();creating=true;showEditTarget();$('cadChatInput').value='新しいComponentを作成して。処理内容：';$('cadChatInput').focus()}
  $('cadClearEditTarget').addEventListener('click',clearEditTarget);
  function buttons(){
    $('cadChatSend').disabled=busy||!connected;$('cadChatCancel').hidden=!busy;$('cadAiModel').disabled=busy;$('cadClearEditTarget').disabled=busy;
    $('cadProposalActions').hidden=!proposal;$('cadChatInput').disabled=busy;
  }
  function discard(){proposal=null;api.clearPreview();buttons()}
  async function refresh(){
    $('cadAiRefresh').disabled=true;$('cadConnectionSummary').textContent='Connecting…';
    try{
      const info=await invoke('codex_status');connected=!!info.connected;
      $('cadAiStatus').textContent=connected?`ChatGPT · ${info.account?.plan||'connected'}`:info.message;
      $('cadConnectionSummary').textContent=connected?'Connection · ChatGPT':'Connect ChatGPT';
      const select=$('cadAiModel'),previous=select.value;select.replaceChildren();
      const models=Array.isArray(info.models)?info.models.filter(model=>typeof model.model==='string'):[];
      for(const model of models){const option=document.createElement('option');option.value=model.model;option.textContent=model.displayName||model.model;select.append(option)}
      select.value=models.some(model=>model.model===previous)?previous:(selectDefaultModel(models)?.model||'');
      $('cadAiUsage').textContent=connected?formatUsage(info.limits):'';
      if(connected){clearInterval(loginTimer);loginTimer=null}
    }catch(error){connected=false;$('cadConnectionSummary').textContent='Connection · unavailable';$('cadAiStatus').textContent=error.message||String(error)}
    finally{$('cadAiRefresh').disabled=false;buttons()}
  }
  $('cadAiRefresh').addEventListener('click',refresh);
  $('cadAiLogin').addEventListener('click',async()=>{
    try{await invoke('codex_login');$('cadAiStatus').textContent='Complete sign-in in your browser. Uses the local Codex account.';clearInterval(loginTimer);loginPolls=0;loginTimer=setInterval(()=>{if(++loginPolls>60){clearInterval(loginTimer);return}if(!$('cadAiRefresh').disabled)refresh()},3000)}
    catch(error){$('cadAiStatus').textContent=error.message||String(error)}
  });
  function compute(definition,ownId){return new Promise((resolve,reject)=>{
    const worker=new Worker('./cad-worker.js',{type:'module'});
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Proposal exceeded the local generation limit'))},5000);
    worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(new Error(event.message||'Proposal failed'))};
    worker.onmessage=event=>{clearTimeout(timeout);worker.terminate();if(ownId!==requestId){reject(new Error('Request cancelled'));return}event.data.ok?resolve(event.data.result):reject(new Error(event.data.error))};worker.postMessage(definition);
  })}
  $('cadChatForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const request=$('cadChatInput').value.trim();if(!request)return;
    if(!connected){$('cadAiStatus').closest('details').open=true;await refresh();if(!connected)return}
    if(editTarget&&!api.definition().steps.some(step=>step.id===editTarget)){say('assistant','The selected component no longer exists. Choose another component.');clearEditTarget();return}
    const model=$('cadAiModel').value;if(!model){say('assistant','Select an available model first.');return}
    discard();const ownId=++requestId,baseline=api.stamp(),definition=api.definition(),targetId=editTarget,createComponent=creating;
    say('user',request);$('cadChatInput').value='';busy=true;$('cadProcessingStatus').textContent='Generating processing…';buttons();
    try{
      const response=await invoke('codex_propose',{model,context:{request,definition,createComponent:createComponent?'Add exactly one new Component, using a custom recipe for internal steps. Keep existing components and inputs unchanged; connect a new geometry Component using definition.output, or a new Tool assignment using definition.toolOutput.':null,editTarget:targetId?{stepId:targetId,scope:'Only edit this component, keeping its ID, other components, unrelated inputs and graph output. Shared parameter values can change. For a new algorithm convert this component to a versioned custom recipe; create a new version for existing recipes and preserve other instances.'}:null,supportedOperations:OPERATIONS,customRecipeFormat:RECIPE_FORMAT,history:messages.slice(-8,-1),library:relevantLibrary(api.library(),request),rules:['Curve is the shared geometry type. Internal contours/layers tags are legacy dimension representations, not user-facing types. Raw Curve inputs connect directly using source input:<id>. Sections is legacy sampling, not required conversion. Resample only when explicit point-count control is needed. Curve-list parameters accept raw input IDs or step:<component-id> for generated Curve collections. Check closure, plane and Z as geometric attributes, not separate user-facing types.','Print output has two independent inputs: definition.output references layers or paths geometry; optional definition.toolOutput references a tool-info Component. tool-info is standalone and returns Tool assignment rules (sequence, mode: 0 by layer, 1 by curve), not geometry. Do not put tool-info in geometry source chains. Use layer-curves for new stacking. Final conversion happens inside Print output; no to-toolpath node is necessary. build-toolpath optionally prepares seam, reverse direction and nearest ordering and returns paths. Preserve both output references unless explicitly changing them. Legacy stack/assign-tool/to-toolpath remain readable but should not be added to new graphs. Surface/Brep is unsupported.','Use bottom for bottom fill; shells count is an integer 1–8. Obey operation constraints.','closed planar paths','nondecreasing layer Z','tools 0–4','validate typed input references and operation versions','no executable code']}});
      if(ownId!==requestId)return;
      const proposed=validateDefinition(response.definition);if(targetId)validateStepEdit(definition,proposed,targetId);if(createComponent)validateNewComponent(definition,proposed);assertRecipeUpgrade(definition,proposed);for(const entry of api.library())assertRecipeUpgrade({recipes:entry.recipes||entry.definition?.recipes||[]},proposed);const result=await compute(proposed,ownId);
      if(api.stamp()!==baseline){say('assistant','The inputs changed during generation. Send the request again for the updated shape.');return}
      await api.apply(proposed);showEditTarget();$('cadProcessingStatus').textContent='';
    }catch(error){if(ownId===requestId)say('assistant',error.message||String(error))}
    finally{if(ownId===requestId){busy=false;buttons();refresh()}}
  });
  function cancel(){clearEditTarget();requestId++;busy=false;discard();try{Promise.resolve(invoke('codex_cancel')).catch(()=>{})}catch{}buttons()}
  $('cadChatCancel').addEventListener('click',cancel);
  $('cadProposalDiscard').addEventListener('click',discard);
  $('cadProposalApply').addEventListener('click',()=>{
    if(!proposal)return;
    if(api.stamp()!==proposal.baseline){discard();say('assistant','Inputs changed; generate a new proposal.');return}
    const definition=proposal.definition;discard();api.apply(definition);
  });
  buttons();
  return {newComponent,editStep,clearEditTarget,refresh,discard,cancel,snapshot:()=>messages.map(message=>({...message})),restore(input){cancel();messages=Array.isArray(input)?input.filter(m=>['user','assistant'].includes(m?.role)&&typeof m.text==='string').slice(-30).map(m=>({role:m.role,text:m.text.slice(0,12000)})):[];render()}};
}
