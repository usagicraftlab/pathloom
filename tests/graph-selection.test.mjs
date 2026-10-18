import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DEFINITION,generateCad} from '../cad-kernel.js';
import {geometryDefinition,appendComponent,newInput} from '../cad-pipeline.js';
import {removeGraphNodes} from '../cad-graph.js';
const base=()=>{const d=geometryDefinition(DEFAULT_DEFINITION);d.inputs.find(i=>i.id==='height').value=3;return d};
test('selection deletion removes multiple independent nodes without changing printed geometry',()=>{let d=appendComponent(base(),'rectangle');const a=d.steps.at(-1).id;d=appendComponent(d,'circle');const b=d.steps.at(-1).id;d.output='twist';const before=generateCad(d).paths;const next=removeGraphNodes(d,[a,b]);assert.ok(!next.steps.some(s=>[a,b].includes(s.id)));assert.deepEqual(generateCad(next).paths,before);assert.ok(d.steps.some(s=>s.id===a))});
test('selection deletion protects required geometry and keeps failed edits atomic',()=>{const d=base(),before=structuredClone(d);assert.throws(()=>removeGraphNodes(d,d.steps.map(s=>s.id)),/at least one/);assert.throws(()=>removeGraphNodes(d,['input:section']));assert.deepEqual(d,before);const input=newInput('point',d.inputs);d.inputs.push(input);const next=removeGraphNodes(d,[`input:${input.id}`]);assert.ok(!next.inputs.some(i=>i.id===input.id));assert.equal(generateCad(next).paths.length,5)});
