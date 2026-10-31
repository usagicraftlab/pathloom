import assert from "node:assert/strict";
import test from "node:test";
import { commandById, findCommands } from "../cad/commands/registry.js";

test("Issue 17 publishes registry-first surface editing without removing v1", () => {
  for (const id of ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11", "D08", "D09"])
    assert.ok(findCommands(id).some((command) => command.id === id), id);
  assert.equal(commandById("F01", 1).baseOperation.id, "surface.join");
  assert.equal(commandById("F01", 2).baseOperation.id, "surface.join");
  assert.equal(commandById("F11", 1).baseOperation.id, "surface.reverse");
  assert.equal(commandById("F11", 2).baseOperation.id, "surface.reverse");
  assert.equal(commandById("D08").inputs.find((slot) => slot.key === "face").kind, "subshape");
  assert.equal(commandById("D09").baseOperation.id, "shape.splitFace");
});
