import test from "node:test";
import assert from "node:assert/strict";
import { parseScalar } from "../cad/commands/input.js";
import { selectionBounds, zoomSnapStep, snapCoordinate, edgeLoop } from "../cad/ui-interactions.js";

test("027 numeric expressions respect precedence, units and the field's angle convention", () => {
  assert.equal(parseScalar("30/2 + 2*(10-5)"), 25);
  assert.equal(parseScalar("2.5cm + 5mm"), 30);
  assert.equal(parseScalar("2 * 3cm - 5"), 55);
  assert.equal(parseScalar("-(-.001m)/2"), 0.5);
  assert.equal(parseScalar("(1+2)cm"), 30);
  assert.equal(parseScalar("1e2mm/4"), 25);
  assert.equal(parseScalar("90deg+45", "angle"), Math.PI * 3 / 4);
  assert.equal(parseScalar("30+15", "angle"), Math.PI / 4);
  assert.equal(parseScalar("1/2", "angle", { defaultUnit: "rad" }), 0.5);
  assert.equal(parseScalar("90deg+0.5", "angle", { defaultUnit: "rad" }), Math.PI / 2 + 0.5);
});

test("027 numeric expressions reject scripts, malformed syntax, overflow and incompatible dimensions", () => {
  for (const expression of ["", "2**3", "2(3)", "1/0", "1e309", "1e200*1e200", "1mm+2rad", "2cm*3mm", "1/2mm", "1mm cm", "(()", "2);alert(1)", "globalThis.x=1", "(".repeat(20)+"1"+")".repeat(20)])
    assert.throws(() => parseScalar(expression), expression);
  assert.throws(() => parseScalar("2cm", "angle"));
  assert.throws(() => parseScalar("2", "length", {defaultUnit:"rad"}));
});

test("027 multi-selection bounds union distinct visible entities, including subshape selections", () => {
  const doc = { entities: [
    {id:"a",bbox:{min:[0,0,0],max:[10,20,30]}},
    {id:"b",bbox:{min:[-15,5,2],max:[-5,25,12]}},
    {id:"hidden",visibility:"hidden",bbox:{min:[-100,-100,-100],max:[100,100,100]}},
  ] };
  const before = structuredClone(doc);
  assert.deepEqual(selectionBounds(doc, [{entityId:"a"},{entityId:"a",topologyId:"edge"},{entityId:"b"},{entityId:"hidden"},{entityId:"gone"}]),
    {count:2,min:[-15,0,0],max:[10,25,30]});
  assert.equal(selectionBounds(doc, []), null);
  assert.deepEqual(doc, before);
});

test("027 zoom snapping is optional, bounded and shares exactly the drawing interval", () => {
  for (const scale of [0.0001,0.01,0.1,1,1000]) assert.equal(zoomSnapStep(scale,false),1);
  assert.equal(zoomSnapStep(0.0001,true),0.01);
  assert.equal(zoomSnapStep(0.1,true),1);
  assert.equal(zoomSnapStep(0.3,true),5);
  assert.equal(zoomSnapStep(1,true),10);
  assert.equal(zoomSnapStep(1000,true),100);
  assert.equal(snapCoordinate(0.126,0.05),0.15);
  assert.equal(snapCoordinate(-12,5),-10);
});

test("027 Alt edge loop follows exact wires and stops at ambiguous branches", () => {
  const vertex = (id, edges) => ({kind:"vertex",topologyId:id,fingerprint:{adjacentTopologyIds:edges}});
  const edge = (id, vertices) => ({kind:"edge",topologyId:id,fingerprint:{adjacentTopologyIds:vertices}});
  const summary = {topology:[vertex("v0",["e0","e1","e2"]),vertex("v1",["e0","e3"]),vertex("v2",["e1","e2"]),vertex("v3",["e3"]),edge("e0",["v0","v1"]),edge("e1",["v0","v2"]),edge("e2",["v0","v2"]),edge("e3",["v1","v3"])],
    edgeLoops:[{faceTopologyId:"top",edgeTopologyIds:["e0","e1"]},{faceTopologyId:"side",edgeTopologyIds:["e0","e2"]}]};
  assert.deepEqual(edgeLoop(summary,"e0","top"),["e0","e1"]);
  assert.deepEqual(edgeLoop(summary,"e0","side"),["e0","e2"]);
  assert.deepEqual(edgeLoop(summary,"e0"),["e0","e3"]);
  assert.deepEqual(edgeLoop(summary,"missing"),[]);
  assert.deepEqual(edgeLoop({topology:summary.topology,edgeLoops:[{edgeTopologyIds:["e1","e2"]},{edgeTopologyIds:["e2","e1"]}]},"e1"),["e2","e1"]);
});
