import test from "node:test";
import assert from "node:assert/strict";
import { CadStore } from "../cad/store.js";
import { deriveVisibleEntities } from "../cad/document.js";
import { syncCadBindingSources } from "../cad/generation-adapter.js";

function bodyChain(status = "failed") {
  const store = new CadStore({ cancelAll() {} });
  const d = store.document;
  d.features = ["rectangle", "extrude", "fillet", "independent"].map((id, i) => ({
    id, status: i === 2 ? status : "valid", resultHash: `${id}-hash`,
    outputSlots: [{ key: "result", entityId: `e-${id}`, bodyId: i === 3 ? "other" : "body" }],
    lastValid: { resultHash: `${id}-hash` },
  }));
  d.entities = d.features.map((f, i) => ({
    id: `e-${f.id}`, bodyId: i === 3 ? "other" : "body",
    kind: i === 0 || i === 3 ? "curve" : "solid",
    producer: { featureId: f.id }, resultHash: f.resultHash,
  }));
  d.bodies = [
    { id: "body", tipEntityId: "e-extrude", status: "ready" },
    { id: "other", tipEntityId: "e-independent", status: "ready" },
  ];
  d.outputBindings = [
    { id: "bound", source: { mode: "body-result", bodyId: "body" }, expectedKind: "brep" },
    { id: "healthy", source: { mode: "body-result", bodyId: "other" }, expectedKind: "curve" },
  ];
  return store;
}

test("P1-06 body bindings retain the terminal lastValid instead of accepting a recomputed ancestor", () => {
  for (const status of ["dirty", "running", "blocked", "failed", "cancelled"]) {
    const store = bodyChain(status);
    store.resolveBindings();
    const [binding, healthy] = store.document.outputBindings;
    assert.equal(store.document.bodies[0].tipEntityId, "e-fillet");
    assert.equal(binding.resolvedEntityId, "e-fillet");
    assert.equal(binding.resolvedResultHash, "fillet-hash");
    assert.equal(binding.status, "pending", status);
    assert.equal(healthy.status, "ready");
  }
});

test("P1-06 an unadopted feature is pending and removing it restores the previous body result", () => {
  const store = bodyChain("running");
  store.document.entities = store.document.entities.filter((e) => e.id !== "e-fillet");
  store.resolveBindings();
  assert.equal(store.document.outputBindings[0].status, "pending");
  assert.equal(store.document.outputBindings[0].resolvedEntityId, null);
  store.document.features = store.document.features.filter((f) => f.id !== "fillet");
  store.resolveBindings();
  assert.equal(store.document.outputBindings[0].status, "ready");
  assert.equal(store.document.outputBindings[0].resolvedEntityId, "e-extrude");
});

test("P1-06 intentional suppression follows history and both binding type changes are explicit", () => {
  const store = bodyChain("suppressed"), [bound] = store.document.outputBindings;
  store.resolveBindings();
  assert.equal(bound.status, "ready");
  assert.equal(bound.resolvedEntityId, "e-extrude");
  bound.expectedKind = "curve";
  store.resolveBindings();
  assert.equal(bound.status, "type-changed");
  bound.expectedKind = "brep";
  store.document.features[1].status = "suppressed";
  store.resolveBindings();
  assert.equal(bound.resolvedEntityId, "e-rectangle");
  assert.equal(bound.status, "type-changed");
});

test("P1-06 split and missing bodies cannot be resurrected by old feature slots", () => {
  const store = bodyChain("valid"), body = store.document.bodies[0];
  Object.assign(body, { status: "split", tipEntityId: null, splitIntoBodyIds: ["other"] });
  store.resolveBindings();
  assert.equal(body.tipEntityId, null);
  assert.equal(store.document.outputBindings[0].status, "split");
  assert.deepEqual(store.document.outputBindings[0].candidateBodyIds, ["other"]);
  Object.assign(body, { status: "missing", splitIntoBodyIds: [] });
  store.resolveBindings();
  assert.equal(body.tipEntityId, null);
  assert.equal(store.document.outputBindings[0].status, "missing");
});

function graph(used = true) {
  return {
    inputs: [
      { id: "cad", name: "Local label", visible: false, exposed: false,
        curve: { points: [[0, 0], [1, 0]] },
        cadBinding: { id: "binding", status: "ready", resultHash: "old", assetHash: "old-asset" } },
      { id: "normal" },
    ],
    steps: [{ id: "paths", source: `input:${used ? "cad" : "normal"}`, params: {} }], output: "paths",
  };
}

test("P1-06 a shared graph invalidates every output before any aliased input is updated", () => {
  const shared = graph(), independent = graph(false);
  const sources = [
    { id: "one", generatorGroup: "bound", generator: shared },
    { id: "copy", generatorGroup: "bound", generator: shared },
    { id: "other", generatorGroup: "normal", generator: independent, generationError: "unrelated error" },
  ];
  syncCadBindingSources(sources, { bindingId: "binding", status: "ready", input: {
    id: "cad", name: "Remote label", visible: true, exposed: true,
    curve: { points: [[0, 0], [2, 0]] }, cadBinding: { id: "binding", status: "ready", resultHash: "new", assetHash: "new-asset" },
  } });
  for (const source of sources.slice(0, 2)) assert.match(source.generationError, /updated; select this graph/);
  assert.equal(shared.inputs[0].name, "Local label");
  assert.equal(shared.inputs[0].visible, false);
  assert.equal(shared.inputs[0].exposed, false);
  assert.equal(shared.inputs[0].cadBinding.resultHash, "new");
  assert.equal(sources[2].generationError, "unrelated error");
});

test("P1-06 pending bindings preserve old geometry and identical ready input does not dirty a graph", () => {
  const definition = graph(), source = { id: "one", generator: definition };
  const old = structuredClone(definition.inputs[0]);
  syncCadBindingSources([source], { bindingId: "binding", status: "ready", input: old });
  assert.equal(source.generationError, undefined);
  syncCadBindingSources([source], { bindingId: "binding", status: "pending" });
  assert.equal(definition.inputs[0].cadBinding.status, "pending");
  assert.equal(definition.inputs[0].cadBinding.resultHash, "old");
  assert.deepEqual(definition.inputs[0].curve, old.curve);
  assert.match(source.generationError, /CAD input Local label: pending/);
  assert.equal(old.cadBinding.status, "ready");
});


test("P1-06 binding refresh does not resurrect an intentionally consumed ready body", () => {
  for (const status of ["valid", "dirty", "running", "blocked", "failed", "cancelled"]) {
    const store = bodyChain(status), consumed = store.document.bodies[1];
    consumed.tipEntityId = null; // The replace/consume policy leaves this body ready.
    store.resolveBindings();
    assert.equal(consumed.status, "ready");
    assert.equal(consumed.tipEntityId, null, status);
    assert.equal(deriveVisibleEntities(store.document).some(e => e.id === "e-independent"), false, status);
    assert.equal(store.document.outputBindings[1].status, "missing");
    assert.equal(store.document.outputBindings[0].status, status === "valid" ? "ready" : "pending");
    assert.equal(store.document.bodies[0].tipEntityId, "e-fillet");
  }
});
