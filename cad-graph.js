import {validatePipeline,operationSpec,migrateDefinition} from './cad-pipeline.js';
export const OUTPUT_NODE='$output';
export function geometryEdges(raw){const d=migrateDefinition(raw);return d.steps.flatMap(step=>step.operation==='sections'?step.params.curves.map(id=>({from:`input:${id}`,to:step.id,slot:'curves'})):step.sources?step.sources.map((from,slot)=>({from,to:step.id,slot:String(slot)})):step.source?[{from:step.source,to:step.id,slot:'source'}]:[]).concat({from:d.output,to:OUTPUT_NODE,slot:'output'})}
export function sortGraph(raw){
  const d=structuredClone(raw),steps=new Map(d.steps.map(step=>[step.id,step])),ordered=[],visiting=new Set(),visited=new Set();
  function visit(id){if(visiting.has(id))throw new Error('循環する接続は作れません');if(visited.has(id))return;const step=steps.get(id);if(!step)throw new Error('接続元の工程がありません');visiting.add(id);for(const parent of step.sources||[step.source].filter(Boolean))visit(parent);visiting.delete(id);visited.add(id);ordered.push(step)}
  for(const step of d.steps)visit(step.id);d.steps=ordered;return d;
}
export function connectGeometry(raw,from,to,slot='source'){
  const d=validatePipeline(raw),source=d.steps.find(step=>step.id===from);
  if(from===to)throw new Error('同じノードには接続できません');
  if(to===OUTPUT_NODE){if(!source||operationSpec(d,source).returns!=='paths')throw new Error('最終出力にはToolpathsを接続してください');d.output=from;return validatePipeline(sortGraph(d))}
  const target=d.steps.find(step=>step.id===to);if(!target)throw new Error('接続先がありません');const spec=operationSpec(d,target);
  if(target.operation==='sections'){
    const input=d.inputs.find(input=>`input:${input.id}`===from);if(input?.type!=='curve'||!input.curve.closed)throw new Error('Sectionsには閉じたCurveを接続してください');if(!target.params.curves.includes(input.id))target.params.curves.push(input.id);
  }else{
    if(!source)throw new Error('工程の出力を接続してください');const type=operationSpec(d,source).returns;
    if(spec.accepts==='branches'){
      if(type!=='paths')throw new Error('MergeにはToolpathsが必要です');const index=Number(slot);if(!Number.isInteger(index)||index<0||index>target.sources.length)throw new Error('無効な入力ポート');if(target.sources.includes(from)&&target.sources[index]!==from)throw new Error('同じ出力を重複接続できません');target.sources[index]=from;
    }else{if(spec.accepts==='geometry'?!['paths','contours'].includes(type):spec.accepts!==type)throw new Error(`入力型が一致しません (${type} → ${spec.accepts||'none'})`);target.source=from}
  }
  return validatePipeline(sortGraph(d));
}
export function disconnectGeometry(raw,edge){
  const d=validatePipeline(raw),target=d.steps.find(step=>step.id===edge.to);
  if(edge.to===OUTPUT_NODE||!target)throw new Error('出力は必須です。別の出力を接続して差し替えてください');
  if(target.operation==='sections'){if(target.params.curves.length<=1)throw new Error('Curveは最低1本必要です');target.params.curves=target.params.curves.filter(id=>`input:${id}`!==edge.from)}
  else if(target.sources){if(target.sources.length<=2)throw new Error('Mergeには最低2つの入力が必要です');target.sources.splice(Number(edge.slot),1)}
  else throw new Error('入力は必須です。別の出力を接続して差し替えてください');return validatePipeline(d);
}
export {validateEditorState as validateEditor} from './cad-pipeline.js';
