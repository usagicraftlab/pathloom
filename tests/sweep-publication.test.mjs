import assert from "node:assert/strict";
import test from "node:test";

import { commandById } from "../cad/commands/registry.js";
import { createCommandSession } from "../cad/commands/session.js";

const PUBLIC = ["S08", "S10", "S11", "F08", "F09", "F10"];

test("Issue 18 publishes all validated sweep and advanced-surface commands", () => {
  for (const id of PUBLIC) {
    const command = commandById(id);
    assert.ok(command, id);
    const session = createCommandSession(command);
    assert.equal(session.command.id, id);
    assert.equal(session.command.baseOperation.version, 1);
  }
  assert.equal(commandById("S08").baseOperation.id, "surface.sweep2");
  assert.equal(commandById("S10").baseOperation.id, "surface.network");
  assert.equal(commandById("S11").baseOperation.id, "surface.patch");
  assert.equal(commandById("F08").baseOperation.id, "surface.blend");
  assert.equal(commandById("F09").baseOperation.id, "surface.match");
  assert.equal(commandById("F10").baseOperation.id, "surface.rebuild");
});
