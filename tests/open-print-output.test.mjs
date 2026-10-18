import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DEFINITION,generateCad} from '../cad-kernel.js';
import {geometryDefinition,appendComponent,validateOutput} from '../cad-pipeline.js';
const points=[[0,0,.6],[10,0,.6],[10,10,.6]];
function openGraph(){let d=geometryDefinition(DEFAULT_DEFINITION);d.inputs.push({id:'open',name:'Open',group:'Geometry',type:'curve',visible:true,curve:{type:'polyline',closed:false,points:points.map(p=>p.slice(0,2))}});d=appendComponent(d,'translate');d.steps.at(-1).source='input:open';d.steps.at(-1).params.offset=[0,0,.6];d.output=d.steps.at(-1).id;return d}
test('Print output preserves open polyline endpoints and accepts straight segments',()=>{const d=openGraph();assert.deepEqual(generateCad(d).paths[0].points,points);d.inputs.find(i=>i.id==='open').curve.points=[[0,0],[10,0]];assert.deepEqual(generateCad(d).paths[0].points,[[0,0,.6],[10,0,.6]])});
test('Build Toolpath reverses an open curve without closing or moving its seam',()=>{const d=appendComponent(openGraph(),'build-toolpath');Object.assign(d.steps.at(-1).params,{seam:.5,reverse:true,nearest:true});assert.deepEqual(generateCad(d).paths[0].points,[...points].reverse())});
test('Open output still rejects self intersections and zero-length segments',()=>{assert.throws(()=>validateOutput([{points:[[0,0,.6],[10,10,.6],[0,10,.6],[10,0,.6]]}]),/Intersecting/);assert.throws(()=>validateOutput([{points:[[0,0,.6],[0,0,.6]]}]),/Zero-length/);assert.doesNotThrow(()=>validateOutput([{points:[[0,0,.6],[10,0,.6]]}]));const d=openGraph();d.steps.at(-1).params.offset=[0,0,-1];assert.throws(()=>generateCad(d),/nonnegative Z/)});
