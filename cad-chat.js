import {createDesignEnvelope} from './cad-ai-context.js';
import {createCadWorker} from './cad-worker-client.js';
import {OPERATIONS,RECIPE_FORMAT,CODE_COMPONENT_FORMAT,COMPONENT_GROUPS,assertRecipeUpgrade,operationSpec,validateStepEdit,validateNewComponent,detachComponent} from './cad-pipeline.js';
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
  let connected=false,busy=false,requestId=0,messages=[],loginTimer=null,loginPolls=0,activeTicket=null,computeCancel=null,connectionRequest=null;
  const invoke=(command,args={})=>{if(!window.__TAURI__?.core?.invoke)throw new Error('AI generation requires Pathloom Desktop');return window.__TAURI__.core.invoke(command,args)};
  const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
  const state=(phase,extra={})=>emit('pathloom:ai-state',{ticket:activeTicket,phase,...extra});
  const say=(role,text)=>{messages.push({role,text:String(text).slice(0,12000)});messages=messages.slice(-30)};
  function openSettings(){const dialog=$('aiSettingsDialog');if(!dialog.open)dialog.showModal();void refresh()}
  document.addEventListener('pathloom:ai-settings',openSettings);
  $('aiSettingsClose').addEventListener('click',()=>$('aiSettingsDialog').close());
  $('aiSettingsDialog').addEventListener('click',event=>{if(event.target===$('aiSettingsDialog'))$('aiSettingsDialog').close()});
  function refresh(){return connectionRequest??=refreshConnection().finally(()=>connectionRequest=null)}
  async function refreshConnection(){
    $('cadAiRefresh').disabled=true;$('cadConnectionSummary').textContent='接続を確認しています…';
    try{
      const info=await invoke('codex_status');connected=!!info.connected;
      $('cadAiStatus').textContent=connected?`ChatGPT · ${info.account?.plan||'connected'}`:info.message||'Codexにサインインしてください';
      $('cadConnectionSummary').textContent=connected?'ChatGPTに接続済み':'ChatGPTに接続';
      const select=$('cadAiModel');let previous=select.value;try{previous ||= localStorage.getItem('pathloom.ai-model')}catch{}
      select.replaceChildren();const models=Array.isArray(info.models)?info.models.filter(model=>typeof model.model==='string'):[];
      for(const model of models){const option=document.createElement('option');option.value=model.model;option.textContent=model.displayName||model.model;select.append(option)}
      select.value=models.some(model=>model.model===previous)?previous:(selectDefaultModel(models)?.model||'');
      $('cadAiUsage').textContent=connected?formatUsage(info.limits):'';
      if(connected){clearInterval(loginTimer);loginTimer=null}
    }catch(error){connected=false;$('cadConnectionSummary').textContent='接続できません';$('cadAiStatus').textContent=error.message||String(error)}
    finally{$('cadAiRefresh').disabled=false;$('cadAiModel').disabled=busy}
    return connected;
  }
  $('cadAiModel').addEventListener('change',()=>{try{localStorage.setItem('pathloom.ai-model',$('cadAiModel').value)}catch{}});
  $('cadAiRefresh').addEventListener('click',()=>void refresh());
  $('cadAiLogin').addEventListener('click',async()=>{
    try{await invoke('codex_login');$('cadAiStatus').textContent='ブラウザーでサインインを完了してください。';clearInterval(loginTimer);loginPolls=0;loginTimer=setInterval(()=>{if(++loginPolls>60){clearInterval(loginTimer);return}void refresh()},3000)}catch(error){$('cadAiStatus').textContent=error.message||String(error)}
  });
  function compute(definition,ownId){return new Promise((resolve,reject)=>{
    const worker=createCadWorker();let finished=false;
    const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timeout);worker.terminate();computeCancel=null;error?reject(error):resolve(result)};
    const timeout=setTimeout(()=>finish(new Error('Proposal exceeded the local generation limit')),30000);
    computeCancel=()=>finish(new Error('Request cancelled'));
    worker.onerror=event=>finish(new Error(event.message||'Proposal failed'));
    worker.onmessage=event=>{if(ownId!==requestId){finish(new Error('Request cancelled'));return}event.data.ok?finish(null,event.data.result):finish(new Error(event.data.error))};worker.postMessage({kind:'cad-validate',definition});
  })}
  async function submit({ticket,request,targetId=null,position,createComponent=!targetId}){
    if(busy||!request?.trim())return;
    activeTicket=ticket;busy=true;const ownId=++requestId,baseline=api.stamp(),definition=api.definition();
    state('connecting');$('cadAiModel').disabled=true;
    try{
      if(!connected&&!await refresh())throw new Error($('cadAiStatus').textContent||'Codex account is not connected');
      if(ownId!==requestId)return;
      if(targetId&&!definition.steps.some(step=>step.id===targetId))throw new Error('The selected Component changed or no longer exists');
      const model=$('cadAiModel').value;if(!model)throw new Error('No available AI model. Open AI settings and connect your Codex account.');
      say('user',request);state('generating');
      const proposalRequest={model,context:{request,definition,createComponent:createComponent?'Add exactly one new Component, using a custom recipe for internal steps or a code Component for a new algorithm. Keep existing components and inputs unchanged; Leave the new Component unconnected: pendingInputs:true, no source, empty sources for branches, empty arrays for curves parameters. Preserve output/toolOutput and all Print output settings. The user will wire it manually.':null,editTarget:targetId?{stepId:targetId,scope:'Only edit this component, keeping its ID, other components, unrelated inputs and graph output. Shared parameter values can change. For a new algorithm convert this component to a versioned code Component following codeComponentFormat; create a new version for existing recipes and preserve other instances.'}:null,supportedOperations:OPERATIONS,customRecipeFormat:RECIPE_FORMAT,codeComponentFormat:CODE_COMPONENT_FORMAT,componentGroups:COMPONENT_GROUPS.filter(group=>group!=='Custom'),history:messages.slice(-8,-1),library:relevantLibrary(api.library(),request),rules:['Assign new Components to the most relevant existing componentGroups category (Curve, Geometry, Transform, Pattern, Toolpath or Utility); never use Library as a Component group. Keep existing groups on edits.','Curve is the shared geometry type. Internal contours/layers tags are legacy dimension representations, not user-facing types. Raw Curve inputs connect directly using source input:<id>. Sections is legacy sampling, not required conversion. Resample only when explicit point-count control is needed. Curve-list parameters accept raw input IDs or step:<component-id> for generated Curve collections. Check closure, plane and Z as geometric attributes, not separate user-facing types.','Print output has two independent inputs: definition.output references layers or paths geometry; optional definition.toolOutput references a tool-info Component. tool-info is standalone and returns Tool assignment rules (sequence, mode: 0 by layer, 1 by curve), not geometry. Do not put tool-info in geometry source chains. Use layer-curves for new stacking. Final conversion happens inside Print output; no to-toolpath node is necessary. build-toolpath optionally prepares seam, reverse direction and nearest ordering and returns paths. Preserve both output references unless explicitly changing them. Legacy stack/assign-tool/to-toolpath remain readable but should not be added to new graphs. Surface inputs imported from STEP contain editable B-rep data and cached meshes. Preserve that data unchanged; never fabricate B-rep content. slice-step converts a surface input into Curve layers. CAD face edits use native UI operations, not numeric mesh edits.','For comparisons between independent Curve collections, declare code params such as a:curves and b:curves, with defaults as empty arrays; instance values contain raw Curve input IDs or step:<id> references. Runtime params receive actual Curve collections. Closest points between two curves should return points:[[x,y,z],[x,y,z]] as a pair via returns:points (return the array itself, not a points wrapper). Point/number/list/boolean outputs are valid construction data and must not replace definition.output, which is the Print output connection.','Use bottom for bottom fill; shells count is an integer 1–8. Obey operation constraints.','Intermediate Curve geometry may be any finite 3D curve: vertical, nonplanar, open, closed, self-intersecting, or below Z=0. Preserve existing Print output connections when creating construction geometry; only connect it to Print output when explicitly requested. Horizontal planar and nonnegative Z constraints apply only to printing','nondecreasing layer Z','tools 0–4','validate typed input references and operation versions','Code only inside versioned code Components executed in the isolated runtime; follow codeComponentFormat']}};
      const envelope=createDesignEnvelope(proposalRequest.context);proposalRequest.context=envelope.context;
      let response=await invoke('codex_propose',proposalRequest),proposed;
      for(let attempt=0;attempt<2;attempt++){
        if(ownId!==requestId)return;
        state('validating');
        try{
          let restored=envelope.restore(response.definition);
          if(restored.steps.some(step=>!definition.steps.some(old=>old.id===step.id))){restored.output=definition.output;if(definition.toolOutput!==undefined)restored.toolOutput=definition.toolOutput;else delete restored.toolOutput;for(const step of restored.steps.filter(s=>!definition.steps.some(old=>old.id===s.id)))restored=detachComponent(restored,step.id)}
          proposed=validateDefinition(restored);if(targetId)validateStepEdit(definition,proposed,targetId);if(createComponent)validateNewComponent(definition,proposed);
          assertRecipeUpgrade(definition,proposed);for(const entry of api.library())assertRecipeUpgrade({recipes:entry.recipes||entry.definition?.recipes||[]},proposed);
          await compute(proposed,ownId);break;
        }catch(error){if(attempt||ownId!==requestId||api.stamp()!==baseline)throw error;state('repairing',{error:error.message});response=await invoke('codex_propose',{...proposalRequest,context:envelope.repair(response.definition,error.message||String(error))})}
      }
      if(ownId!==requestId)return;
      if(api.stamp()!==baseline)throw new Error('The inputs changed during generation. Generate again for the current graph.');
      state('applying');
      const added=proposed.steps.filter(step=>!definition.steps.some(old=>old.id===step.id));
      const applied=await api.apply(proposed,{position,addedIds:added.map(step=>step.id)});
      if(ownId!==requestId)return;
      const stepId=targetId||added[0]?.id;
      state('done',{stepId,updated:!!targetId,warning:applied?.warning});say('assistant',targetId?'Component updated':'Component created');
    }catch(error){if(ownId===requestId){state('error',{error:error.message||String(error)});say('assistant',error.message||String(error))}}
    finally{if(ownId===requestId){busy=false;$('cadAiModel').disabled=false}}
  }
  function cancel(){if(!busy)return;requestId++;busy=false;computeCancel?.();try{Promise.resolve(invoke('codex_cancel')).catch(()=>{})}catch{}state('cancelled');$('cadAiModel').disabled=false}
  document.addEventListener('pathloom:ai-submit',event=>void submit(event.detail));
  document.addEventListener('pathloom:ai-cancel',event=>{if(!event.detail?.ticket||event.detail.ticket===activeTicket)cancel()});
  function compose(options){if(busy)return;emit('pathloom:ai-compose',options)}
  return {newComponent:position=>compose({position}),editStep:id=>{const step=api.definition().steps.find(s=>s.id===id);if(step)compose({targetId:id,label:step.label||operationSpec(api.definition(),step).label})},refresh,discard(){},cancel,submit,snapshot:()=>messages.map(message=>({...message})),restore(input){cancel();messages=Array.isArray(input)?input.filter(m=>['user','assistant'].includes(m?.role)&&typeof m.text==='string').slice(-30).map(m=>({role:m.role,text:m.text.slice(0,12000)})):[]}};
}
