import {BASIC_COMPONENTS,executeBasicComponent,executeCurveInputComponent,COMPONENT_GROUPS} from './cad-components.js';
export {COMPONENT_GROUPS};
// Typed input registry and versioned, data-only processing graph.
export const OPERATIONS = {
  ...BASIC_COMPONENTS,
  sections:{group:'Curve',label:'Sections',accepts:null,returns:'contours',params:{curves:'curves',samples:'number'},defaults:{curves:[],samples:180}},
  stack:{group:'Toolpath',label:'Stack / loft',accepts:'contours',returns:'paths',params:{height:'number',layerHeight:'number',loft:'boolean'},defaults:{height:60,layerHeight:.6,loft:false}},
  'twist-scale':{group:'Transform',label:'Twist / scale',accepts:'paths',returns:'paths',params:{rotation:'number',topScale:'number',pivot:'point',profile:'list'},defaults:{rotation:60,topScale:.7,pivot:[0,0,0],profile:[1]}},
  translate:{label:'Move',group:'Transform',accepts:'geometry',returns:'same',params:{offset:'point'},defaults:{offset:[0,0,0]}},
  'radial-wave':{group:'Pattern',label:'Radial wave',accepts:'paths',returns:'paths',params:{amplitude:'number',waves:'number',phase:'number',drift:'number',pivot:'point'},defaults:{amplitude:1,waves:6,phase:0,drift:90,pivot:[0,0,0]}},
  shells:{group:'Toolpath',description:'Wall shells, not a bottom fill. count must be an integer from 1 to 8; spacing 0.01–20 mm. For a bottom use bottom.',constraints:{count:{min:1,max:8,integer:true},spacing:{min:.01,max:20}},label:'Radial shells',accepts:'paths',returns:'paths',params:{count:'number',spacing:'number',pivot:'point'},defaults:{count:2,spacing:1,pivot:[0,0,0]}},
  bottom:{group:'Toolpath',label:'Bottom fill',description:'Add nested closed fill contours inside the first layers of a star-shaped wall boundary. Preserves walls and constant Z per layer. Use for a closed bottom, not shells with a large count. spacing should match print width. Unsupported overlapping/nested wall boundaries fail validation.',accepts:'paths',returns:'paths',params:{layers:'number',spacing:'number'},defaults:{layers:2,spacing:.6},constraints:{layers:{min:1,max:20,integer:true},spacing:{min:.05,max:5}}},
  repeat:{label:'Linear array',group:'Pattern',accepts:'geometry',returns:'same',params:{count:'number',offset:'point'},defaults:{count:2,offset:[65,0,0]}},
  'assign-tool':{group:'Toolpath',label:'Tool sequence',accepts:'paths',returns:'paths',params:{sequence:'list'},defaults:{sequence:[0,1,2]}},
  merge:{group:'Utility',label:'Merge paths',accepts:'branches',returns:'paths',params:{},defaults:{}},
};
// Reusable data-only recipes expand to the same checked primitive graph.
export const RECIPE_FORMAT={operation:'recipe:<id>',version:'pinned recipe version',definition:{id:'custom-bottom',version:1,label:'Reusable bottom',accepts:'paths',params:{layers:'number',spacing:'number'},defaults:{layers:2,spacing:.6},steps:[{id:'fill',operation:'bottom',version:1,source:'$input',params:{layers:{parameter:'layers'},spacing:{parameter:'spacing'}}}],output:'fill'},rules:['recipes are embedded in definition.recipes','at most 16 recipes, 16 internal steps and 24 parameters each','native operations only inside recipes; no nested recipes or executable code','internal source $input is the incoming geometry','params reference outer recipe parameters with {parameter: name}','every declared parameter must be used with its declared type','change version when changing a recipe; preserve old definitions']};
export function operationSpec(definition,step,seen=new Set()){
  const operation=typeof step==='string'?step:step?.operation;if(OPERATIONS[operation]){const spec=OPERATIONS[operation];if(spec.returns==='same'&&typeof step!=='string'){if(seen.has(step.id))return {...spec,returns:'unknown'};seen.add(step.id);const source=(definition.steps||[]).find(s=>s.id===step.source);return {...spec,returns:source?operationSpec(definition,source,seen)?.returns:'unknown'}}return spec}
  const recipes=(definition?.recipes||[]).filter(r=>operation===`recipe:${r.id}`&&(typeof step==='string'||r.version===step.version)).sort((a,b)=>b.version-a.version);
  const recipe=recipes[0];return recipe?{...recipe,returns:'paths',recipe:true}:null;
}
function checkedRecipes(raw){
  const d=structuredClone(raw);if(!Array.isArray(d.recipes)||d.recipes.length>16||!Array.isArray(d.steps)||d.steps.length>32||!Array.isArray(d.inputs))throw new Error('Invalid custom recipe limits');
  const identities=new Set();
  for(const recipe of d.recipes){
    const identity=`${recipe.id}:${recipe.version}`;
    if(!idValid(recipe.id)||identities.has(identity)||!Number.isInteger(recipe.version)||recipe.version<1||typeof recipe.label!=='string'||!recipe.label.trim()||recipe.label.length>120||!['paths','contours'].includes(recipe.accepts)||!recipe.params||typeof recipe.params!=='object'||Array.isArray(recipe.params)||Object.keys(recipe.params).length>24||!recipe.defaults||typeof recipe.defaults!=='object'||!Array.isArray(recipe.steps)||!recipe.steps.length||recipe.steps.length>16)throw new Error('Invalid custom recipe definition');identities.add(identity);
    const results=new Map([['$input',recipe.accepts]]),used=new Set();
    for(const[key,type]of Object.entries(recipe.params))if(!idValid(key)||!['number','point','list','boolean'].includes(type)||!Object.hasOwn(recipe.defaults,key))throw new Error('Invalid recipe parameter schema');
    for(const step of recipe.steps){const spec=OPERATIONS[step.operation];if(!spec||!idValid(step.id)||results.has(step.id)||step.version!==1||!step.params||typeof step.params!=='object'||Object.keys(step.params).some(key=>!Object.hasOwn(spec.params,key)))throw new Error('Recipes can only contain supported native operations');
      if(spec.accepts==='branches'){if(!Array.isArray(step.sources)||step.sources.length<2||step.sources.length>8||step.sources.some(source=>results.get(source)!=='paths'))throw new Error('Invalid recipe branches')}
      else if(spec.accepts&&(spec.accepts==='geometry'?!['paths','contours'].includes(results.get(step.source)):results.get(step.source)!==spec.accepts))throw new Error('Invalid recipe geometry connection');
      if(!spec.accepts)throw new Error('Use incoming geometry for this recipe; standalone curve components are available in Curve');
      for(const[key,type]of Object.entries(spec.params)){const value=step.params[key];if(value&&typeof value==='object'&&!Array.isArray(value)){if(Object.keys(value).length!==1||recipe.params[value.parameter]!==type)throw new Error('Invalid recipe parameter reference');used.add(value.parameter)}else if(!validLiteral(type,value))throw new Error('Invalid recipe literal')}
      results.set(step.id,spec.returns==='same'?results.get(step.source):spec.returns);
    }
    if(results.get(recipe.output)!=='paths'||Object.keys(recipe.params).some(key=>!used.has(key)))throw new Error('Recipe needs a path output and used parameters');
    for(const[key,type]of Object.entries(recipe.params))if(!validLiteral(type,recipe.defaults[key]))throw new Error('Invalid recipe default');
  }
  return d;
}
function validLiteral(type,value){return type==='number'?finite(value):type==='boolean'?typeof value==='boolean':type==='point'?Array.isArray(value)&&value.length===3&&value.every(finite):type==='list'?Array.isArray(value)&&value.length>0&&value.length<=256&&value.every(finite):false}
export function expandRecipes(raw){
  const d=checkedRecipes(raw),mapping=new Map(),expanded=[],usedIds=new Set(d.steps.map(step=>step.id));
  for(const step of d.steps){const spec=operationSpec(d,step);if(!spec)throw new Error('Unknown custom recipe or version');
    const upstream=id=>mapping.get(id)||id;
    if(!spec.recipe){const copy=structuredClone(step);if(copy.source)copy.source=upstream(copy.source);if(copy.sources)copy.sources=copy.sources.map(upstream);expanded.push(copy);mapping.set(step.id,step.id);continue}
    if(!step.params||typeof step.params!=='object'||Array.isArray(step.params)||Object.keys(step.params).some(key=>!Object.hasOwn(spec.params,key)))throw new Error('Invalid recipe arguments');
    for(const[key,type]of Object.entries(spec.params)){const value=step.params[key];if(value&&typeof value==='object'&&!Array.isArray(value)){if(Object.keys(value).length!==1||d.inputs.find(input=>input.id===value.input)?.type!==type)throw new Error('Invalid typed recipe argument')}else if(!validLiteral(type,value))throw new Error('Missing or invalid recipe argument')}
    const local=new Map([['$input',upstream(step.source)]]);
    for(const inner of spec.steps){const copy=structuredClone(inner);copy.id=uniqueId('recipe-step',[...usedIds]);usedIds.add(copy.id);local.set(inner.id,copy.id);if(copy.source)copy.source=local.get(copy.source);if(copy.sources)copy.sources=copy.sources.map(id=>local.get(id));for(const[key,value]of Object.entries(copy.params))if(value&&typeof value==='object'&&!Array.isArray(value))copy.params[key]=structuredClone(step.params[value.parameter]);expanded.push(copy)}mapping.set(step.id,local.get(spec.output));
  }
  if(expanded.length>256)throw new Error('Expanded recipe graph is too large');d.steps=expanded;d.output=mapping.get(d.output)||d.output;delete d.recipes;return d;
}
export function recipeFingerprint(value){if(Array.isArray(value))return '['+value.map(recipeFingerprint).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+recipeFingerprint(value[key])).join(',')+'}';return JSON.stringify(value)}
export function assertRecipeUpgrade(previous,next){for(const recipe of next.recipes||[]){const old=(previous.recipes||[]).find(r=>r.id===recipe.id&&r.version===recipe.version);if(old&&recipeFingerprint(old)!==recipeFingerprint(recipe))throw new Error(`Increment the version before changing recipe ${recipe.id}`)}}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const idValid=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id);
const limit=(v,min,max,label)=>{if(!finite(v)||v<min||v>max)throw new Error(`Invalid ${label}`);return v};
export function numberParameters(definition){return definition?.version===2?definition.inputs.filter(input=>input.type==='number'):definition?.parameters||[]}
export function inputReferences(step){return Object.values(step.params||{}).flatMap(value=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.input==='string'?[value.input]:[])}
export function curveInputReferences(step,spec){return Object.entries(step.params||{}).filter(([key])=>spec?.params?.[key]==='curves').flatMap(([,ids])=>Array.isArray(ids)?ids:[])}
export function migrateDefinition(legacy){
  if(legacy.version===2)return structuredClone(legacy);
  const inputs=[{id:'section',name:'Section',group:'Geometry',type:'curve',visible:true,curve:{...structuredClone(legacy.curve),closed:true}},
    ...legacy.parameters.map(p=>p.key==='tools'?{id:'tools',name:'Tool sequence',group:'Parameters',type:'list',visible:true,value:Array.from({length:p.value},(_,i)=>i)}:{...structuredClone(p),id:p.key,name:p.label,group:'Parameters',type:'number',visible:true}),
    {id:'pivot',name:'Pivot',group:'Geometry',type:'point',value:[0,0,0],visible:true}];
  return{version:2,id:'pipeline',name:legacy.name,inputs,steps:[
    {id:'sections',operation:'sections',version:1,params:{curves:['section'],samples:{input:'samples'}}},
    {id:'stack',operation:'stack',version:1,source:'sections',params:{height:{input:'height'},layerHeight:{input:'layerHeight'},loft:false}},
    {id:'twist',operation:'twist-scale',version:1,source:'stack',params:{rotation:{input:'rotation'},topScale:{input:'topScale'},pivot:{input:'pivot'},profile:[1]}},
    {id:'tools',operation:'assign-tool',version:1,source:'twist',params:{sequence:{input:'tools'}}}
  ],output:'tools'};
}
export function validatePipeline(raw){
  if(raw?.recipes!==undefined){const d=checkedRecipes(raw);const expanded=validatePipeline(expandRecipes(d));d.inputs=expanded.inputs;return d}
  if(!raw||raw.version!==2||raw.id!=='pipeline')throw new Error('Unsupported pipeline version');
  const d=structuredClone(raw);validateEditorState(d.editor);
  if(typeof d.name!=='string'||!d.name.trim()||d.name.length>120)throw new Error('Invalid generator name');
  if(!Array.isArray(d.inputs)||d.inputs.length>128||!Array.isArray(d.steps)||!d.steps.length||d.steps.length>256)throw new Error('Input / operation limit exceeded');
  const inputs=new Map();
  for(const input of d.inputs){
    if(!idValid(input.id)||inputs.has(input.id)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120||typeof input.group!=='string'||input.group.length>80||typeof input.visible!=='boolean')throw new Error('Invalid input identity');
    if(input.exposed!==undefined&&typeof input.exposed!=='boolean')throw new Error('Invalid input exposure');
    if(input.printSetting!==undefined&&(input.type!=='number'||!['printWidth','printHeight','printSpeed','travelSpeed','nozzleTemperature','bedTemperature','fanSpeed'].includes(input.printSetting)))throw new Error('Invalid print setting reference');
    inputs.set(input.id,input);
    if(input.type==='curve'){
      const curve=input.curve;
      if(!curve||!['control','polyline'].includes(curve.type)||typeof curve.closed!=='boolean'||!Array.isArray(curve.points)||curve.points.length<2||curve.points.length>256||curve.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!finite(v)||Math.abs(v)>500)))throw new Error(`Invalid curve: ${input.name}`);
    }else if(input.type==='point'){
      if(!Array.isArray(input.value)||input.value.length!==3||input.value.some(v=>!finite(v)||Math.abs(v)>1000))throw new Error(`Invalid point: ${input.name}`);
    }else if(input.type==='number'){
      if(![input.min,input.max,input.step,input.value].every(finite)||input.min>=input.max||input.step<=0||input.value<input.min||input.value>input.max||Math.abs(input.min)>10000||Math.abs(input.max)>10000)throw new Error(`Invalid number: ${input.name}`);
      input.key=input.id;input.label=input.name;input.unit=typeof input.unit==='string'?input.unit.slice(0,12):'';
    }else if(input.type==='list'){
      if(!Array.isArray(input.value)||!input.value.length||input.value.length>256||input.value.some(v=>!finite(v)||Math.abs(v)>10000))throw new Error(`Invalid number list: ${input.name}`);
    }else throw new Error(`Unsupported input type: ${input.type}`);
  }
  const results=new Map();
  for(const step of d.steps){
    const spec=OPERATIONS[step.operation];
    if(!idValid(step.id)||results.has(step.id)||!spec||step.version!==1||!step.params||typeof step.params!=='object'||Array.isArray(step.params))throw new Error('Invalid operation or version');
    if(step.group!==undefined&&(typeof step.group!=='string'||!step.group.trim()||step.group.length>80))throw new Error('Invalid Component group');
    if(step.label!==undefined&&(typeof step.label!=='string'||!step.label.trim()||step.label.length>120))throw new Error('Invalid Component name');
    if(Object.keys(step.params).some(key=>!Object.hasOwn(spec.params,key)))throw new Error(`Unknown parameter in ${step.id}`);
    if(spec.accepts==='branches'){
      if(!Array.isArray(step.sources)||step.sources.length<2||step.sources.length>8||new Set(step.sources).size!==step.sources.length||step.sources.some(id=>results.get(id)!=='paths'))throw new Error('Merge needs prior path branches');
    }else if(spec.accepts&&(spec.accepts==='geometry'?!['paths','contours'].includes(results.get(step.source)):results.get(step.source)!==spec.accepts))throw new Error(`Invalid upstream input for ${step.id}`);
    for(const[key,type]of Object.entries(spec.params)){
      const value=step.params[key];
      if(type==='curves'){
        const minimum=spec.minCurves?.[key]??1;if(!Array.isArray(value)||value.length<minimum||value.length>16||new Set(value).size!==value.length||value.some(id=>inputs.get(id)?.type!=='curve'||spec.curveSelection==='closed'&&!inputs.get(id).curve.closed||inputs.get(id).curve.points.length<2))throw new Error(`Select ${spec.curveSelection==='closed'?'closed ':''}curve inputs for ${step.id}.${key}`);
      }else if(value&&typeof value==='object'&&!Array.isArray(value)){
        const input=inputs.get(value.input);if(Object.keys(value).length!==1||!input||input.type!==type)throw new Error(`Wrong input type for ${step.id}.${key}`);
      }else if(type==='number'&&!finite(value)||type==='boolean'&&typeof value!=='boolean'||type==='point'&&(!Array.isArray(value)||value.length!==3||!value.every(finite))||type==='list'&&(!Array.isArray(value)||!value.length||value.length>256||!value.every(finite)))throw new Error(`Invalid ${step.id}.${key}`);
      if(spec.choices?.[key]&&!spec.choices[key].some(choice=>choice.value===value))throw new Error(`Invalid choice for ${step.id}.${key}`);
    }
    if(step.operation==='sections'&&step.params.curves.some(id=>!inputs.get(id)?.curve.closed))throw new Error('Sections accepts closed curves only');
    results.set(step.id,spec.returns==='same'?results.get(step.source):spec.returns);
  }
  if(results.get(d.output)!=='paths')throw new Error('Pipeline output must contain paths');
  return d;
}
export function usedBy(definition,inputId){return definition.steps.filter(step=>inputReferences(step).includes(inputId)||curveInputReferences(step,operationSpec(definition,step)).includes(inputId)).map(step=>step.id)}
export function resolveValue(definition,value){return value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.input==='string'?definition.inputs.find(input=>input.id===value.input)?.value:value}
export function pipelineLayerHeight(definition){
  if(definition?.version!==2)return definition?.parameters?.find(p=>p.key==='layerHeight')?.value;
  if(definition.recipes!==undefined)definition=expandRecipes(definition);
  const values=new Map();for(const step of definition.steps){let value=values.get(step.source)??null;if(step.operation==='stack')value=resolveValue(definition,step.params.layerHeight);else if(step.operation==='scale'&&value!==null)value*=resolveValue(definition,step.params.factor);else if(step.operation==='scale-nu'&&value!==null)value*=resolveValue(definition,step.params.factors)[2];else if(step.sources){const pitches=step.sources.map(id=>values.get(id));value=pitches.length&&pitches.every(v=>v===pitches[0])?pitches[0]:null}values.set(step.id,value)}return values.get(definition.output)??null;
}
export function newInput(type,existing){
  const id=uniqueId(type,existing.map(input=>input.id));
  const base={id,name:type==='list'?'Number list':type[0].toUpperCase()+type.slice(1),group:type==='number'||type==='list'?'Parameters':'Geometry',type,visible:true};
  if(type==='curve')return{...base,curve:{type:'control',closed:true,points:[[12,0],[0,12],[-12,0],[0,-12]]}};
  if(type==='point')return{...base,value:[0,0,0]};
  if(type==='list')return{...base,value:[0,1,2]};
  return{...base,key:id,label:base.name,min:0,max:100,step:.1,unit:'mm',value:1};
}
export function uniqueId(prefix,existing){let i=1;while(existing.includes(`${prefix}-${i}`))i++;return `${prefix}-${i}`}
export function appendOperation(definition,operation){return appendComponent(definition,operation)}
export function appendComponent(definition,operation){
  const d=validatePipeline(definition),spec=operationSpec(d,operation);if(!spec)throw new Error('Choose a Component');
  const step={id:uniqueId(operation.replace(/[^A-Za-z0-9_-]/g,'-'),d.steps.map(step=>step.id)),operation,version:spec.recipe?spec.version:1,group:spec.group||'Custom',params:structuredClone(spec.defaults)};
  const type=id=>operationSpec(d,d.steps.find(s=>s.id===id))?.returns;
  if(spec.accepts==='branches'){const candidates=[d.output,...d.steps.map(s=>s.id).reverse()].filter((id,i,a)=>a.indexOf(id)===i&&type(id)==='paths');if(candidates.length<2)throw new Error('Merge needs two existing Toolpath outputs');step.sources=candidates.slice(0,2)}
  else if(spec.accepts){const accepts=type=>spec.accepts==='geometry'?['paths','contours'].includes(type):type===spec.accepts;const upstream=accepts(type(d.output))?d.output:[...d.steps].reverse().find(s=>accepts(type(s.id)))?.id;if(!upstream)throw new Error('Connect compatible geometry first');step.source=upstream}
  else if(operation==='sections'){const curve=d.inputs.find(i=>i.type==='curve'&&i.curve.closed);if(!curve)throw new Error('Sections needs a closed curve input');step.params.curves=[curve.id]}
  for(const[key,type]of Object.entries(spec.params))if(type==='curves'&&!step.params[key].length){const closed=spec.curveSelection==='closed',candidates=d.inputs.filter(input=>input.type==='curve'&&(!closed||input.curve.closed));if(operation==='curve-boolean'&&key==='b'){const next=candidates.find(input=>input.id!==step.params.a?.[0]);if(next)step.params[key]=[next.id]}else if(candidates[0])step.params[key]=[candidates[0].id];else if((spec.minCurves?.[key]??1)>0)throw new Error(`${spec.label} needs a curve input`)}
  d.steps.push(step);if(operationSpec(d,step).returns==='paths')d.output=step.id;return validatePipeline(d);
}
export function componentGroup(definition,step){return step.group||operationSpec(definition,step)?.group||'Custom'}
export function removeOperation(definition,id){
  const d=structuredClone(definition),step=d.steps.find(s=>s.id===id);if(!step)throw new Error('Unknown Component');const dependents=d.steps.filter(s=>s.source===id||s.sources?.includes(id));const upstream=step.source||step.sources?.[0];
  if(dependents.length&&!upstream)throw new Error('Reconnect the downstream Components before removing this input');
  for(const next of dependents){if(next.source===id)next.source=upstream;if(next.sources?.includes(id))next.sources=next.sources.map(source=>source===id?upstream:source)}
  d.steps=d.steps.filter(s=>s.id!==id);if(d.output===id){d.output=upstream&&operationSpec(d,d.steps.find(s=>s.id===upstream))?.returns==='paths'?upstream:[...d.steps].reverse().find(s=>operationSpec(d,s)?.returns==='paths')?.id}
  return validatePipeline(d);
}
export function executePipeline(raw,{sectionPoints,validateSection}){
  if(raw?.recipes!==undefined){const definition=validatePipeline(raw),result=executePipeline(expandRecipes(definition),{sectionPoints,validateSection});result.definition=definition;return result}
  const definition=validatePipeline(raw),results=new Map(),inputs=new Map(definition.inputs.map(i=>[i.id,i])),resolve=value=>structuredClone(resolveValue(definition,value));
  const ensureBudget=paths=>{if(paths.reduce((n,p)=>n+p.points.length,0)>300000)throw new Error('Too many points; reduce samples, layers or copies')};
  const warnings=[];let intermediatePoints=0;
  for(const step of definition.steps){
    const p=Object.fromEntries(Object.entries(step.params).map(([key,value])=>[key,resolve(value)]));let result;
    const source=step.source?results.get(step.source):null;
    const spec=operationSpec(definition,step);for(const[key,bounds]of Object.entries(BASIC_COMPONENTS[step.operation]?.constraints||{})){limit(p[key],bounds.min??-10000,bounds.max??10000,key);if(bounds.integer&&!Number.isInteger(p[key]))throw new Error(`${key} must be an integer`)}
    if(BASIC_COMPONENTS[step.operation]&&Object.values(spec.params).includes('curves')){result=executeCurveInputComponent(step.operation,p,{inputs,sectionPoints,validateSection});if(spec.returns==='contours')for(const contour of result)validateSection(contour.points)}
    else if(BASIC_COMPONENTS[step.operation]){result=executeBasicComponent(step.operation,p,source);if(spec.returns==='contours')for(const contour of result)validateSection(contour.points)}
    else if(step.operation==='sections'){
      limit(p.samples,12,720,'samples');if(!Number.isInteger(p.samples))throw new Error('Samples must be an integer');
      result=p.curves.map(id=>{const points=sectionPoints(inputs.get(id).curve,p.samples);validateSection(points);return{inputId:id,points}});
    }else if(step.operation==='stack'){
      limit(p.height,.1,500,'height');limit(p.layerHeight,.05,5,'layer height');const layers=Math.floor((p.height+1e-8)/p.layerHeight);
      if(layers<1)throw new Error('Height must be at least one layer');const count=p.loft?1:source.length;
      if(layers*count*source[0].points.length>300000)throw new Error('Too many points; reduce samples or layers');
      result=[];
      for(let layer=0;layer<layers;layer++){
        const t=layers===1?0:layer/(layers-1),z=Number(((layer+1)*p.layerHeight).toFixed(6));
        if(p.loft){const position=t*(source.length-1),i=Math.floor(position),j=Math.min(source.length-1,i+1),blend=position-i;
          result.push({tool:0,points:source[i].points.map((point,k)=>[point[0]*(1-blend)+source[j].points[k][0]*blend,point[1]*(1-blend)+source[j].points[k][1]*blend,z])});
        }else for(const contour of source)result.push({tool:0,points:contour.points.map(([x,y])=>[x,y,z])});
      }
      if(Math.abs(p.height-layers*p.layerHeight)>1e-6)warnings.push(`Height rounded down to ${layers*p.layerHeight} mm`);
    }else if(step.operation==='merge')result=step.sources.flatMap(id=>structuredClone(results.get(id)));
    else{
      result=structuredClone(source);const zs=[...new Set(result.map(path=>path.points[0][2]))].sort((a,b)=>a-b),layerIndex=new Map(zs.map((z,i)=>[z,i]));
      if(step.operation==='assign-tool'){
        if(p.sequence.some(n=>!Number.isInteger(n)||n<0||n>4))throw new Error('Tool sequence needs IDs 0–4');
        for(const path of result)path.tool=p.sequence[layerIndex.get(path.points[0][2])%p.sequence.length];
      }else if(step.operation==='repeat'){
        if(source[0]?.points[0].length===2&&p.offset[2]!==0)throw new Error('Curve arrays are in XY; use Z offsets after Stack');limit(p.count,1,16,'copy count');if(!Number.isInteger(p.count))throw new Error('Copy count must be an integer');ensureBudget(Array.from({length:p.count},()=>source).flat());
        result=Array.from({length:p.count},(_,i)=>source.map(path=>({...path,points:path.points.map(point=>point.map((value,axis)=>value+i*p.offset[axis]))}))).flat();
      }else if(step.operation==='bottom'){
        limit(p.layers,1,20,'bottom layer count');if(!Number.isInteger(p.layers))throw new Error('Bottom layer count must be an integer');limit(p.spacing,.05,5,'bottom spacing');
        const bases=source.filter(path=>layerIndex.get(path.points[0][2])<p.layers),fills=[];let planned=source.reduce((n,path)=>n+path.points.length,0);
        for(const path of bases){
          const vertices=path.points.slice(0,-1),center=vertices.reduce((sum,point)=>[sum[0]+point[0]/vertices.length,sum[1]+point[1]/vertices.length],[0,0]);
          const radius=Math.max(...vertices.map(([x,y])=>Math.hypot(x-center[0],y-center[1]))),rings=Math.ceil(radius/p.spacing);
          if(rings>1024)throw new Error('Bottom fill is too dense; increase spacing');planned+=(rings-1)*path.points.length;if(planned>300000)throw new Error('Bottom fill exceeds point limit; increase spacing or reduce samples');
          // Homothetic rings stay simple; intersections with other boundaries are checked below.
          for(let rank=1;rank<rings;rank++){const scale=1-rank/rings;fills.push({...path,points:path.points.map(([x,y,z])=>[center[0]+(x-center[0])*scale,center[1]+(y-center[1])*scale,z])})}
        }
        result.push(...fills);
      }else if(step.operation==='shells'){
        if(!Number.isInteger(p.count)||p.count<1||p.count>8)throw new Error(`Wall shell count must be an integer from 1 to 8 (received ${p.count}). For a bottom, use Bottom fill.`);limit(p.spacing,.01,20,'shell spacing');if(!Number.isInteger(p.count))throw new Error('Shell count must be an integer');ensureBudget(Array.from({length:p.count},()=>source).flat());
        result=source.flatMap(path=>Array.from({length:p.count},(_,rank)=>({...path,points:path.points.map(([x,y,z])=>{const dx=x-p.pivot[0],dy=y-p.pivot[1],r=Math.hypot(dx,dy),next=r-rank*p.spacing;if(next<=.01)throw new Error('Shell offset reaches or crosses the pivot');return[p.pivot[0]+dx*next/r,p.pivot[1]+dy*next/r,z]})})));
      }else for(const path of result){
        const t=zs.length===1?0:layerIndex.get(path.points[0][2])/(zs.length-1);
        if(step.operation==='twist-scale'){
          limit(p.rotation,-3600,3600,'rotation');limit(p.topScale,.01,20,'top scale');if(p.profile.some(v=>v<=0||v>20))throw new Error('Scale profile must be positive');
          const pos=t*(p.profile.length-1),i=Math.floor(pos),blend=pos-i,profile=p.profile[i]*(1-blend)+p.profile[Math.min(i+1,p.profile.length-1)]*blend;
          const angle=p.rotation*t*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=(1+(p.topScale-1)*t)*profile;
          path.points=path.points.map(([x,y,z])=>{x-=p.pivot[0];y-=p.pivot[1];return[(x*c-y*s)*scale+p.pivot[0],(x*s+y*c)*scale+p.pivot[1],z]});
        }else if(step.operation==='translate'){if(path.points[0].length===2&&p.offset[2]!==0)throw new Error('Curve Move is in XY; move in Z after Stack');path.points=path.points.map(point=>point.map((v,axis)=>v+p.offset[axis]));}
        else if(step.operation==='radial-wave'){
          limit(p.amplitude,-20,20,'wave amplitude');limit(p.waves,1,64,'wave count');if(!Number.isInteger(p.waves))throw new Error('Wave count must be an integer');limit(p.phase,-36000,36000,'wave phase');limit(p.drift,-36000,36000,'wave drift');
          path.points=path.points.map(([x,y,z])=>{const dx=x-p.pivot[0],dy=y-p.pivot[1],radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),r=radius+p.amplitude*Math.cos(p.waves*angle+(p.phase+p.drift*t)*Math.PI/180);if(r<=.01)throw new Error('Wave reaches or crosses the pivot');return[p.pivot[0]+r*Math.cos(angle),p.pivot[1]+r*Math.sin(angle),z]});
        }
      }
    }
    if(spec.returns==='paths'||spec.returns==='contours'){ensureBudget(result);intermediatePoints+=result.reduce((n,path)=>n+path.points.length,0);if(intermediatePoints>2000000)throw new Error('Processing graph is too large; reduce points or operations')}
    else if(spec.returns==='points'){if(!Array.isArray(result)||result.length>300000||result.some(point=>!Array.isArray(point)||point.length!==3||!point.every(finite)))throw new Error('Point output exceeds the supported limit or contains invalid coordinates');intermediatePoints+=result.length;if(intermediatePoints>2000000)throw new Error('Processing graph is too large; reduce points or operations')}
    results.set(step.id,result);
  }
  const paths=results.get(definition.output).sort((a,b)=>a.points[0][2]-b.points[0][2]).map((path,order)=>({...path,order,points:path.points.map(point=>point.map(v=>Number(v.toFixed(6))))}));
  for(const path of paths){const z=path.points[0][2];if(z<0||path.points.some(point=>point.some(v=>!finite(v)||Math.abs(v)>10000)||Math.abs(point[2]-z)>1e-6))throw new Error('Output must be finite and planar with nonnegative Z');path.points[path.points.length-1]=[...path.points[0]];}
  validateOutput(paths);
  const previewPoints=definition.previewOutputId&&operationSpec(definition,definition.steps.find(step=>step.id===definition.previewOutputId))?.returns==='points'?results.get(definition.previewOutputId):[];
  return{definition,paths,previewPoints:previewPoints||[],section:[],warnings};
}
// Spatial bins test self-intersections and intersections between contours at a Z.
export function validateOutput(paths){
  let currentZ=null,bins=new Map(),segments=[];
  for(let curve=0;curve<paths.length;curve++){
    const path=paths[curve],z=path.points[0][2],n=path.points.length-1;if(z!==currentZ){bins=new Map();segments=[];currentZ=z}
    let area=0;
    for(let i=0;i<n;i++){
      const a=path.points[i],b=path.points[i+1];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)throw new Error(`Zero-length segment at Z ${z}`);area+=a[0]*b[1]-b[0]*a[1];
      const minX=Math.floor(Math.min(a[0],b[0])/4),maxX=Math.floor(Math.max(a[0],b[0])/4),minY=Math.floor(Math.min(a[1],b[1])/4),maxY=Math.floor(Math.max(a[1],b[1])/4);if((maxX-minX+1)*(maxY-minY+1)>25000)throw new Error('Segment bounds are too large');
      const cells=[];for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)cells.push(`${x},${y}`);
      const candidates=new Set(cells.flatMap(cell=>bins.get(cell)||[]));
      for(const id of candidates){const prior=segments[id];if(prior.curve===curve&&(i-prior.i===1||(i===n-1&&prior.i===0)))continue;
        if(intersects(a,b,prior.a,prior.b))throw new Error(`Intersecting output curves at Z ${z}`);
      }
      const id=segments.length;segments.push({a,b,curve,i});for(const cell of cells){if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(id)}
    }
    if(Math.abs(area)<1e-6)throw new Error(`Collapsed output curve at Z ${z}`);
  }
}
function intersects(a,b,c,d){
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-7||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-7||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-7||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-7)return false;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);return cross(a,b,c)*cross(a,b,d)<=1e-12&&cross(c,d,a)*cross(c,d,b)<=1e-12;
}

// A disposable graph for inspecting a stage; never replaces printable output.
export function stageDefinition(raw,stepId){
  const definition=validatePipeline(migrateDefinition(raw));
  const index=definition.steps.findIndex(step=>step.id===stepId);
  if(index<0)throw new Error('Unknown processing stage');
  if(operationSpec(definition,definition.steps[index]).returns==='points'){definition.previewOutputId=stepId;return definition}
  definition.steps=definition.steps.slice(0,index+1);
  const step=definition.steps[index];
  if(operationSpec(definition,step).returns==='contours'){
    const id=uniqueId('preview-stack',definition.steps.map(step=>step.id));
    definition.steps.push({id,operation:'stack',version:1,source:step.id,params:{height:.6,layerHeight:.6,loft:false}});definition.output=id;
  }else definition.output=step.id;
  return validatePipeline(definition);
}

// Display-only approximation: fewer samples/layers; never saved or exported.
export function displayDefinition(raw,stepId=null){
  let d=stepId?stageDefinition(raw,stepId):validatePipeline(migrateDefinition(raw));if(d.recipes!==undefined)d=expandRecipes(d);
  for(const step of d.steps){
    if(step.params.samples!==undefined)step.params.samples=Math.min(48,resolveValue(d,step.params.samples));
    if(step.operation==='stack'){const height=resolveValue(d,step.params.height),spacing=resolveValue(d,step.params.layerHeight),layers=Math.floor((height+1e-8)/spacing);if(layers>24){const count=Math.max(24,Math.ceil(height/5));step.params.height=layers*spacing;step.params.layerHeight=layers*spacing/count}}
  }
  return d;
}

export const PRINT_PARAMETERS={printWidth:'Print width',printHeight:'Print height',printSpeed:'Print speed',travelSpeed:'Travel speed',nozzleTemperature:'Nozzle temperature',bedTemperature:'Bed temperature',fanSpeed:'Fan speed'};
export function linkParameter(raw,targetId,key,sourceId,sourceKey,printValues=null){
  const d=validatePipeline(raw),target=d.steps.find(s=>s.id===targetId),type=target&&operationSpec(d,target)?.params[key];
  if(!['number','point','list'].includes(type))throw new Error('This parameter cannot be linked');
  let input;
  if(sourceId==='print-settings'){
    if(type!=='number'||!Object.hasOwn(PRINT_PARAMETERS,sourceKey)||!Number.isFinite(printValues?.[sourceKey]))throw new Error('Invalid print setting link');
    input=d.inputs.find(i=>i.printSetting===sourceKey);
    if(!input){input=newInput('number',d.inputs);Object.assign(input,{name:PRINT_PARAMETERS[sourceKey],value:printValues[sourceKey],min:0,max:10000,step:.01,exposed:false,unit:{printWidth:'mm',printHeight:'mm',printSpeed:'mm/s',travelSpeed:'mm/s',nozzleTemperature:'°C',bedTemperature:'°C',fanSpeed:'%'}[sourceKey],printSetting:sourceKey});d.inputs.push(input)}
  }else{
    const source=d.steps.find(s=>s.id===sourceId);if(!source||targetId===sourceId&&key===sourceKey||operationSpec(d,source).params[sourceKey]!==type)throw new Error('Choose a compatible parameter on another component');
    input=d.inputs.find(i=>i.id===source.params[sourceKey]?.input);
    if(!input){input=newInput(type,d.inputs);input.name=`${operationSpec(d,source).label} · ${sourceKey}`;input.value=structuredClone(resolveValue(d,source.params[sourceKey]));input.exposed=false;if(type==='number'){input.unit='';input.min=Math.min(0,input.value-1);input.max=Math.min(10000,Math.max(100,input.value*2));input.step=.01}d.inputs.push(input);source.params[sourceKey]={input:input.id}}
  }
  target.params[key]={input:input.id};return validatePipeline(d);
}
export function unlinkParameter(raw,stepId,key){const d=validatePipeline(raw),step=d.steps.find(s=>s.id===stepId);if(!step)throw new Error('Unknown component');step.params[key]=structuredClone(resolveValue(d,step.params[key]));return validatePipeline(d)}

export function validateNewComponent(before,after){
  const original=validatePipeline(before),next=validatePipeline(after),added=next.steps.filter(step=>!original.steps.some(old=>old.id===step.id));
  if(added.length!==1||next.steps.length!==original.steps.length+1)throw new Error('Add exactly one new Component; use a recipe for internal components');
  for(const key of ['steps','inputs'])for(const item of original[key])if(recipeFingerprint(item)!==recipeFingerprint(next[key].find(value=>value.id===item.id)))throw new Error('New Component must preserve existing components and inputs');
  if(next.output!==original.output&&next.output!==added[0].id)throw new Error('Choose the original output or the new Component output');
  return next;
}

export function validateStepEdit(before,after,stepId){
  const original=validatePipeline(before),next=validatePipeline(after),target=original.steps.find(step=>step.id===stepId),updated=next.steps.find(step=>step.id===stepId);
  if(!target||!updated)throw new Error('Keep the selected component ID when editing it');
  if(original.output!==next.output||original.steps.length!==next.steps.length||original.steps.some((step,index)=>step.id!==next.steps[index]?.id))throw new Error('Edit only the selected component; use a custom recipe for multiple internal steps');
  for(const step of original.steps)if(step.id!==stepId&&recipeFingerprint(step)!==recipeFingerprint(next.steps.find(s=>s.id===step.id)))throw new Error(`AI changed another component (${step.id}); the edit was not applied`);
  const editable=new Set([...inputReferences(target),...inputReferences(updated),...curveInputReferences(target,operationSpec(original,target)),...curveInputReferences(updated,operationSpec(next,updated))]);
  for(const input of original.inputs)if(!editable.has(input.id)&&recipeFingerprint(input)!==recipeFingerprint(next.inputs.find(i=>i.id===input.id)))throw new Error(`AI changed an unrelated input (${input.name}); the edit was not applied`);
  return next;
}

export function validateEditorState(editor){
  if(editor===undefined)return;
  if(!editor||typeof editor!=='object'||!editor.nodes||typeof editor.nodes!=='object'||Array.isArray(editor.nodes)||Object.keys(editor.nodes).length>512)throw new Error('Invalid node layout');
  for(const position of Object.values(editor.nodes))if(!position||![position.x,position.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000))throw new Error('Invalid node position');
  if(editor.view&&(![editor.view.x,editor.view.y,editor.view.zoom].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(editor.view.x)>100000||Math.abs(editor.view.y)>100000||editor.view.zoom<.15||editor.view.zoom>2))throw new Error('Invalid graph view');
}
