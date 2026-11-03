import test from "node:test";
import assert from "node:assert/strict";
import { SectionInspection, inspectionPlane, extrudeFaceDistance } from "../cad/inspection.js";

test("030 face distance keeps signed, antiparallel and total both-side contracts", () => {
  const input = {direction:[0,0,8],profilePoint:[1,2,10],face:{planar:true,normal:[0,0,-1],origin:[0,0,40]}};
  const before = structuredClone(input);
  assert.equal(extrudeFaceDistance(input), 30);
  assert.equal(extrudeFaceDistance({...input,bothSides:true}), 60);
  assert.equal(extrudeFaceDistance({...input,direction:[0,0,-2]}), -30);
  assert.equal(extrudeFaceDistance({...input,profilePoint:[1,2,50]}), -10);
  assert.deepEqual(input, before);
  for (const face of [
    {planar:true,normal:[1,0,0],origin:[40,0,0]},
    {planar:true,normal:[0,1,1],origin:[0,0,40]},
    {planar:false,normal:[0,0,1],origin:[0,0,40]},
    {planar:true,normal:[0,0,1],origin:[0,0,10]},
  ]) assert.equal(extrudeFaceDistance({...input,face}), null);
  assert.equal(extrudeFaceDistance({...input,direction:[0,0,0]}), null);
});

test("030 inspection basis supports an arbitrary plane without changing its origin", () => {
  const origin=[3,4,5], plane=inspectionPlane(origin,[1,2,3]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  assert.deepEqual(plane.origin,origin);
  assert.ok(Math.abs(dot(plane.xAxis,plane.yAxis))<1e-12);
  assert.ok(Math.abs(Math.hypot(...plane.xAxis)-1)<1e-12);
  assert.ok(Math.abs(Math.hypot(...plane.yAxis)-1)<1e-12);
  assert.ok(Math.abs(dot(plane.xAxis,[1,2,3]))<1e-12);
  assert.ok(Math.abs(dot(plane.yAxis,[1,2,3]))<1e-12);
  assert.throws(()=>inspectionPlane(origin,[0,0,0]));
});

function fixture() {
  const requests=[], released=[], published=[];
  const store={document:{id:"doc",documentRevision:1,tolerances:{kernelLinearMm:1e-6}},
    resolve:async()=>({prepared:{objects:[{handle:"source"}]},inputHashes:["hash"]}),
    getEntity:()=>({geometry:{assetHash:"hash"}}),native:{runtimeEpoch:1,
      evaluate:request=>new Promise(resolve=>requests.push({request,resolve})),
      release:async handles=>released.push(...handles)}};
  const analysis=new SectionInspection(store,state=>published.push(state ? structuredClone(state):null));
  const reply=handle=>({status:"ok",outputs:[{handle,summary:{preview:{curves:[]}}}]});
  return {store,analysis,requests,released,published,reply};
}
async function until(condition) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {if(condition())return;await new Promise(r=>setTimeout(r,5));}
  assert.fail("inspection did not settle");
}

test("030 analysis coalesces a drag, rejects stale results and releases all temporary handles", async () => {
  const {store,analysis,requests,released,published,reply}=fixture(), before=structuredClone(store.document);
  analysis.start(["source"],inspectionPlane([0,0,5],[0,0,1]),20);
  await until(()=>requests.length===1);
  analysis.setPlane(inspectionPlane([0,0,6],[0,0,1]));
  analysis.setPlane(inspectionPlane([0,0,9],[0,0,1]));
  requests[0].resolve(reply("stale"));
  await until(()=>requests.length===2);
  assert.deepEqual(requests[1].request.parameters.plane.origin,[0,0,9]);
  assert.equal(requests[1].request.intent,"preview");
  assert.equal(requests[1].request.operation.id,"shape.section");
  requests[1].resolve(reply("latest"));
  await until(()=>!analysis.running);
  assert.deepEqual(released,["stale","latest"]);
  assert.equal(published.filter(s=>s?.status==="ready").length,1);
  assert.deepEqual(store.document,before);
  analysis.stop();
  assert.equal(published.at(-1),null);
});

test("030 closing, replacing a document or changing source hashes discards in-flight analysis", async () => {
  for(const change of [f=>f.analysis.stop(),f=>{f.store.document={...f.store.document};},
    f=>{f.store.getEntity=()=>({geometry:{assetHash:"changed"}});}]) {
    const f=fixture();f.analysis.start(["source"],inspectionPlane([0,0,5],[0,0,1]),20);
    await until(()=>f.requests.length===1);
    change(f);f.requests[0].resolve(f.reply("discarded"));
    await until(()=>!f.analysis.running);
    assert.deepEqual(f.released,["discarded"]);
    assert.equal(f.published.some(s=>s?.status==="ready"),false);
  }
});
