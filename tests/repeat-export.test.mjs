import test from 'node:test';
import assert from 'node:assert/strict';
import {RepeatExport} from '../repeat-export.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};

test('repeat export keeps successful options and destination but regenerates current content',async()=>{
  const exports=new RepeatExport(),writes=[];let geometry=1;
  exports.register('shape',{valid:c=>c.target==='body-a',prepare:c=>({bytes:`${geometry}/${c.options.value}`}),write:(p,destination)=>{writes.push({...p,destination});return{destination:destination||'/chosen/a.step'}}});
  await assert.rejects(exports.repeat(),/通常/);
  const config={target:'body-a',options:{value:4}};
  await exports.export('shape',config);config.options.value=99;geometry=2;
  await exports.repeat();
  assert.deepEqual(writes,[{bytes:'1/4',destination:undefined},{bytes:'2/4',destination:'/chosen/a.step'}]);
  assert.equal(exports.canRepeat(),true);
});

test('cancelled or failed exports preserve the previous successful recipe',async()=>{
  const exports=new RepeatExport();
  exports.register('data',{valid:()=>true,prepare:c=>{if(c.fail==='prepare')throw Error('invalid current data');return c},write:c=>{if(c.fail==='write')throw Error('disk full');return c.cancel?null:{destination:c.path}}});
  await exports.export('data',{path:'/first.json'});const first=structuredClone(exports.last);
  await exports.export('data',{cancel:true,path:'/cancelled.json'});assert.deepEqual(exports.last,first);
  await assert.rejects(exports.export('data',{fail:'prepare'}),/invalid current/);assert.deepEqual(exports.last,first);
  await assert.rejects(exports.export('data',{fail:'write'}),/disk full/);assert.deepEqual(exports.last,first);
  assert.equal(exports.busy,false);await exports.repeat();assert.deepEqual(exports.last,first);
});

test('busy exports exclude overlapping normal and repeat writes',async()=>{
  const exports=new RepeatExport(),gate=deferred(),states=[];let writes=0;
  exports.subscribe(s=>states.push(s.busy));
  exports.register('data',{valid:()=>true,prepare:c=>c,write:async()=>{writes++;if(writes>1)await gate.promise;return{destination:'/same.gcode'}}});
  await exports.export('data',{});
  const pending=exports.repeat();await new Promise(r=>setImmediate(r));
  assert.equal(exports.canRepeat(),false);
  await assert.rejects(exports.repeat(),/完了/);await assert.rejects(exports.export('data',{}),/完了/);
  assert.equal(writes,2);gate.resolve();await pending;
  assert.equal(exports.busy,false);assert.equal(states.at(-1),false);
});

test('document replacement discards delayed preparation and cannot revive a late successful write',async()=>{
  for(const phase of ['prepare','write']){
    const exports=new RepeatExport(),gate=deferred(),entered=deferred();let writes=0;
    exports.register('data',{valid:()=>true,
      prepare:async c=>{if(phase==='prepare'){entered.resolve();await gate.promise}return c},
      write:async()=>{writes++;if(phase==='write'){entered.resolve();await gate.promise}return{destination:'/old.json'}}});
    const pending=exports.export('data',{});await entered.promise;exports.clear();gate.resolve();
    if(phase==='prepare')await assert.rejects(pending,/文書/);else await pending;
    assert.equal(writes,phase==='prepare'?0:1);assert.equal(exports.last,null);assert.equal(exports.canRepeat(),false);
  }
});

test('missing targets never fall back to a new selection and successful kinds replace each other',async()=>{
  const exports=new RepeatExport(),existing=new Set(['a','b']),written=[];
  for(const kind of ['step','json'])exports.register(kind,{valid:c=>existing.has(c.target),prepare:c=>c,write:c=>{written.push(`${kind}:${c.target}`);return{destination:null}}});
  await exports.export('step',{target:'a'});existing.delete('a');
  assert.equal(exports.canRepeat(),false);await assert.rejects(exports.repeat(),/対象/);assert.deepEqual(written,['step:a']);
  await exports.export('json',{target:'b'});await exports.repeat();assert.deepEqual(written,['step:a','json:b','json:b']);
  exports.clear();assert.equal(exports.canRepeat(),false);
});
