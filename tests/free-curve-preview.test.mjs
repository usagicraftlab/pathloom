import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DEFINITION,generateCad} from '../cad-kernel.js';
import {geometryDefinition,stageDefinition} from '../cad-pipeline.js';
function fixture(){const d=geometryDefinition(DEFAULT_DEFINITION);d.recipes=[{id:'free',version:1,label:'Free curve',accepts:'curve',returns:'curve',params:{},defaults:{},code:'return input;'}];d.steps.push({id:'free',operation:'recipe:free',version:1,source:d.output,params:{}});d.output='free';return d}
for(const [label,points] of Object.entries({vertical:[[0,0,0],[0,0,10]],spatial:[[0,0,-2],[10,2,5],[-2,3,1]],crossing:[[0,0,0],[10,10,0],[0,10,0],[10,0,0]]}))test(`${label} curves are valid construction geometry and stage previews`,()=>{const d=fixture(),runCode=()=>[{points}];assert.deepEqual(generateCad(d,{runCode,geometryOnly:true}).paths[0].points,points);assert.deepEqual(generateCad(stageDefinition(d,'free'),{runCode,geometryOnly:true}).paths[0].points,points);assert.throws(()=>generateCad(d,{runCode}));});
test('Construction curves still reject invalid coordinates',()=>assert.throws(()=>generateCad(fixture(),{geometryOnly:true,runCode:()=>[{points:[[0,0,0],[NaN,0,1]]}]}),/finite/));

test('Saved definition flags cannot disable Print output validation',()=>{const d=fixture();d.geometryPreview=true;assert.throws(()=>generateCad(d,{runCode:()=>[{points:[[0,0,0],[0,0,10]]}]}),/planar/)});
