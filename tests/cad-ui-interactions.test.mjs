import test from "node:test";
import assert from "node:assert/strict";
import { stageEntities, snapCandidates } from "../cad/ui-interactions.js";
import { createCadDocument } from "../cad/document.js";

test("history display replay restores consumed intermediate tips without mutating current bodies or bindings", () => {
  const doc = createCadDocument();
  const entity = (id, bodyId, producer) => ({ id, bodyId, producer:{featureId:producer}, visibility:"visible" });
  doc.entities = [entity("profile", "a", "first"), entity("extruded", "a", "second"), entity("other", "b", "other-feature"), entity("union", "c", "third")];
  const feature = (id, outputs, inputs = {}, policy = "independent") => ({id, operation:{id:"solid.union"}, status:"valid", parameters:{}, inputs, resultPolicy:policy, outputSlots:outputs.map((entityId) => ({entityId}))});
  doc.features = [feature("first", ["profile"]), feature("second", ["extruded"], {profile:[{entityId:"profile"}]}, "replace"), feature("other-feature", ["other"]), feature("third", ["union"], {arguments:[{entityId:"extruded"},{entityId:"other"}]}, "replace")];
  doc.bodies = [{id:"c", tipEntityId:"union",status:"valid"}];
  doc.outputBindings = [{ id:"binding", resolvedEntityId:"union" }];
  const before = structuredClone(doc);
  assert.deepEqual(stageEntities(doc, "first").map((item) => item.id), ["profile"]);
  assert.deepEqual(stageEntities(doc, "second").map((item) => item.id), ["extruded"]);
  assert.deepEqual(stageEntities(doc, "third").map((item) => item.id), ["union"]);
  assert.deepEqual(stageEntities(doc, null).map((item) => item.id), ["union"]);
  assert.deepEqual(doc, before);
});

test("inference snap includes endpoints, midpoints, centers and spatial intersections", () => {
  const doc = createCadDocument();
  for (const [id, points] of [["a", [[0,0,0],[10,0,0]]], ["b", [[5,-5,0],[5,5,0]]]]) {
    doc.entities.push({id,bodyId:id,bbox:{min:points[0],max:points[1]},displayCache:{preview:{curves:[{points}]}}});
    doc.bodies.push({id,tipEntityId:id,status:"valid"});
  }
  const candidates = snapCandidates(doc);
  for (const label of ["端点", "中点", "中心", "交点"]) assert.ok(candidates.some((candidate) => candidate.label === label));
  assert.deepEqual(candidates.find((candidate) => candidate.label === "交点").point, [5,0,0]);
  doc.entities[1].displayCache.preview.curves[0].points = [[5,-5,1],[5,5,1]];
  assert.equal(snapCandidates(doc).some((candidate) => candidate.label === "交点"), false);
});

test("intersection inference remains available in documents with more than 500 segments", () => {
  const doc = createCadDocument();
  const curves = Array.from({length:501}, (_, index) => ({points:[[100+index,10,0],[100+index,11,0]]}));
  curves.push({points:[[0,0,0],[10,0,0]]}, {points:[[5,-5,0],[5,5,0]]});
  doc.entities = [{id:"many",bodyId:"many",bbox:{min:[0,-5,0],max:[601,11,0]},displayCache:{preview:{curves}}}];
  doc.bodies = [{id:"many",tipEntityId:"many",status:"valid"}];
  assert.ok(snapCandidates(doc).some((candidate) => candidate.label === "交点" && candidate.point.every((value, axis) => value === [5,0,0][axis])));
});
