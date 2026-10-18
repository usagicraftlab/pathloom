import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DEFINITION,generateCad,validateDefinition} from '../cad-kernel.js';
import {geometryDefinition,addPrintOutput,updatePrintOutput,removePrintOutput,printOutputNodes,stageDefinition,pipelineLayerHeight} from '../cad-pipeline.js';
import {connectGeometry,geometryEdges,disconnectGeometry,removeGraphNodes} from '../cad-graph.js';
import {createDesignEnvelope} from '../cad-ai-context.js';
import {validateProject,compactProjectGenerators} from '../pathloom-project.js';
const base=()=>{const d=geometryDefinition(DEFAULT_DEFINITION);d.inputs.find(i=>i.id==='height').value=1.2;return d};
test('multiple Print outputs independently name, wire and assign tools/intro to shared geometry',()=>{
 let d=addPrintOutput(base()),second=printOutputNodes(d)[1];
 d=updatePrintOutput(d,'$output',{name:'Vase'});d=updatePrintOutput(d,second.nodeId,{name:'Base',intro:{enabled:true,length:10,gap:3,angle:90}});
 d=connectGeometry(d,'stack',second.nodeId,'output');d=disconnectGeometry(d,{to:second.nodeId,slot:'tools'});
 d.inputs.find(i=>i.id==='tools').value=[1,2];
 const result=generateCad(d);assert.deepEqual(result.objects.map(o=>o.name),['Vase','Base']);assert.deepEqual(result.paths,result.objects[0].paths);
 assert.equal(result.objects[0].paths.length,2);assert.equal(result.objects[1].paths.length,3);assert.deepEqual(result.objects[0].paths.map(p=>p.tool),[1,2]);assert.ok(result.objects[1].paths.every(p=>p.tool===0));
 assert.ok(geometryEdges(d).some(e=>e.to===second.nodeId&&e.from==='stack'));assert.equal(pipelineLayerHeight(d,second.id),.6);
 assert.equal(generateCad(stageDefinition(d,'stack')).objects.length,1);assert.deepEqual(generateCad(JSON.parse(JSON.stringify(d))).objects,result.objects);
});
test('removing primary output promotes stable object identity, name, wiring and layout',()=>{
 let d=addPrintOutput(base());const second=printOutputNodes(d)[1];d=updatePrintOutput(d,second.nodeId,{name:'Remain'});d.editor={nodes:{'$output':{x:10,y:20},[second.nodeId]:{x:100,y:200}}};
 d=removeGraphNodes(d,['$output']);assert.equal(printOutputNodes(d).length,1);assert.equal(printOutputNodes(d)[0].id,second.id);assert.equal(printOutputNodes(d)[0].name,'Remain');assert.deepEqual(d.editor.nodes.$output,{x:100,y:200});assert.throws(()=>removePrintOutput(d,'$output'),/at least one/);
});
test('invalid output identities, tool types and missing geometry are rejected',()=>{
 const d=addPrintOutput(base()),second=printOutputNodes(d)[1];assert.throws(()=>updatePrintOutput(d,second.nodeId,{name:''}),/Invalid Print/);assert.throws(()=>updatePrintOutput(d,second.nodeId,{source:'missing'}),/Invalid Print/);assert.throws(()=>updatePrintOutput(d,second.nodeId,{toolSource:'stack'}),/Tool input/);d.printOutputs[0].id='main';assert.throws(()=>validateDefinition(d),/Invalid Print/);
});
test('project saves graph once, restores shared graph, and preserves independent object settings',()=>{
 const d=addPrintOutput(base()),r=generateCad(d);const p={format:'pathloom',version:1,sources:r.objects.map((o,i)=>({id:`S${i+1}`,filename:o.name+'.toolpath',label:o.name,paths:o.paths,tools:[['0',{color:'#ffffff',name:'White',erate:1,speedOverride:null}]],generator:d,generatorGroup:'cad:test',generatorOutputId:o.id})),instances:r.objects.map((o,i)=>[`I${i}`,{source:`S${i+1}`,x:i*40,y:0,rotation:0,order:i+1,pauseLayers:i?[2]:[]}]),settings:{printer:'Prusa CoreOne',printWidth:.4,printHeight:.6,printSpeed:30,travelSpeed:100,nozzleTemperature:220,bedTemperature:60,fanSpeed:50},profile:{filamentDiameter:1.75,bedWidth:250,bedDepth:210,maxHeight:220,startGcode:'G28',toolChangeGcode:'T{to_tool}',endGcode:'M84'},view:{layer:2,showInputs:false},cad:{sourceId:'S2'}};
 const compact=compactProjectGenerators(p);assert.equal(compact.sources[1].generator,undefined);assert.equal(compact.sources[1].generatorRef,'S1');
 const loaded=validateProject(JSON.parse(JSON.stringify(compact)));assert.equal(loaded.sources[0].generator,loaded.sources[1].generator);assert.deepEqual(loaded.instances,p.instances);const twice=validateProject(loaded);assert.deepEqual(twice,loaded);assert.equal(twice.sources[0].generator,twice.sources[1].generator);assert.equal(compactProjectGenerators(loaded).sources[1].generator,undefined);
 compact.sources[1].generatorRef='missing';assert.throws(()=>validateProject(compact),/reference/);
});

test('AI patches preserve existing print objects and can explicitly add or rename outputs',()=>{const d=addPrintOutput(base()),envelope=createDesignEnvelope({definition:d,library:[]});const unchanged=envelope.restore({format:'pathloom-design-patch',steps:{upsert:[]}});assert.deepEqual(unchanged.printOutputs,d.printOutputs);const outputs=structuredClone(d.printOutputs);outputs[0].name='AI renamed';const next=envelope.restore({format:'pathloom-design-patch',printOutputs:outputs});assert.equal(validateDefinition(next).printOutputs[0].name,'AI renamed');assert.equal(d.printOutputs[0].name,'Object 2')});
