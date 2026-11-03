import test from "node:test";
import assert from "node:assert/strict";
import {
  createCadDocument,
  validateCadDocument,
  sha256,
} from "../cad/document.js";
import { planRecompute } from "../cad/history.js";
import { CadStore } from "../cad/store.js";
import { createTransactions } from "../cad/transactions.js";
import { resolveSubshape } from "../cad/references.js";
import { parseScalar, parseCoordinate } from "../cad/commands/input.js";
import {
  commandById,
  registerCommand,
  resolveAlias,
  adaptCommand,
} from "../cad/commands/registry.js";
import { solveSketch, qrSolve } from "../cad/sketch/solver.js";
import {
  createSketch,
  copySketchToSupport,
  sketchPointWorld,
  updateSketchSupport,
} from "../cad/sketch/model.js";
function feature(id, input = []) {
  return {
    id,
    operation: { id: "curve.line", version: 1 },
    command: { id: "C02", version: 1, mode: "default" },
    inputs: {
      objects: input.map((entityId) => ({ entityId, role: "object" })),
    },
    parameters: {},
    featureRevision: 1,
    outputSlots: [{ key: "result", entityId: "e-" + id, bodyId: "b-" + id }],
    status: "dirty",
    diagnostics: [],
  };
}
test("CAD DAG invalidation follows only dependencies and rejects cycles", () => {
  const d = createCadDocument();
  d.features = [feature("a"), feature("b", ["e-a"]), feature("c")];
  assert.deepEqual(
    planRecompute(d, ["a"]).map((f) => f.id),
    ["a", "b"],
  );
  validateCadDocument(d);
  d.features[0].inputs.objects = [{ entityId: "e-b" }];
  assert.throws(() => validateCadDocument(d), /cycle/);
});
test("CAD units and relative coordinates never evaluate code", () => {
  assert.equal(parseScalar("1.2e2 cm"), 1200);
  assert.equal(parseScalar("180deg", "angle"), Math.PI);
  assert.deepEqual(
    parseCoordinate("@1,2,3", { previous: [3, 4, 5] }),
    [4, 6, 8],
  );
  assert.throws(() => parseCoordinate("@1,2"));
  assert.throws(() => parseScalar("process.exit()"));
  assert.throws(() => parseScalar("1rad"));
});
test("command adapter preserves center and computes three-point orthogonal plane", () => {
  const d = commandById("C04");
  assert.equal(adaptCommand(d, d.defaults).anchorMode, "center");
  const custom = {
    ...d,
    id: "user.three",
    displayName: "Three Point",
    aliases: ["ThreeRectangle"],
    adapter: "rectangle.threePoints.v1",
  };
  registerCommand(custom);
  const p = adaptCommand(custom, {
    ...d.defaults,
    points: [
      [0, 0, 0],
      [10, 10, 0],
      [0, 20, 0],
    ],
  });
  assert.ok(Math.abs(p.widthMm - Math.sqrt(200)) < 1e-9);
  assert.ok(Math.abs(p.heightMm - Math.sqrt(200)) < 1e-9);
  assert.equal(resolveAlias("threerectangle").id, "user.three");
  assert.throws(
    () => registerCommand({ ...d, id: "user.collision" }),
    /collision/,
  );
});
test("semantic reference follows explicit path but nearest geometry never silently rebinds", () => {
  const e = {
    resultHash: "new",
    displayCache: {
      topology: [
        {
          kind: "edge",
          topologyId: "new-id",
          semanticPath: ["side", "corner", "11"],
        },
      ],
    },
  };
  const ref = {
    kind: "edge",
    topologyId: "old",
    recordedResultHash: "old",
    semanticPath: ["side", "corner", "11"],
  };
  assert.equal(resolveSubshape(ref, e).selector.topologyId, "new-id");
  assert.equal(
    resolveSubshape({ ...ref, semanticPath: ["missing"] }, e).status,
    "missing",
  );
});
test("Undo uses monotonic document revision and shares immutable asset storage", () => {
  let d = createCadDocument();
  d.assets = { asset: { data: "geometry" } };
  const tx = createTransactions(
      () => d,
      (v) => (d = v),
    ),
    before = structuredClone(d);
  d.documentRevision++;
  d.uiState.leftWidth = 300;
  tx.record(before, d, "panel");
  assert.ok(tx.undo());
  assert.equal(d.documentRevision, 2);
  assert.equal(d.uiState.leftWidth, 280);
  assert.ok(tx.redo());
  assert.equal(d.documentRevision, 3);
  assert.equal(d.uiState.leftWidth, 300);
});
test("composite CAD actions squash their history into one Undo/Redo unit", () => {
  let d = createCadDocument();
  const tx = createTransactions(
    () => d,
    (value) => (d = value),
  );
  const first = structuredClone(d);
  d.documentRevision++;
  d.uiState.leftWidth = 300;
  tx.record(first, d, "Extrude");
  const second = structuredClone(d);
  d.documentRevision++;
  d.uiState.rightWidth = 360;
  tx.record(second, d, "Union");
  assert.equal(tx.squashLast(2, "押し出し追加"), true);
  assert.equal(tx.undo(), true);
  assert.equal(d.uiState.leftWidth, 280);
  assert.equal(d.uiState.rightWidth, 320);
  assert.equal(tx.undo(), false);
  assert.equal(tx.redo(), true);
  assert.equal(d.uiState.leftWidth, 300);
  assert.equal(d.uiState.rightWidth, 360);
});
function rectangle(width = 60) {
  return {
    id: "sketch",
    points: [
      { id: "a", u: -30, v: -20 },
      { id: "b", u: 30, v: -20 },
      { id: "c", u: 30, v: 20 },
      { id: "d", u: -30, v: 20 },
    ],
    lines: [
      { id: "ab", start: "a", end: "b" },
      { id: "bc", start: "b", end: "c" },
      { id: "cd", start: "c", end: "d" },
      { id: "da", start: "d", end: "a" },
    ],
    circles: [],
    constraints: [
      { id: "h1", kind: "horizontal", refs: ["ab"] },
      { id: "v1", kind: "vertical", refs: ["bc"] },
      { id: "h2", kind: "horizontal", refs: ["cd"] },
      { id: "v2", kind: "vertical", refs: ["da"] },
      { id: "width", kind: "distanceU", refs: ["a", "b"], value: width },
      { id: "height", kind: "distanceV", refs: ["b", "c"], value: 40 },
      { id: "center", kind: "center", refs: ["a", "c"], value: [0, 0] },
    ],
  };
}
test("T03 constrained rectangle has zero DOF and width edit preserves center", () => {
  const result = solveSketch(rectangle(80));
  assert.equal(result.status, "solved");
  assert.equal(result.degreesOfFreedom, 0);
  assert.ok(result.maxResidual < 1e-6);
  assert.ok(Math.abs(result.sketch.points[0].u + 40) < 1e-6);
  assert.ok(Math.abs(result.sketch.points[2].u - 40) < 1e-6);
});
test("T04 conflicting dimension retains previous geometry and labels unproven conflict candidates", () => {
  const s = rectangle();
  s.constraints.push({
    id: "conflicting",
    kind: "distanceU",
    refs: ["a", "b"],
    value: 20,
  });
  const r = solveSketch(s);
  assert.equal(r.status, "no-convergence");
  assert.deepEqual(r.sketch, s);
  assert.ok(r.conflictCandidates.includes("width"));
  assert.ok(r.conflictCandidates.includes("conflicting"));
});
test("T05 fixed line and center x remain stable while radius changes along tangent", () => {
  const s = {
    points: [
      { id: "a", u: 0, v: 0 },
      { id: "b", u: 10, v: 0 },
      { id: "center", u: 5, v: 5 },
      { id: "origin", u: 5, v: 0 },
    ],
    lines: [{ id: "line", start: "a", end: "b" }],
    circles: [{ id: "circle", center: "center", radiusMm: 5 }],
    constraints: [
      { id: "fix", kind: "fixed", refs: ["a", "b", "origin"] },
      {
        id: "centerX",
        kind: "distanceU",
        refs: ["origin", "center"],
        value: 0,
      },
      { id: "radius", kind: "radius", refs: ["circle"], value: 7 },
      {
        id: "tangent",
        kind: "lineCircleTangent",
        refs: ["line", "circle"],
        side: -1,
      },
    ],
  };
  const r = solveSketch(s);
  assert.equal(r.status, "solved");
  assert.ok(Math.abs(r.sketch.points[2].v - 7) < 1e-6);
  assert.equal(r.sketch.points[2].u, 5);
  assert.deepEqual(r.sketch.points.slice(0, 2), s.points.slice(0, 2));
});
test("QR handles a rank-deficient system without a matrix inverse", () => {
  const { x, rank } = qrSolve(
    [
      [1, 1],
      [2, 2],
    ],
    [2, 4],
  );
  assert.equal(rank, 1);
  assert.ok(Math.abs(x[0] + x[1] - 2) < 1e-9);
});
test("P4-02 solver isolates independent components and records the failed one", () => {
  const s = {
    points: [
      { id: "a", u: 0, v: 0 },
      { id: "b", u: 8, v: 0 },
      { id: "c", u: 100, v: 0 },
      { id: "d", u: 108, v: 0 },
    ],
    lines: [
      { id: "first", start: "a", end: "b" },
      { id: "second", start: "c", end: "d" },
    ],
    circles: [],
    constraints: [
      { id: "fix-a", kind: "fixed", refs: ["a"] },
      { id: "first-horizontal", kind: "horizontal", refs: ["first"] },
      { id: "first-length", kind: "length", refs: ["first"], value: 10 },
      { id: "fix-c", kind: "fixed", refs: ["c"] },
      { id: "second-horizontal", kind: "horizontal", refs: ["second"] },
      { id: "second-long", kind: "length", refs: ["second"], value: 10 },
      { id: "second-short", kind: "length", refs: ["second"], value: 5 },
    ],
  };
  const result = solveSketch(s);
  assert.equal(result.status, "no-convergence");
  assert.equal(result.components.length, 2);
  assert.equal(result.components.filter((component) => component.status === "no-convergence").length, 1);
  assert.ok(Math.abs(result.candidate.points[1].u - 10) < 1e-6);
  assert.ok(result.conflictCandidates.includes("second-long"));
  assert.ok(result.conflictCandidates.includes("second-short"));
});
test("P4-02 scaled solve remains precise far from the local origin", () => {
  const s = {
    points: [
      { id: "a", u: 1_000_000, v: -2_000_000 },
      { id: "b", u: 1_000_008, v: -2_000_000 },
    ],
    lines: [{ id: "line", start: "a", end: "b" }],
    circles: [],
    constraints: [
      { id: "fixed", kind: "fixed", refs: ["a"] },
      { id: "horizontal", kind: "horizontal", refs: ["line"] },
      { id: "length", kind: "length", refs: ["line"], value: 10 },
    ],
  };
  const result = solveSketch(s);
  assert.equal(result.status, "solved");
  assert.ok(Math.abs(result.sketch.points[1].u - 1_000_010) < 1e-6);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "SKETCH_SOLVER_COMPONENTS"));
});
test("P4-02 hard drag, symmetry and reference dimensions share one component", () => {
  const s = {
    points: [
      { id: "axis-a", u: 0, v: -10 },
      { id: "axis-b", u: 0, v: 10 },
      { id: "left", u: -2, v: 1 },
      { id: "right", u: 3, v: 4 },
    ],
    lines: [{ id: "axis", start: "axis-a", end: "axis-b" }],
    circles: [],
    constraints: [
      { id: "fixed-axis", kind: "fixed", refs: ["axis"] },
      { id: "symmetric", kind: "symmetry", refs: ["left", "right", "axis"] },
      { id: "span", kind: "distance", refs: ["left", "right"], mode: "reference", label: "幅" },
    ],
  };
  const result = solveSketch(s, {
    drag: { pointId: "left", target: [-5, 2], mode: "hard" },
  });
  assert.equal(result.status, "solved");
  assert.equal(result.fullyConstrained, true);
  const left = result.sketch.points.find((point) => point.id === "left"),
    right = result.sketch.points.find((point) => point.id === "right");
  assert.ok(Math.abs(left.u + 5) < 1e-6 && Math.abs(left.v - 2) < 1e-6);
  assert.ok(Math.abs(right.u - 5) < 1e-6 && Math.abs(right.v - 2) < 1e-6);
  assert.ok(Math.abs(result.measurements.find((dimension) => dimension.id === "span").value - 10) < 1e-6);
});
test("P4-02 support movement follows its plane and missing support keeps the last plane", () => {
  const sketch = createSketch({ support: { entityId: "body", topologyId: "face-1" } });
  sketch.points.push({ id: "point", u: 2, v: 3 });
  const moved = updateSketchSupport(sketch, {
    origin: [10, 20, 30],
    xAxis: [0, 1, 0],
    yAxis: [0, 0, 1],
  });
  assert.deepEqual(sketchPointWorld(moved, moved.points[0]), [10, 22, 33]);
  const orphaned = updateSketchSupport(moved, null);
  assert.deepEqual(orphaned.plane, moved.plane);
  assert.equal(orphaned.supportStatus, "orphaned");
  assert.equal(orphaned.supportWarning.code, "SKETCH_SUPPORT_MISSING");
});

test("P4-03 copied sketch remaps every model identity and support independently", () => {
  const sketch = createSketch();
  sketch.points = [
    { id: "p1", u: 0, v: 0 },
    { id: "p2", u: 10, v: 0 },
  ];
  sketch.lines = [{ id: "line", start: "p1", end: "p2" }];
  sketch.constraints = [{ id: "length", kind: "length", refs: ["line"], value: 10 }];
  sketch.dimensions = [{ id: "dimension", constraintId: "length", refs: ["p1", "p2"] }];
  const copied = copySketchToSupport(sketch, {
    plane: { origin: [1, 2, 3], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
    support: { entityId: "body", topologyId: "face", centroid: [1, 2, 3] },
  });
  const sourceIds = new Set([
    sketch.id,
    ...sketch.points.map((item) => item.id),
    ...sketch.lines.map((item) => item.id),
    ...sketch.constraints.map((item) => item.id),
    ...sketch.dimensions.map((item) => item.id),
  ]);
  const copiedIds = [
    copied.id,
    ...copied.points.map((item) => item.id),
    ...copied.lines.map((item) => item.id),
    ...copied.constraints.map((item) => item.id),
    ...copied.dimensions.map((item) => item.id),
  ];
  assert.ok(copiedIds.every((value) => !sourceIds.has(value)));
  assert.deepEqual(copied.lines[0], {
    id: copied.lines[0].id,
    start: copied.points[0].id,
    end: copied.points[1].id,
  });
  assert.deepEqual(copied.constraints[0].refs, [copied.lines[0].id]);
  assert.equal(copied.dimensions[0].constraintId, copied.constraints[0].id);
  assert.deepEqual(copied.dimensions[0].refs, copied.points.map((item) => item.id));
  assert.equal(copied.supportStatus, "linked");
  copied.points[0].u = 99;
  assert.equal(sketch.points[0].u, 0);
});

test("P4-02 linked face recompute moves the sketch and missing topology keeps it orphaned", () => {
  const store = new CadStore({ cancelAll() {} }),
    sketch = createSketch({
      plane: { origin: [2, 3, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] },
      support: {
        entityId: "support-entity",
        topologyId: "support-face",
        centroid: [0, 0, 0],
      },
    });
  sketch.points.push({ id: "p", u: 0, v: 0 });
  store.document.sketches.push(sketch);
  const sketchFeature = feature("sketch");
  sketchFeature.sketchId = sketch.id;
  sketchFeature.status = "valid";
  store.document.features.push(sketchFeature);
  store.document.entities.push({
    id: "support-entity",
    producer: { featureId: "source", slotKey: "result" },
    displayCache: {
      topology: [
        {
          kind: "face",
          topologyId: "support-face",
          fingerprint: { centroid: [10, 20, 30] },
        },
      ],
      faces: [{ planar: true, normal: [0, 0, 1] }],
    },
  });

  assert.equal(store.synchronizeSketchSupports(), true);
  assert.deepEqual(store.document.sketches[0].plane.origin, [12, 23, 30]);
  assert.equal(store.document.sketches[0].supportStatus, "linked");
  assert.equal(sketchFeature.status, "dirty");

  store.document.entities[0].displayCache.topology = [];
  store.document.entities[0].displayCache.faces = [];
  assert.equal(store.synchronizeSketchSupports(), true);
  assert.deepEqual(store.document.sketches[0].plane.origin, [12, 23, 30]);
  assert.equal(store.document.sketches[0].supportStatus, "orphaned");
  assert.equal(store.document.sketches[0].supportWarning.code, "SKETCH_SUPPORT_MISSING");
});
import { generationInput } from "../cad/generation-adapter.js";
import {
  geometryDefinition,
  validatePipeline,
  executePipeline,
} from "../cad-pipeline.js";
import {
  DEFAULT_DEFINITION,
  sectionPoints,
  validateSection,
} from "../cad-kernel.js";
import { createDesignEnvelope } from "../cad-ai-context.js";
test("CAD curve binding retains negative and nonplanar XYZ in graph/library validation and AI vault", () => {
  const binding = {
    id: "binding",
    name: "CAD curve",
    status: "ready",
    resolvedResultHash: "result",
    sampling: { toleranceMm: 0.02 },
  };
  const entity = {
    kind: "curve",
    geometry: { assetHash: "hash" },
    displayCache: {
      preview: {
        curves: [
          {
            points: [
              [0, 0, -10],
              [20, 3, 5],
              [30, 0, 0],
            ],
          },
        ],
      },
    },
  };
  const input = generationInput(binding, entity, {});
  const d = geometryDefinition(DEFAULT_DEFINITION);
  d.inputs.push(input);
  validatePipeline(d);
  const envelope = createDesignEnvelope({
    definition: d,
    library: [],
    history: [],
  });
  const packed = envelope.context.definition.inputs.at(-1);
  assert.equal(packed.curve, undefined);
  assert.ok(packed.geometryRef);
  assert.equal(packed.geometrySummary.bounds.min[2], -10);
  assert.deepEqual(
    envelope.restore(envelope.context.definition).inputs.at(-1).curve.points,
    input.curve.points,
  );
  const forged = structuredClone(envelope.context.definition);
  forged.inputs.push({ ...structuredClone(input), id: "forged-cad", meshes: [] });
  assert.throws(() => envelope.restore(forged), /local CAD binding/);
  const pending = structuredClone(d);
  pending.inputs.at(-1).cadBinding.status = "pending";
  pending.output = "input:" + input.id;
  assert.throws(
    () => executePipeline(pending, { sectionPoints, validateSection }),
    /CAD input/,
  );
});
import { packageShapes, insertShapes } from "../cad/shape-library.js";
test("shape Library remaps typed references without rewriting parameter strings", () => {
  const d = createCadDocument();
  const f = feature("a");
  f.parameters = { label: "a" };
  d.features = [f];
  const entity = {
    id: "e-a",
    bodyId: "b-a",
    producer: { featureId: "a", slotKey: "result" },
    kind: "curve",
    geometry: { assetHash: "hash", format: "occt-brep" },
    bbox: { min: [0, 0, 0], max: [10, 0, 0] },
    resultHash: "result",
    visibility: "visible",
    locked: false,
  };
  d.entities = [entity];
  d.assets = { hash: { data: "exact", format: "occt-brep" } };
  d.bodies = [
    { id: "b-a", tipEntityId: "e-a", status: "ready", splitIntoBodyIds: [] },
  ];
  const entry = packageShapes(d, ["e-a"]),
    a = insertShapes(d, entry),
    b = insertShapes(d, entry);
  assert.notEqual(a.features[0].id, b.features[0].id);
  assert.equal(a.features[0].parameters.label, "a");
  assert.equal(a.entities[0].producer.featureId, a.features[0].id);
  assert.equal(a.bodies[0].tipEntityId, a.entities[0].id);
  assert.equal(a.assets.hash.data, "exact");
  const snapshot = insertShapes(
    d,
    packageShapes(d, ["e-a"], { withHistory: false }),
  );
  assert.equal(snapshot.features[0].operation.id, "asset.snapshot");
  assert.equal(snapshot.entities[0].id, snapshot.selectedEntityIds[0]);
});
test("Issue15 Library placement appends an exact transform after an independently remapped closure", () => {
  const d = createCadDocument(),
    root = feature("root"),
    dependent = feature("dependent", ["e-root"]);
  root.outputSlots[0].bodyId = "b-root";
  dependent.outputSlots[0].bodyId = "b-root";
  const entity = (featureId, assetHash) => ({
    id: `e-${featureId}`,
    bodyId: "b-root",
    producer: { featureId, slotKey: "result" },
    kind: "solid",
    geometry: { assetHash, format: "occt-brep" },
    resultHash: assetHash,
    visibility: "visible",
    locked: false,
  });
  d.features = [root, dependent];
  d.entities = [entity("root", "root-hash"), entity("dependent", "tip-hash")];
  d.bodies = [
    {
      id: "b-root",
      name: "part",
      tipEntityId: "e-dependent",
      splitIntoBodyIds: [],
      status: "ready",
    },
  ];
  d.assets = {
    "root-hash": { data: "root", format: "occt-brep" },
    "tip-hash": { data: "tip", format: "occt-brep" },
  };
  const entry = packageShapes(d, ["e-dependent"]),
    first = insertShapes(d, entry, { translation: [10, -2, 3] }),
    second = insertShapes(d, entry, { translation: [10, -2, 3] });
  assert.equal(entry.features.length, 2);
  assert.equal(first.features.length, 3);
  assert.equal(first.features.at(-1).operation.id, "shape.transform");
  assert.deepEqual(first.features.at(-1).parameters, {
    mode: "move",
    translation: [10, -2, 3],
  });
  assert.equal(
    first.features.at(-1).inputs.object[0].entityId,
    first.features[1].outputSlots[0].entityId,
  );
  assert.equal(first.bodies[0].tipEntityId, first.selectedEntityIds[0]);
  assert.notEqual(first.selectedEntityIds[0], second.selectedEntityIds[0]);
  assert.equal(
    new Set([
      ...first.features.map((item) => item.id),
      ...first.entities.map((item) => item.id),
      ...first.bodies.map((item) => item.id),
      ...second.features.map((item) => item.id),
      ...second.entities.map((item) => item.id),
      ...second.bodies.map((item) => item.id),
    ]).size,
    12,
  );
  const unchanged = insertShapes(d, entry);
  assert.equal(unchanged.features.length, 2);
  assert.throws(
    () => insertShapes(d, entry, { translation: [0, Infinity, 0] }),
    /有限のXYZ/,
  );
});
import { createCommandSession, sessionReady } from "../cad/commands/session.js";
test("preselection never silently assigns the same solids to both Difference roles", () => {
  const selection = [
    { entityId: "one", entityKind: "solid" },
    { entityId: "two", entityKind: "solid" },
  ];
  const difference = createCommandSession(commandById("D02"), { selection });
  assert.equal(difference.inputs.arguments.length, 2);
  assert.equal(difference.inputs.tools.length, 0);
  assert.equal(sessionReady(difference), false);
  const union = createCommandSession(commandById("D01"), { selection });
  assert.equal(sessionReady(union), true);
  assert.equal(union.inputs.arguments.length, 2);
});
