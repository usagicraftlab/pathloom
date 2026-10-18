import {createEngine} from './vendor/quickjs/runtime.js';
let engine;
export async function initCodeRuntime(){engine??=await createEngine();return runComponentCode}
export function runComponentCode(code,input,params,{sliceBrep,brep,timeLimit=750}={}){
  if(!engine)throw new Error('Code runtime is not initialized');
  const runtime=engine.newRuntime();runtime.setMemoryLimit(64*1024*1024);runtime.setMaxStackSize(256*1024);
  const deadline=Date.now()+timeLimit;runtime.setInterruptHandler(()=>Date.now()>deadline);
  const context=runtime.newContext();let pending;
  try{
    const section=context.newFunction('__section',(h,t)=>{try{if(!brep||!sliceBrep)throw new Error('cad.section requires an editable B-rep input');const result=sliceBrep(brep,context.dump(h),context.dump(t));return context.newString(JSON.stringify(result))}catch(error){if(error.nativeSlice)pending=error;return {error:context.newError(error.message||'Native section requested')}}});
    context.setProp(context.global,'__section',section);section.dispose();
    const payload=JSON.stringify({input,params});if(payload.length>24*1024*1024)throw new Error('Component input is too large');
    const result=context.evalCode(`"use strict";const {input,params}=JSON.parse(${JSON.stringify(payload)});const cad=Object.freeze({section:(height,tolerance=.02)=>JSON.parse(__section(height,tolerance))});const output=(function(input,params,cad){"use strict";\n${code}\n})(input,params,cad);if(!Array.isArray(output))throw new Error('Return an array of curves');const json=JSON.stringify(output);if(json.length>16*1024*1024)throw new Error('Component output is too large');json;`,'component.js');
    if(pending){result.error?.dispose();result.value?.dispose();throw pending}
    if(result.error){const error=context.dump(result.error);result.error.dispose();throw new Error(`Component code: ${error.message||error}`)}
    const json=context.getString(result.value);result.value.dispose();const output=JSON.parse(json);
    let count=0;for(const curve of output){if(!curve||!Array.isArray(curve.points)||curve.points.length<2)throw new Error('Component must return curves with at least two points');count+=curve.points.length;if(count>300000||curve.points.some(p=>!Array.isArray(p)||![2,3].includes(p.length)||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)))throw new Error('Invalid or excessive Component geometry');if(curve.tool!==undefined&&(!Number.isInteger(curve.tool)||curve.tool<0||curve.tool>4))throw new Error('Component Tool must be 0–4')}
    return output;
  }finally{context.dispose();runtime.dispose()}
}
