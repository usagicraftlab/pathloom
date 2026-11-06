import test from 'node:test';
import assert from 'node:assert/strict';
import {dxfCurves} from '../dxf-import.js';
import {normalizeStepResult,restoreStepShape} from '../step-import.js';
import {sliceMeshesToPaths} from '../step-geometry.js';

test('DXF entities become visible-curve input data with closure and sampled circles',()=>{
  const curves=dxfCurves({entities:[
    {type:'LINE',layer:'cut',vertices:[{x:0,y:0},{x:10,y:0}]},
    {type:'LWPOLYLINE',layer:'outline',shape:true,vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]},
    {type:'CIRCLE',layer:'holes',center:{x:5,y:5},radius:2}
  ]});
  assert.equal(curves.length,3);assert.equal(curves[0].closed,false);assert.equal(curves[1].closed,true);assert.equal(curves[2].closed,true);assert.ok(curves[2].points.length>20);
});

test('STEP import result is normalized into bounded display meshes',()=>{
  const shape=normalizeStepResult({success:true,meshes:[{name:'Face',color:[.1,.2,.3],brep_faces:[{first:0,last:0}],attributes:{position:{array:[[0,0,0],[1,0,0],[0,1,0]]}},index:{array:[[0,1,2]]}}]},'part.step');
  assert.equal(shape.name,'part.step');assert.deepEqual(shape.meshes[0].indices,[0,1,2]);assert.deepEqual(shape.meshes[0].positions,[0,0,0,1,0,0,0,1,0]);
  assert.throws(()=>normalizeStepResult({success:false},'bad.step'),/could not be read/);
});

test('STEP edit undo rebuilds from the preserved original and replays only retained edits',async()=>{
  const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],triangleFaces:[0]},face={index:0,planar:true,area:.5,bounds:[[0,0,0],[1,1,0]]},original='CASCADE Topology original';
  const shape={name:'part.step',filename:'part.step',meshes:[mesh],faces:[face],kernel:'OCCT',brep:{format:'occt-brep',version:1,data:'CASCADE Topology edited',original,history:[{operation:'move-faces',faceIndices:[0],offset:[1,0,0]},{operation:'translate',faceIndices:[],offset:[0,2,0]}]}};
  const prior=globalThis.window,calls=[];globalThis.window={__TAURI__:{core:{invoke:async(command,args)=>{assert.equal(command,'edit_step_faces');calls.push(structuredClone(args));const edit={operation:args.whole?'translate':'move-faces',faceIndices:args.faceIndices,offset:args.offset};return{...shape,brep:{...args.brep,data:`CASCADE Topology rebuilt ${calls.length}`,history:[...args.brep.history,edit]}}}}}};
  try{const restored=await restoreStepShape(shape,1);assert.equal(calls.length,2);assert.equal(calls[0].brep.data,original);assert.equal(calls[1].brep.history.length,0);assert.deepEqual(restored.brep.history,[shape.brep.history[0]])}finally{globalThis.window=prior}
});

test('STEP triangle meshes produce closed Z slices at the configured layer interval',()=>{
  const mesh={positions:[0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1],indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
  const paths=sliceMeshesToPaths([mesh],.25);assert.equal(new Set(paths.map(path=>path.points[0][2])).size,4);assert.ok(paths.every(path=>path.points.length>=4&&path.points[0][2]===path.points.at(-1)[2]));assert.deepEqual(paths[0].points[0],paths[0].points.at(-1));
});

test('STEP slices preserve open intersection lines as printable toolpaths',()=>{
  const mesh={positions:[0,0,0,1,0,1,0,1,1],indices:[0,1,2]};
  const paths=sliceMeshesToPaths([mesh],.25);
  assert.ok(paths.length>0);
  assert.ok(paths.every(path=>path.points.length>=2));
  assert.ok(paths.every(path=>path.points.length===2&&JSON.stringify(path.points[0].slice(0,2))!==JSON.stringify(path.points.at(-1).slice(0,2))));
});
