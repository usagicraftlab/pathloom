import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_DEFINITION,generateCad} from '../cad-kernel.js';
import {geometryDefinition,newInput,appendComponent,validatePipeline} from '../cad-pipeline.js';
import {connectGeometry,OUTPUT_NODE,geometryEdges} from '../cad-graph.js';
const mesh={positions:[0,0,0,20,0,0,20,20,0,0,20,0,0,0,20,20,0,20,20,20,20,0,20,20],indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
function setup(){const d=geometryDefinition(DEFAULT_DEFINITION),input=newInput('surface',d.inputs);Object.assign(input,{filename:'cube.step',exposed:true,meshes:[structuredClone(mesh)]});d.inputs.push(input);return{d,input}}
test('STEP Input persists embedded geometry and Slice STEP yields closed printable Curve layers',()=>{let{d,input}=setup();d=appendComponent(d,'slice-step');const slice=d.steps.at(-1);slice.params.layerHeight=1;assert.equal(slice.source,`input:${input.id}`);d=connectGeometry(d,slice.id,OUTPUT_NODE);const saved=validatePipeline(JSON.parse(JSON.stringify(d)));assert.deepEqual(saved.inputs.find(i=>i.id===input.id).meshes,[mesh]);const result=generateCad(saved);assert.equal(result.paths.length,20);assert.ok(result.paths.every(path=>path.points.every(p=>p[2]===path.points[0][2])));assert.deepEqual(result.paths[0].points[0],result.paths[0].points.at(-1));assert.ok(geometryEdges(saved).some(e=>e.from===`input:${input.id}`&&e.to===slice.id));assert.throws(()=>connectGeometry(d,`input:${input.id}`,OUTPUT_NODE),/Curve|Toolpaths/);assert.throws(()=>connectGeometry(d,`input:${input.id}`,'stack'))});
test('STEP mesh validation rejects nonfinite coordinates and out-of-range indices; empty input requests a file',()=>{const{d,input}=setup();input.meshes[0].indices[0]=999;assert.throws(()=>validatePipeline(d),/indices/);input.meshes=[structuredClone(mesh)];input.meshes[0].positions[0]=NaN;assert.throws(()=>validatePipeline(d),/coordinates/);input.meshes=[];const next=appendComponent(d,'slice-step');assert.throws(()=>generateCad(next),/Choose a STEP file/)});

test('editable B-rep, original shape, face IDs and history survive pipeline saves; invalid face mappings are rejected',async()=>{
  const {readFile}=await import('node:fs/promises');const shape=JSON.parse(await readFile(new URL('./fixtures/editable-cube.json',import.meta.url),'utf8')).shape;
  const {d,input}=setup();Object.assign(input,{filename:shape.name,brep:shape.brep,faces:shape.faces,meshes:shape.meshes});
  const saved=validatePipeline(JSON.parse(JSON.stringify(d)));const restored=saved.inputs.find(i=>i.id===input.id);assert.deepEqual(restored.brep,shape.brep);assert.equal(restored.faces.length,6);assert.equal(generateCad(saved).paths.length,100);
  input.meshes[0].triangleFaces[0]=999;assert.throws(()=>validatePipeline(d),/face mapping/);input.meshes=structuredClone(shape.meshes);input.brep.history=[{operation:'move-faces',faceIndices:[0],offset:[Infinity,0,0]}];assert.throws(()=>validatePipeline(d),/B-rep/);
});

test('Slice STEP preserves edited object height rather than dropping it back onto the plate',()=>{let{d,input}=setup();for(let i=2;i<input.meshes[0].positions.length;i+=3)input.meshes[0].positions[i]+=5;d=appendComponent(d,'slice-step');d.steps.at(-1).params.layerHeight=1;const result=generateCad(d);assert.equal(result.paths[0].points[0][2],5.5)});
