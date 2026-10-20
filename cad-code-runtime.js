import {createEngine} from './vendor/quickjs/runtime.js';
let engine;
export async function initCodeRuntime(){engine??=await createEngine();return runComponentCode}
export function runComponentCode(code,input,params,{sliceBrep,brep,timeLimit=750,returns='curve'}={}){
  if(!engine)throw new Error('Code runtime is not initialized');
  const runtime=engine.newRuntime();runtime.setMemoryLimit(64*1024*1024);runtime.setMaxStackSize(256*1024);
  const deadline=Date.now()+timeLimit;runtime.setInterruptHandler(()=>Date.now()>deadline);
  const context=runtime.newContext();let pending;
  try{
    const section=context.newFunction('__section',(h,t)=>{try{if(!brep||!sliceBrep)throw new Error('cad.section requires an editable B-rep input');const result=sliceBrep(brep,context.dump(h),context.dump(t));return context.newString(JSON.stringify(result))}catch(error){if(error.nativeSlice)pending=error;return {error:context.newError(error.message||'Native section requested')}}});
    context.setProp(context.global,'__section',section);section.dispose();
    const payload=JSON.stringify({input,params});if(payload.length>24*1024*1024)throw new Error('Component input is too large');
    const result=context.evalCode(`"use strict";const {input,params}=JSON.parse(${JSON.stringify(payload)});const cad=Object.freeze({section:(height,tolerance=.02)=>JSON.parse(__section(height,tolerance))});const output=(function(input,params,cad){"use strict";\n${code}\n})(input,params,cad);const json=JSON.stringify(output,(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Component output must be finite');return value});if(json===undefined)throw new Error('Component must return a value');if(json.length>16*1024*1024)throw new Error('Component output is too large');json;`,'component.js');
    if(pending){result.error?.dispose();result.value?.dispose();throw pending}
    if(result.error){const error=context.dump(result.error);result.error.dispose();throw new Error(`Component code: ${error.message||error}`)}
    const json=context.getString(result.value);result.value.dispose();const output=JSON.parse(json);
    const finite=value=>typeof value==='number'&&Number.isFinite(value);
    if(returns==='number'){if(!finite(output))throw new Error('Component must return a finite number');return output}
    if(returns==='boolean'){if(typeof output!=='boolean')throw new Error('Component must return a boolean');return output}
    if(returns==='tool-info'){if(!output||!Array.isArray(output.sequence)||!output.sequence.length||output.sequence.some(t=>!Number.isInteger(t)||t<0||t>4)||![0,1].includes(output.mode))throw new Error('Component must return Tool information with sequence and mode');return output}
    if(!Array.isArray(output))throw new Error('Component must return an array');
    if(returns==='points'||returns==='list'){if(output.length>300000||output.some(value=>returns==='points'? !Array.isArray(value)||value.length!==3||!value.every(finite):!finite(value)))throw new Error('Component returned invalid points or numbers');return output}
    let count=0;for(const curve of output){if(!curve||!Array.isArray(curve.points)||curve.points.length<2)throw new Error('Component must return curves with at least two points');count+=curve.points.length;if(count>300000||curve.points.some(p=>!Array.isArray(p)||![2,3].includes(p.length)||p.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw new Error('Invalid or excessive Component geometry');if(curve.tool!==undefined&&(!Number.isInteger(curve.tool)||curve.tool<0||curve.tool>4))throw new Error('Component Tool must be 0–4')}
    return output;
  }finally{context.dispose();runtime.dispose()}
}
