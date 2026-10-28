import test from 'node:test';
import assert from 'node:assert/strict';
import {commandById,findCommands} from '../cad/commands/registry.js';
import {createCommandSession,sessionReady,operationForSession} from '../cad/commands/session.js';

test('Phase2 contracts add versions without rewriting saved S03/Box/Fillet/Chamfer v1',()=>{
  assert.equal(commandById('S03',1).inputs[0].maxCount,1);
  assert.equal(commandById('B01',1).defaults.mode,undefined);
  assert.deepEqual(commandById('D05',1).defaults,{radiusMm:2,tangentChain:false});
  assert.deepEqual(commandById('D06',1).defaults,{distance1Mm:1});
  for(const id of ['S03','B01','D05','D06'])assert.equal(findCommands().find(c=>c.id===id).version,2);
  for(const id of ['B02.ellipsoid','B06','B07','B08','B08.assemble'])assert.ok(commandById(id));
});
test('Planar Region accepts multiple boundaries; face extrusion requires a surface and keeps cap explicit',()=>{
  const region=createCommandSession(commandById('S03',2),{selection:[{entityId:'a',entityKind:'curve'},{entityId:'b',entityKind:'curve'}]});assert.equal(region.inputs.boundaries.length,2);assert.equal(sessionReady(region),true);
  const notFace=createCommandSession(commandById('B07'),{selection:[{entityId:'a',entityKind:'curve'}]});assert.equal(sessionReady(notFace),false);
  const face=createCommandSession(commandById('B07'),{selection:[{entityId:'face',entityKind:'surface'}]});assert.equal(sessionReady(face),true);assert.equal(operationForSession(face).parameters.cap,true);
});
