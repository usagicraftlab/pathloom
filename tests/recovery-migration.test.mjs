import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectRecovery,
  parseProjectRecovery,
  prepareProjectOpen,
  readLibraryContainer,
  writeLibraryContainer,
} from "../recovery-migration.js";

const project = () => ({
  format: "pathloom",
  version: 1,
  sources: [{
    id: "S1",
    filename: "part.toolpath",
    label: "Part",
    paths: [{ order: 0, tool: 0, points: [[0, 0, 0.2], [1, 0, 0.2]] }],
    tools: [["0", { color: "#ffffff", name: "White", erate: 1, speedOverride: null }]],
  }],
  instances: [["I1", { source: "S1", x: 0, y: 0, rotation: 0, order: 1 }]],
  settings: {
    printer: "Prusa MK4S", printWidth: 0.4, printHeight: 0.2,
    printSpeed: 30, travelSpeed: 100, nozzleTemperature: 220,
    bedTemperature: 60, fanSpeed: 50,
  },
  profile: {
    filamentDiameter: 1.75, bedWidth: 250, bedDepth: 210, maxHeight: 220,
    startGcode: "G28", toolChangeGcode: "T{to_tool}", endGcode: "M84",
  },
  view: { layer: 1, showInputs: false },
});

test("known projects open editable and whole-project recovery retains non-CAD data", () => {
  const original = project();
  const opened = prepareProjectOpen(original);
  assert.equal(opened.mode, "editable");
  const envelope = createProjectRecovery(original, "2026-11-01T14:55:00.000Z");
  original.sources[0].label = "changed later";
  const recovered = parseProjectRecovery(envelope);
  assert.equal(recovered.kind, "project");
  assert.equal(recovered.candidate.mode, "editable");
  assert.equal(recovered.candidate.project.sources[0].label, "Part");
});

test("unknown project, CAD schema, and CAD operation versions recover read-only without mutation", () => {
  const candidates = [
    { ...project(), version: 99, future: { keep: true } },
    { ...project(), version: 2, cadDocument: { format: "pathloom-cad-document", schemaVersion: 8, future: true } },
    {
      ...project(), version: 2,
      cadDocument: {
        format: "pathloom-cad-document", schemaVersion: 1,
        features: [{ operation: { id: "future.op", version: 7 } }],
      },
    },
  ];
  for (const candidate of candidates) {
    const before = JSON.stringify(candidate);
    const opened = prepareProjectOpen(candidate);
    assert.equal(opened.mode, "read-only");
    assert.equal(JSON.stringify(opened.raw), before);
    assert.match(opened.compatibility, /version|schemaVersion/);
  }
});

test("legacy CAD recovery remains distinguishable for migration", () => {
  const document = { format: "pathloom-cad-document", schemaVersion: 1, features: [] };
  assert.deepEqual(parseProjectRecovery(document), { kind: "legacy-cad", document });
  assert.throws(() => parseProjectRecovery({ format: "other" }), /Unsupported recovery/);
});

test("all legacy Library arrays migrate losslessly to typed versioned containers", () => {
  for (const type of ["component", "shape", "command"]) {
    const entries = [{ id: `${type}-1`, future: { untouched: true } }];
    const migrated = readLibraryContainer(entries, type);
    assert.equal(migrated.migrated, true);
    assert.deepEqual(migrated.entries, entries);
    assert.deepEqual(writeLibraryContainer(entries, type), migrated.container);
    assert.deepEqual(readLibraryContainer(migrated.container, type).entries, entries);
    assert.throws(() => readLibraryContainer(migrated.container, type === "shape" ? "command" : "shape"), /Unsupported/);
  }
});
