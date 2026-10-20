// Only this envelope crosses the AI boundary. CAD payloads stay in the vault.
const clone=value=>structuredClone(value);
const CAD_FIELDS=['meshes','brep','faces','kernel'];
const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export const DESIGN_PATCH_FORMAT={format:'pathloom-design-patch',inputs:{upsert:[],remove:[]},steps:{upsert:[],remove:[]},recipes:{upsert:[]},rules:['Return this patch as the JSON string in definitionJson; send only changed items.','Upserts merge existing inputs/steps by id; new items must be complete. Recipe identity is id + version.','Optional printOutput.intro has enabled, gap (mm, 0.1–200), length (mm, 0.1–200), angle (degrees, -360–360; 0 extends toward +X, 90 toward +Y). It adds one lead-in on the first layer per object. Set output to a step/input ID only when changing it. Set toolOutput:null to disconnect tools.','Multiple print objects use optional printOutputs: [{id,name,source,toolSource?,intro?}]. The primary uses output/toolOutput and printOutput.name; preserve all objects unless explicitly changing them. In a patch, printOutputs replaces the whole additional-output array. Each output becomes a separately placed object in Print Settings.', 'Preserve local geometryRef and codeRef tokens. Never send meshes, brep, faces or kernel data.','Do not remove unchanged nodes or inputs. Existing recipe versions are immutable; add a new version.']};
function summary(input){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertices=0,triangles=0;
  for(const mesh of input.meshes||[]){const p=mesh.positions||[];vertices+=p.length/3;triangles+=(mesh.indices?.length||0)/3;for(let i=0;i<p.length;i++)if(Number.isFinite(p[i])){const axis=i%3;min[axis]=Math.min(min[axis],p[i]);max[axis]=Math.max(max[axis],p[i])}}
  return {editable:!!input.brep,vertices,triangles,faces:input.faces?.length||0,...(min.every(Number.isFinite)?{bounds:{min,max},dimensions:max.map((v,i)=>v-min[i])}:{})};
}
function upsert(items,changes,key,merge=true){
  if(!Array.isArray(changes)||changes.length>512)throw new Error('Invalid AI patch items');const seen=new Set();
  for(const change of changes){if(!change||typeof change!=='object'||Array.isArray(change))throw new Error('Invalid AI patch item');const id=key(change);if(!id||seen.has(id))throw new Error('Duplicate or missing AI patch identity');seen.add(id);const index=items.findIndex(item=>key(item)===id);if(index<0)items.push(clone(change));else items[index]=merge?{...items[index],...clone(change)}:clone(change)}return items;
}
function applyPatch(base,patch){
  const next=clone(base);
  for(const field of ['inputs','steps','recipes']){const changes=patch[field];if(changes===undefined)continue;if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('Invalid AI patch');next[field]??=[];const key=item=>field==='recipes'?`${item.id}:${item.version}`:item.id;
    if(changes.remove!==undefined){if(field==='recipes'||!Array.isArray(changes.remove)||changes.remove.some(id=>typeof id!=='string'))throw new Error('Invalid AI patch removal');next[field]=next[field].filter(item=>!changes.remove.includes(item.id))}
    if(changes.upsert!==undefined)upsert(next[field],changes.upsert,key);
  }
  if(Object.hasOwn(patch,'printOutputs'))next.printOutputs=clone(patch.printOutputs);
  if(Object.hasOwn(patch,'printOutput'))next.printOutput=clone(patch.printOutput);
  if(Object.hasOwn(patch,'output'))next.output=patch.output;
  if(Object.hasOwn(patch,'toolOutput')){if(patch.toolOutput===null)delete next.toolOutput;else next.toolOutput=patch.toolOutput}
  return next;
}
export function createDesignEnvelope(raw,{maxBytes=140000}={}){
  const assets=new Map(),codes=new Map(),codeTokens=new Map();let assetIndex=0;
  function packGraph(graph){
    const copy=clone({...graph,inputs:[]});delete copy.editor;
    copy.inputs=(graph.inputs||[]).map(input=>{
      if(input.type!=='surface')return clone(input);
      const token=`geometry-${assetIndex++}`,metadata={...input};
      assets.set(token,clone(input));for(const key of CAD_FIELDS)delete metadata[key];
      return {...clone(metadata),geometryRef:token,geometrySummary:summary(input)};
    });return copy;
  }
  const context=clone({...raw,definition:null,library:[]});context.definition=packGraph(raw.definition);
  context.library=(raw.library||[]).map(entry=>{const copy=clone({...entry,definition:undefined,inputs:undefined});if(entry.definition)copy.definition=packGraph(entry.definition);else if(entry.inputs)copy.inputs=packGraph({inputs:entry.inputs}).inputs;return copy});
  context.patchFormat=DESIGN_PATCH_FORMAT;
  const baseline=clone(context.definition);
  function codeRef(recipe){if(!codeTokens.has(recipe.code)){const token=`code-${codes.size}`;codes.set(token,recipe.code);codeTokens.set(recipe.code,token)}return codeTokens.get(recipe.code)}
  function fit(value){
    const next=clone(value);if(size(next)<=maxBytes)return next;
    next.history=[];next.library=[];if(size(next)<=maxBytes)return next;
    const target=next.definition.steps?.find(s=>s.id===next.editTarget?.stepId),priority=target?.operation?.replace(/^recipe:/,'');
    const recipes=[...(next.definition.recipes||[]),...(next.definition.programs||[]),...(Array.isArray(next.validationFailure?.definition?.recipes)?next.validationFailure.definition.recipes:[]),...(next.validationFailure?.definition?.recipes?.upsert||[])];
    recipes.sort((a,b)=>(a.id===priority?1:0)-(b.id===priority?1:0));
    for(const recipe of recipes){if(typeof recipe.code!=='string')continue;recipe.codeRef=codeRef(recipe);delete recipe.code;if(size(next)<=maxBytes)return next}
    for(const spec of Object.values(next.supportedOperations||{}))delete spec.description;
    if(size(next)>maxBytes)throw new Error('AI context is still too large after omitting local geometry. Reduce the request text or edit one Component at a time.');return next;
  }
  function hydrate(candidate){
    const next=candidate?.format==='pathloom-design-patch'?applyPatch(baseline,candidate):clone(candidate);
    if(!next||!Array.isArray(next.inputs))throw new Error('AI returned an invalid design');
    for(const input of next.inputs){if(input.type!=='surface')continue;
      if(CAD_FIELDS.some(key=>Object.hasOwn(input,key))&&!(input.meshes?.length===0&&!input.brep&&!input.faces&&!input.kernel))throw new Error('AI must reference local CAD geometry, not return CAD payloads');
      if(input.geometryRef!==undefined){const original=assets.get(input.geometryRef);if(!original)throw new Error('Unknown local geometry reference');for(const key of CAD_FIELDS){if(Object.hasOwn(original,key))input[key]=clone(original[key]);else delete input[key]}}
      else if(raw.definition.inputs.some(old=>old.id===input.id&&old.type==='surface'))throw new Error('AI removed a local geometry reference');
      else input.meshes=[];
      delete input.geometryRef;delete input.geometrySummary;
    }
    for(const recipe of [...(next.recipes||[]),...(next.programs||[])])if(recipe.codeRef!==undefined){if(recipe.code!==undefined||!codes.has(recipe.codeRef))throw new Error('Unknown local code reference');recipe.code=codes.get(recipe.codeRef);delete recipe.codeRef}
    // Unreferenced historical versions and node layout remain local as well.
    for(const recipe of raw.definition.recipes||[])if(!next.recipes?.some(r=>r.id===recipe.id&&r.version===recipe.version)){next.recipes??=[];next.recipes.push(clone(recipe))}
    if(raw.definition.editor)next.editor=clone(raw.definition.editor);
    return next;
  }
  return {context:fit(context),restore:hydrate,repair(candidate,error){return fit({...context,validationFailure:{definition:clone(candidate),error:String(error).slice(0,2000),instruction:'Correct the failed candidate. Return only changed items using patchFormat, relative to context.definition.'}})}};
}
