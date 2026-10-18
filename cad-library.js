import {validateDefinition,DEFAULT_DEFINITION} from './cad-kernel.js';
import {acceptsGeometryType,recipeFingerprint,componentGroup,operationSpec,OPERATIONS,inputReferences,curveInputReferences,uniqueId,validatePipeline,migrateDefinition} from './cad-pipeline.js';
export function normalizeLibrary(raw){
  if(!Array.isArray(raw)||raw.length>500)throw new Error('Invalid library');
  const ids=new Set();
  return raw.map(entry=>{
    if(!entry||typeof entry.id!=='string'||ids.has(entry.id))throw new Error('Invalid library identity');ids.add(entry.id);
    if(entry.kind!=='operation'){
      const definition=validateDefinition(entry.definition);
      return {...entry,kind:'generator',name:entry.name||definition.name,description:entry.description||'',tags:entry.tags||[],revision:entry.revision||1,definition};
    }
    const spec=operationSpec({recipes:entry.recipes},entry.step);
    if(!spec||!spec.recipe&&entry.step.version!==1||!Array.isArray(entry.inputs)||typeof entry.name!=='string'||!Number.isInteger(entry.revision)||entry.revision<1)throw new Error('Invalid saved Component');
    if(entry.inputs.length>128||typeof entry.description!=='string'||!Array.isArray(entry.tags)||entry.tags.some(tag=>typeof tag!=='string'))throw new Error('Invalid operation metadata');
    if(entry.group!==undefined&&(typeof entry.group!=='string'||!entry.group.trim()||entry.group.length>80))throw new Error('Invalid Component group');
    applyLibraryOperation(migrateDefinition(DEFAULT_DEFINITION),entry);
    return {...structuredClone(entry),group:entry.group||spec.group||'Custom'};
  });
}
export function searchLibrary(library,query='',kind='all'){
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return library.filter(entry=>kind==='all'||(entry.kind||'generator')===kind).map(entry=>{
    const name=entry.name||entry.definition?.name||'',text=[name,entry.description,...(entry.tags||[]),entry.step?.operation,entry.group,entry.kind].join(' ').toLowerCase();
    return{entry,score:terms.reduce((score,term)=>score+(text.includes(term)?1:0)+(name.toLowerCase().includes(term)?2:0),0),matches:terms.every(term=>text.includes(term))};
  }).filter(item=>item.matches).sort((a,b)=>b.score-a.score||(b.entry.savedAt||'').localeCompare(a.entry.savedAt||'')).map(item=>item.entry);
}
export function saveLibraryEntry(library,{kind,definition,stepId,name,description='',tags=[],group=null,previousId=null},id,savedAt){
  if(!name?.trim()||name.length>120||description.length>1000||tags.some(tag=>typeof tag!=='string'||tag.length>60))throw new Error('Enter a library name (max 120 characters)');
  const previous=library.find(entry=>entry.id===previousId);
  if(previous&&previous.kind!==kind)throw new Error('Choose a previous version of the same kind');
  const familyId=previous?.familyId||previous?.id||id,revision=Math.max(0,...library.filter(entry=>(entry.familyId||entry.id)===familyId).map(entry=>entry.revision||1))+1;
  const entry={id,familyId,parentId:previous?.id||null,revision,kind,name:name.trim(),description,tags:tags.filter(Boolean),savedAt};
  const valid=validateDefinition(definition);
  if(kind==='generator')entry.definition=valid;
  else{
    const step=valid.steps.find(step=>step.id===stepId),spec=operationSpec(valid,step);
    if(valid.version!==2||!spec)throw new Error('Select a Component');
    entry.group=group||previous?.group||componentGroup(valid,step);if(typeof entry.group!=='string'||!entry.group.trim()||entry.group.length>80)throw new Error('Enter a Component group (max 80 characters)');
    if(spec.recipe)entry.recipes=structuredClone(valid.recipes);
    entry.curveSources=curveInputReferences(step,spec).filter(ref=>ref.startsWith('step:'));entry.step={...structuredClone(step),group:entry.group};entry.inputs=structuredClone(valid.inputs.filter(input=>inputReferences(step).includes(input.id)||curveInputReferences(step,spec).includes(input.id)));
  }
  return entry;
}
export function applyLibraryOperation(definition,entry,{replaceTerminal=true}={}){
  if(definition.version!==2||entry.kind!=='operation')throw new Error('Choose a saved Component');
  const d=structuredClone(definition);if(entry.recipes){d.recipes??=[];for(const recipe of entry.recipes){const old=d.recipes.find(r=>r.id===recipe.id&&r.version===recipe.version);if(old&&recipeFingerprint(old)!==recipeFingerprint(recipe))throw new Error('Conflicting recipe version; save a new version');if(!old)d.recipes.push(structuredClone(recipe))}}
  const step=structuredClone(entry.step),mapping=new Map();const current=d.steps.find(s=>s.id===d.output);if(replaceTerminal&&entry.recipes&&current?.operation===step.operation&&!d.steps.some(s=>s.source===current.id||s.sources?.includes(current.id))){d.steps=d.steps.filter(s=>s.id!==current.id);d.output=current.source}
  const entrySpec=operationSpec({recipes:entry.recipes},step),curveRefs=curveInputReferences(step,entrySpec);if(entry.curveSources!==undefined&&(!Array.isArray(entry.curveSources)||entry.curveSources.length>32||entry.curveSources.some(ref=>typeof ref!=='string'||!ref.startsWith('step:'))))throw new Error('Invalid saved Curve bindings');if([...inputReferences(step),...curveRefs].some(id=>!entry.inputs.some(input=>input.id===id)&&!entry.curveSources?.includes(id)))throw new Error('Missing saved input snapshot');
  for(const input of entry.inputs){const copy=structuredClone(input),id=uniqueId(input.id,d.inputs.map(i=>i.id));mapping.set(input.id,id);copy.id=id;if(copy.type==='number')copy.key=id;d.inputs.push(copy)}
  if(step.source?.startsWith('input:')&&mapping.has(step.source.slice(6)))step.source=`input:${mapping.get(step.source.slice(6))}`;
  const savedCurveSource=step.source?.startsWith('input:')?step.source:null;
  for(const[key,value]of Object.entries(step.params))if(value&&typeof value==='object'&&!Array.isArray(value)&&value.input)step.params[key]={input:mapping.get(value.input)};
  for(const[key,type]of Object.entries(entrySpec?.params||{}))if(type==='curves')step.params[key]=step.params[key].map(id=>entry.curveSources?.includes(id)?`step:${d.output}`:mapping.get(id));
  const spec=operationSpec(d,step),compatible=type=>acceptsGeometryType(spec.accepts,type),upstream=savedCurveSource||(operationSpec(d,d.steps.find(s=>s.id===d.output))?.returns&&compatible(operationSpec(d,d.steps.find(s=>s.id===d.output)).returns)?d.output:[...d.steps].reverse().find(s=>compatible(operationSpec(d,s)?.returns))?.id);if(spec.accepts&&spec.accepts!=='branches'&&!upstream)throw new Error('No compatible geometry for this Component');step.id=uniqueId(step.operation.replace(/[^A-Za-z0-9_-]/g,'-'),d.steps.map(step=>step.id));if(spec.accepts==='branches'){const sources=[d.output,...d.steps.map(s=>s.id).reverse()].filter((id,i,a)=>a.indexOf(id)===i&&operationSpec(d,d.steps.find(s=>s.id===id))?.returns==='paths');if(sources.length<2)throw new Error('Merge needs two outputs');step.sources=sources.slice(0,2);delete step.source}else if(spec.accepts){step.source=upstream;delete step.sources}else{delete step.source;delete step.sources}step.group=entry.group||spec.group||'Custom';step.label=entry.name;step.origin={libraryId:entry.id,revision:entry.revision};const terminal=d.steps.find(s=>s.id===d.output&&s.operation==='to-toolpath');if(terminal&&spec.accepts&&acceptsGeometryType(spec.accepts,'layers'))step.source=terminal.source;d.steps.push(step);if(terminal&&operationSpec(d,step).returns==='layers'){d.steps=d.steps.filter(s=>s!==terminal);terminal.source=step.id;d.steps.push(terminal)}else if(['curve','contours','paths','layers'].includes(operationSpec(d,step).returns))d.output=step.id;
  return validatePipeline(d);
}
