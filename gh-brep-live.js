import {newInput,validatePipeline} from './cad-pipeline.js';
import {validateEditableShape} from './step-import.js';
export function updateRhinoInput(raw,payload,shape){
  if(!['brep.update','brep.clear'].includes(payload?.type)||typeof payload.source!=='string'||!payload.source.trim()||payload.source.length>120)throw new Error('Invalid Grasshopper B-rep source');
  const definition=structuredClone(raw);let input=definition.inputs.find(input=>input.liveSource===payload.source);
  if(!input){if(payload.type==='brep.clear')return definition;input=newInput('surface',definition.inputs);Object.assign(input,{name:'Rhino · '+(payload.label||payload.source).slice(0,100),liveSource:payload.source,exposed:true});definition.inputs.push(input)}
  input.liveRevision=payload.bridgeRevision||0;input.filename=(payload.label||payload.source).slice(0,120)+'.step';
  if(payload.type==='brep.clear'){input.meshes=[];delete input.brep;delete input.faces;delete input.kernel}
  else{validateEditableShape(shape);Object.assign(input,{meshes:structuredClone(shape.meshes),brep:structuredClone(shape.brep),faces:structuredClone(shape.faces),kernel:shape.kernel})}
  return validatePipeline(definition);
}
// One native conversion at a time, keeping only the latest pending frame per
// source. A clear or newer update arriving during conversion supersedes it.
export function createBrepInbox(api){
  const pending=new Map(),revisions=new Map(),accepted=new Map();let running=false;
  async function drain(){if(running)return;running=true;try{while(pending.size){if(!api.ready()){await new Promise(resolve=>setTimeout(resolve,50));continue}const [source,payload]=pending.entries().next().value;pending.delete(source);const context=api.context?.(),signature=JSON.stringify([payload.type,payload.label,payload.step]);if(accepted.get(source)?.signature===signature&&accepted.get(source)?.context===context)continue;
    try{const shape=payload.type==='brep.clear'?null:await api.convert(payload);if(pending.has(source)||api.context?.()!==context)continue;await api.apply(payload,shape);accepted.set(source,{signature,context})}catch(error){if(!pending.has(source))api.error(error,payload)}
  }}finally{running=false}}
  return{enqueue(payload){if(!payload||!['brep.update','brep.clear'].includes(payload.type)||typeof payload.source!=='string')return;if(payload.bridgeRevision!==undefined){const previous=revisions.get(payload.source),context=api.context?.();if(!Number.isSafeInteger(payload.bridgeRevision)||payload.bridgeRevision<1||previous&&(payload.bridgeRevision<previous.revision||payload.bridgeRevision===previous.revision&&previous.context===context))return;revisions.set(payload.source,{revision:payload.bridgeRevision,context})}pending.set(payload.source,payload);void drain()},idle:()=>!running&&!pending.size};
}
