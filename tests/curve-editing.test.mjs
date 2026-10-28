import test from 'node:test';
import assert from 'node:assert/strict';
import {commandById,findCommands} from '../cad/commands/registry.js';
import {createCadDocument} from '../cad/document.js';
import {reconcileDifferenceTools,replacementRefs} from '../cad/difference.js';

test('curve editing exposes all E01-E11 modes and keeps embedded v1 command definitions',()=>{
  for(const id of ['E01','E02','E03','E04','E05','E06','E07','E07.chamfer','E08','E09','E10','E10.seam','E11'])assert.ok(findCommands().some(c=>c.id===id),id);
  assert.deepEqual(commandById('E01',1).defaults,{});
  assert.deepEqual(commandById('E04',1).defaults,{splitParameters:[.5]});
  assert.equal(findCommands().find(c=>c.id==='E01').version,2);
  assert.equal(findCommands().find(c=>c.id==='E04').version,2);
  assert.equal(commandById('E09').defaults.acceptApproximation,false);
});
test('Trim/Split/Extend consume their target without consuming cutters or reach targets',()=>{
  const object=[{entityId:'curve'}],cutters=[{entityId:'tool'}];
  for(const operation of ['curve.trim','curve.split','curve.extend'])assert.deepEqual(replacementRefs({operation:{id:operation},inputs:{object,cutters,target:cutters},parameters:{}}),object);
});
test('curve corner keepInputs restores source bodies and preserves another consumer',()=>{
  const doc=createCadDocument();
  const feature=(id,inputs={},parameters={})=>({id,operation:{id:'curve.line'},status:'valid',inputs,parameters,resultPolicy:'copy',outputSlots:[{entityId:'e-'+id,bodyId:'b-'+id,key:'result'}]});
  const a=feature('a'),b=feature('b'),corner={...feature('corner',{first:[{entityId:'e-a'}],second:[{entityId:'e-b'}]},{keepInputs:false}),operation:{id:'curve.fillet'},resultPolicy:'replace',lastValid:{curveKeepInputs:false}};
  doc.features=[a,b,corner];doc.entities=doc.features.map(f=>({id:f.outputSlots[0].entityId,bodyId:f.outputSlots[0].bodyId,producer:{featureId:f.id}}));doc.bodies=doc.entities.map(e=>({id:e.bodyId,tipEntityId:e.id,status:'ready',splitIntoBodyIds:[]}));
  reconcileDifferenceTools(doc);assert.equal(doc.bodies[0].tipEntityId,null);assert.equal(doc.bodies[1].tipEntityId,null);
  corner.parameters.keepInputs=true;corner.lastValid.curveKeepInputs=true;reconcileDifferenceTools(doc);assert.equal(doc.bodies[0].tipEntityId,'e-a');assert.equal(doc.bodies[1].tipEntityId,'e-b');
  const downstream={...feature('other',{object:[{entityId:'e-a'}]}),operation:{id:'curve.reverse'},resultPolicy:'replace'};doc.features.push(downstream);reconcileDifferenceTools(doc);assert.equal(doc.bodies[0].tipEntityId,null);assert.equal(doc.bodies[1].tipEntityId,'e-b');
  corner.parameters.keepInputs=false;corner.status='failed';reconcileDifferenceTools(doc);assert.equal(doc.bodies[1].tipEntityId,'e-b');
});
