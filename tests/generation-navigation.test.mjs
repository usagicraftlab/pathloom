import test from "node:test";
import assert from "node:assert/strict";
import {
  bindingIdsForCadSelection,
  bindingIdsForGraphSelection,
  cadTargetsForBindings,
  graphHighlightsForBindings,
} from "../cad/generation-navigation.js";

const definition = {
  version: 2,
  inputs: [
    { id: "cad", type: "surface", cadBinding: { id: "binding-a" } },
    { id: "plain", type: "curve", curve: { type: "polyline", closed: true, points: [[0, 0], [1, 0], [0, 1]] } },
  ],
  steps: [
    { id: "slice", operation: "slice-step", version: 1, source: "input:cad", params: { layerHeight: 1, tolerance: .02 } },
    { id: "paths", operation: "build-toolpath", version: 1, source: "slice", params: { seam: 0, reverse: false, nearest: false } },
  ],
  output: "paths",
};

test("P2-28 graph selection traces CAD bindings through node and connection dependencies", () => {
  assert.deepEqual(bindingIdsForGraphSelection(definition, { nodeIds: ["paths"] }), ["binding-a"]);
  assert.deepEqual(bindingIdsForGraphSelection(definition, { edge: { from: "slice", to: "paths", slot: "source" } }), ["binding-a"]);
  assert.deepEqual(bindingIdsForGraphSelection(definition, { nodeIds: ["input:plain"] }), []);
});

test("P2-28 CAD bindings highlight their input, dependent nodes, and connecting wires", () => {
  const result = graphHighlightsForBindings(definition, ["binding-a"]);
  assert.deepEqual(new Set(result.nodeIds), new Set(["input:cad", "slice", "paths", "$output"]));
  assert.equal(result.edges.length, 3);
  assert.ok(result.edges.some((edge) => edge.from === "input:cad" && edge.to === "slice"));
});

test("P2-28 CAD selection follows body identity and binding repair targets the current entity", () => {
  const document = {
    entities: [
      { id: "old", bodyId: "body", producer: { featureId: "rectangle" } },
      { id: "tip", bodyId: "body", producer: { featureId: "fillet" } },
    ],
    bodies: [{ id: "body", tipEntityId: "tip" }],
    outputBindings: [{ id: "binding-a", source: { mode: "body-result", bodyId: "body" }, resolvedEntityId: "tip" }],
  };
  assert.deepEqual(bindingIdsForCadSelection(document, ["old"]), ["binding-a"]);
  assert.deepEqual(cadTargetsForBindings(document, ["binding-a"]), [
    { bindingId: "binding-a", entityId: "tip", featureId: "fillet" },
  ]);
});
