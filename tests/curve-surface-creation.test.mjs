import test from "node:test";
import assert from "node:assert/strict";
import { commandById, findCommands } from "../cad/commands/registry.js";
import {
  createCommandSession,
  operationForSession,
  sessionReady,
} from "../cad/commands/session.js";

test("Issue16 commands are registry-first and retain their complete native contracts", () => {
  const ids = [
    "C11",
    "C12",
    "E13",
    "E13.pull",
    "E14",
    "E14.intersect",
    "E14.contour",
    "S04",
    "S06",
    "S07",
    "S08",
    "S09",
    "S10",
    "S11",
  ];
  for (const id of ids) assert.ok(findCommands().some((c) => c.id === id), id);
  assert.equal(commandById("C11").baseOperation.id, "curve.helix");
  assert.equal(commandById("C12").baseOperation.id, "curve.spiral");
  assert.equal(commandById("S08").inputs.find((s) => s.key === "rails").minCount, 2);
  assert.equal(commandById("S10").inputs.find((s) => s.key === "uCurves").minCount, 2);
  assert.deepEqual(commandById("E12").defaults, { mode: "all" });
});

test("multi-input surface sessions require every explicit role and preserve ordering", () => {
  const session = createCommandSession(commandById("S10"));
  assert.equal(sessionReady(session), false);
  session.inputs.uCurves = [
    { entityId: "u0", role: "uCurves" },
    { entityId: "u1", role: "uCurves" },
  ];
  session.inputs.vCurves = [
    { entityId: "v0", role: "vCurves" },
    { entityId: "v1", role: "vCurves" },
  ];
  assert.equal(sessionReady(session), true);
  const operation = operationForSession(session);
  assert.equal(operation.operation.id, "surface.network");
  assert.deepEqual(operation.inputs.uCurves.map((ref) => ref.entityId), ["u0", "u1"]);
  assert.deepEqual(operation.inputs.vCurves.map((ref) => ref.entityId), ["v0", "v1"]);
  assert.deepEqual(operation.parameters, {
    intersectionToleranceMm: 0.01,
    fitToleranceMm: 0.01,
    boundaryConditions: {
      uStart: "position",
      uEnd: "position",
      vStart: "position",
      vEnd: "position",
    },
  });
});
