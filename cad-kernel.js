import {validatePipeline, executePipeline} from './cad-pipeline.js';
// Versioned, data-only generator definitions. No eval or network access.
export const CAD_VERSION = 1;
export const DEFAULT_DEFINITION = {
  version: 1, id: 'stack-section', name: 'Stacked section',
  curve: { type: 'control', points: [[24,0],[16,18],[-4,24],[-22,10],[-20,-14],[3,-23],[22,-14]] },
  parameters: [
    { key:'height', label:'Height', unit:'mm', min:0.6, max:200, step:0.6, value:60 },
    { key:'layerHeight', label:'Layer height', unit:'mm', min:0.1, max:2, step:0.1, value:0.6 },
    { key:'rotation', label:'Total rotation', unit:'°', min:-360, max:360, step:1, value:60 },
    { key:'topScale', label:'Top scale', unit:'×', min:0.2, max:2, step:0.01, value:0.7 },
    { key:'samples', label:'Curve samples', unit:'', min:24, max:720, step:1, value:180 },
    { key:'tools', label:'Alternating tools', unit:'', min:1, max:5, step:1, value:1 },
  ],
  steps: [{ operation:'section', version:1 },{ operation:'stack', version:1 },{ operation:'twist-scale', version:1 },{ operation:'assign-tool', version:1 }],
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function validateDefinition(input) {
  if(input?.version===2)return validatePipeline(input);
  if (!input || input.version !== 1 || input.id !== 'stack-section') throw new Error('Unsupported generator version');
  const definition = structuredClone(input);
  if (typeof definition.name !== 'string' || !definition.name.trim() || definition.name.length>120) throw new Error('Invalid generator name');
  if (!['polyline','control'].includes(definition.curve?.type)) throw new Error('Unknown curve type');
  const points = definition.curve.points;
  if (!Array.isArray(points) || points.length<3 || points.length>256 || points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!finite(v)||Math.abs(v)>500))) throw new Error('Section needs 3–256 finite XY control points');
  const defaults=DEFAULT_DEFINITION.parameters;
  if (!Array.isArray(definition.parameters) || definition.parameters.length!==defaults.length) throw new Error('Invalid parameter definitions');
  definition.parameters=defaults.map(defaultParam=>{
    const param=definition.parameters.find(p=>p.key===defaultParam.key);
    if (!param || !finite(param.value) || param.value<defaultParam.min || param.value>defaultParam.max || (['tools','samples'].includes(param.key)&&!Number.isInteger(param.value))) throw new Error(`Invalid ${defaultParam.label}`);
    return {...defaultParam,value:param.value};
  });
  if (JSON.stringify(definition.steps)!==JSON.stringify(DEFAULT_DEFINITION.steps)) throw new Error('Unsupported processing steps');
  return definition;
}
export function sectionPoints(curve, count) {
  const input=curve.points,n=input.length,result=[];
  for(let index=0;index<count;index++){
    const segment=index*n/count,i=Math.floor(segment),t=segment-i;
    const p0=input[(i+n-1)%n],p1=input[i],p2=input[(i+1)%n],p3=input[(i+2)%n];
    if(curve.type==='polyline')result.push(p1.map((v,axis)=>v+(p2[axis]-v)*t));
    else result.push(p1.map((v,axis)=>0.5*((2*v)+(-p0[axis]+p2[axis])*t+(2*p0[axis]-5*v+4*p2[axis]-p3[axis])*t*t+(-p0[axis]+3*v-3*p2[axis]+p3[axis])*t*t*t)));
  }
  result.push([...result[0]]);return result;
}
function orientation(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])}
function intersects(a,b,c,d){
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-8||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-8||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-8||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-8)return false;
  return orientation(a,b,c)*orientation(a,b,d)<=1e-12&&orientation(c,d,a)*orientation(c,d,b)<=1e-12;
}
export function validateSection(points){
  const n=points.length-1;
  let area=0;
  for(let i=0;i<n;i++){
    const a=points[i],b=points[i+1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7)throw new Error(`Section segment ${i+1} has zero length`);
    area+=a[0]*b[1]-b[0]*a[1];
    for(let j=i+2;j<n;j++)if(!(i===0&&j===n-1)&&intersects(a,b,points[j],points[j+1]))throw new Error(`Section intersects at segments ${i+1} and ${j+1}`);
  }
  if(Math.abs(area)<1e-5)throw new Error('Section has no enclosed area');
}
export function generateCad(input,options={}){
  if(input?.version===2)return executePipeline(input,{sectionPoints,validateSection,...options});
  const definition=validateDefinition(input),p=Object.fromEntries(definition.parameters.map(p=>[p.key,p.value]));
  const layers=Math.floor((p.height+1e-8)/p.layerHeight);
  if(layers<1)throw new Error('Height must be at least one layer');
  if(layers*(p.samples+1)>300000)throw new Error('Too many points; reduce samples or layers');
  const section=sectionPoints(definition.curve,p.samples);validateSection(section);
  const paths=[];
  for(let layer=0;layer<layers;layer++){
    const t=layers===1?0:layer/(layers-1),angle=p.rotation*t*Math.PI/180,scale=1+(p.topScale-1)*t,c=Math.cos(angle),s=Math.sin(angle),z=Number(((layer+1)*p.layerHeight).toFixed(6));
    const points=section.map(([x,y])=>[Number(((x*c-y*s)*scale).toFixed(6)),Number(((x*s+y*c)*scale).toFixed(6)),z]);points[points.length-1]=[...points[0]];
    paths.push({order:layer,tool:layer%p.tools,points});
  }
  return {definition,paths,section,warnings:Math.abs(p.height-layers*p.layerHeight)>1e-6?[`Height rounded down to ${layers*p.layerHeight} mm for complete layers`]:[]};
}
