import {isPrintOutputNode,printOutputNodes,updatePrintOutput,removePrintOutput,isCurveType,geometrySourceType,removeOperation,inputReferences,curveInputReferences,acceptsGeometryType,validatePipeline,operationSpec,migrateDefinition,resolveValue} from './cad-pipeline.js';
export const OUTPUT_NODE='$output';
export function geometryEdges(raw){const d=migrateDefinition(raw);return d.steps.flatMap(step=>{const spec=operationSpec(d,step),curves=Object.entries(step.params||{}).filter(([key])=>spec?.params?.[key]==='curves').flatMap(([slot,ids])=>(ids||[]).map(id=>({from:id.startsWith('step:')?id.slice(5):d.inputs.some(input=>input.id===id)?`input:${id}`:id,to:step.id,slot})));const points=Object.entries(step.params||{}).filter(([key,value])=>spec?.params?.[key]==='point'&&value?.input).map(([slot,value])=>({from:`input:${value.input}`,to:step.id,slot}));return [...curves,...points,...(step.sources?step.sources.map((from,slot)=>({from,to:step.id,slot:String(slot)})):step.source?[{from:step.source,to:step.id,slot:'source'}]:[])]}).concat(printOutputNodes(d).flatMap(o=>[{from:o.source,to:o.nodeId,slot:'output'},...(o.toolSource?[{from:o.toolSource,to:o.nodeId,slot:'tools'}]:[])]))}
export function sortGraph(raw){
  const d=structuredClone(raw),steps=new Map(d.steps.map(step=>[step.id,step])),ordered=[],visiting=new Set(),visited=new Set();
  function visit(id){if(id?.startsWith('input:')&&d.inputs.some(input=>`input:${input.id}`===id&&['curve','surface'].includes(input.type)))return;if(visiting.has(id))throw new Error('循環する接続は作れません');if(visited.has(id))return;const step=steps.get(id);if(!step)throw new Error('接続元の工程がありません');visiting.add(id);for(const parent of [...(step.sources||[step.source].filter(Boolean)),...Object.entries(step.params||{}).filter(([key])=>operationSpec(d,step)?.params[key]==='curves').flatMap(([,ids])=>ids.filter(ref=>ref.startsWith('step:')||steps.has(ref)&&!d.inputs.some(input=>input.id===ref&&input.type==='curve')).map(ref=>ref.startsWith('step:')?ref.slice(5):ref))])visit(parent);visiting.delete(id);visited.add(id);ordered.push(step)}
  for(const step of d.steps)visit(step.id);d.steps=ordered;return d;
}
export function connectGeometry(raw,from,to,slot='source'){
  const d=validatePipeline(raw),source=d.steps.find(step=>step.id===from);
  if(from===to)throw new Error('同じノードには接続できません');
  if(isPrintOutputNode(to)){const type=geometrySourceType(d,from);if(slot==='tools'){if(type!=='tool-info')throw new Error('Tool入力にはTool情報を接続してください');return updatePrintOutput(d,to,{toolSource:from})}if(!isCurveType(type))throw new Error('Geometry入力にはCurveまたはToolpathsを接続してください');return updatePrintOutput(d,to,{source:from})}

  const target=d.steps.find(step=>step.id===to);if(!target)throw new Error('接続先がありません');const spec=operationSpec(d,target);
  if(from.startsWith('input:')){
    const input=d.inputs.find(input=>`input:${input.id}`===from),key=slot,specKey=spec.params[key];if(input?.type==='point'&&specKey==='point'){target.params[key]={input:input.id};return validatePipeline(d)}if(['curve','surface'].includes(input?.type)&&slot==='source'&&spec.accepts&&acceptsGeometryType(spec.accepts,input.type==='curve'?'contours':'surface')){target.source=from;return validatePipeline(sortGraph(d))}if(input?.type!=='curve'||specKey!=='curves')throw new Error('Curve inputを受け取れるComponentにつないでください');if(spec.curveSelection==='closed'&&!input.curve.closed)throw new Error(`${spec.label}には閉じたCurveが必要です`);if(!target.params[key].includes(input.id))target.params[key].push(input.id);
  }else{
    if(!source)throw new Error('工程の出力を接続してください');const type=operationSpec(d,source).returns;if(spec.params[slot]==='curves'&&isCurveType(type)){const ref=`step:${from}`;if(!target.params[slot].includes(ref))target.params[slot].push(ref);return validatePipeline(sortGraph(d))}
    if(spec.accepts==='branches'){
      if(type!=='paths')throw new Error('MergeにはToolpathsが必要です');const index=Number(slot);if(!Number.isInteger(index)||index<0||index>target.sources.length)throw new Error('無効な入力ポート');if(target.sources.includes(from)&&target.sources[index]!==from)throw new Error('同じ出力を重複接続できません');target.sources[index]=from;
    }else{if(!acceptsGeometryType(spec.accepts,type))throw new Error(`入力型が一致しません (${type} → ${spec.accepts||'none'})`);target.source=from}
  }
  return validatePipeline(sortGraph(d));
}
export function disconnectGeometry(raw,edge){
  const d=validatePipeline(raw),target=d.steps.find(step=>step.id===edge.to);
  if(isPrintOutputNode(edge.to)&&edge.slot==='tools')return updatePrintOutput(d,edge.to,{toolSource:null});if(isPrintOutputNode(edge.to)||!target)throw new Error('出力は必須です。別の出力を接続して差し替えてください');
  if(operationSpec(d,target).params[edge.slot]==='curves'&&!edge.from.startsWith('input:')){const ids=target.params[edge.slot],minimum=operationSpec(d,target).minCurves?.[edge.slot]??1;if(ids.length<=minimum)throw new Error(`This Component requires at least ${minimum} Curve`);target.params[edge.slot]=ids.filter(id=>id!==edge.from&&id!==`step:${edge.from}`);return validatePipeline(d)}
  if(edge.from.startsWith('input:')){const key=edge.slot;if(key==='source')throw new Error('Curve input is required; connect another Curve to replace it');if(operationSpec(d,target).params[key]==='point'){target.params[key]=structuredClone(resolveValue(d,target.params[key]));return validatePipeline(d)}const ids=target.params[key],inputId=edge.from.slice('input:'.length),minimum=operationSpec(d,target).minCurves?.[key]??1;if(!Array.isArray(ids)||!ids.includes(inputId))throw new Error('Curve connection not found');if(ids.length<=minimum)throw new Error(`このComponentには最低${minimum}本のCurveが必要です`);target.params[key]=ids.filter(id=>id!==inputId)}
  else if(target.sources){if(target.sources.length<=2)throw new Error('Mergeには最低2つの入力が必要です');target.sources.splice(Number(edge.slot),1)}
  else throw new Error('入力は必須です。別の出力を接続して差し替えてください');return validatePipeline(d);
}
export function removeGraphNodes(raw,ids){
  const selected=new Set(ids);let d=validatePipeline(raw);
  for(const id of [...selected].filter(isPrintOutputNode).sort((a,b)=>a==='$output'?1:b==='$output'?-1:0))d=removePrintOutput(d,id);
  const removed=d.steps.filter(step=>selected.has(step.id));if(removed.length===d.steps.length)throw new Error('Keep at least one geometry Component connected to Print output');
  for(const step of [...removed].reverse())d=removeOperation(d,step.id);
  for(const id of selected)if(id.startsWith('input:')){const inputId=id.slice(6);if(printOutputNodes(d).some(o=>o.source===id)||d.steps.some(step=>inputReferences(step).includes(inputId)||curveInputReferences(step,operationSpec(d,step)).includes(inputId)))throw new Error('Disconnect the selected input before deleting it');d.inputs=d.inputs.filter(input=>input.id!==inputId)}
  return validatePipeline(d);
}
export {validateEditorState as validateEditor} from './cad-pipeline.js';
