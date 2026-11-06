import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainFacePoint,matchFaceIndex,remapFaceSketches} from '../face-sketch.js';

const face=(index,z,normal=[0,0,1])=>({index,planar:true,area:100,bounds:[[0,0,z],[10,10,z]],normal});

test('face sketches remap by geometry when STEP face indices are reordered',()=>{
  const input={id:'step-1',faces:[face(0,0),face(1,20)]};
  const result={faces:[face(0,25),face(1,0)]};
  const definition={steps:[{operation:'face-polyline',sketch:{inputId:input.id,faceIndex:1,points:[[0,0],[1,1]]}}]};
  assert.equal(matchFaceIndex(input.faces[1],result.faces,{offset:[0,0,5]}),0);
  remapFaceSketches(definition,input,result,{offset:[0,0,5],movedFaces:new Set([1])});
  assert.equal(definition.steps[0].sketch.faceIndex,0);
});

test('face sketch remapping ignores non-planar replacement faces',()=>{
  const input={id:'step-1',faces:[face(0,0)]};
  const curved={...face(0,0),planar:false},planar=face(1,1);
  assert.equal(matchFaceIndex(input.faces[0],[curved,planar]),1);
});

test('face sketch point constraints keep the next segment horizontal or vertical',()=>{
  assert.deepEqual(constrainFacePoint([7,9],[2,3],0),[7,9]);
  assert.deepEqual(constrainFacePoint([7,9],[2,3],1),[7,3]);
  assert.deepEqual(constrainFacePoint([7,9],[2,3],2),[2,9]);
});

test('face-bound spline sketches remap with their STEP face',()=>{
  const input={id:'step-1',faces:[face(0,0),face(1,20)]};
  const result={faces:[face(0,20),face(1,0)]};
  const definition={steps:[{operation:'face-spline',sketch:{inputId:input.id,faceIndex:1,points:[[0,0],[1,1],[2,0]]}}]};
  remapFaceSketches(definition,input,result);
  assert.equal(definition.steps[0].sketch.faceIndex,0);
});
