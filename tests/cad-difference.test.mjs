import test from "node:test";
import assert from "node:assert/strict";
import { commandById } from "../cad/commands/registry.js";
import {
  createCommandSession,
  operationForSession,
  dispatchSession,
} from "../cad/commands/session.js";
import {
  differenceOutputs,
  validateDifferenceTargets,
  reconcileDifferenceTools,
} from "../cad/difference.js";

test("D02 rejects two historical entities of the same body before kernel evaluation", () => {
  const doc = {
    entities: [
      { id: "old", bodyId: "same" },
      { id: "tip", bodyId: "same" },
    ],
  };
  assert.throws(
    () =>
      validateDifferenceTargets(doc, {
        arguments: [{ entityId: "old" }, { entityId: "tip" }],
      }),
    /同じbody/,
  );
  assert.doesNotThrow(() =>
    validateDifferenceTargets(doc, { arguments: [{ entityId: "tip" }] }),
  );
});

const ref = (entityId, role) => ({ entityId, role });
function session() {
  const s = createCommandSession(commandById("D02"));
  dispatchSession(s, {
    type: "input.set",
    key: "arguments",
    refs: [ref("a", "arguments"), ref("b", "arguments")],
  });
  dispatchSession(s, {
    type: "input.set",
    key: "tools",
    refs: [ref("c", "tools")],
  });
  return s;
}
test("D02 preserves both roles and defaults to consuming tools; retention is an explicit boolean", () => {
  const s = session();
  let op = operationForSession(s);
  assert.deepEqual(op.parameters, { keepTools: false });
  assert.deepEqual(op.inputs, s.inputs);
  dispatchSession(s, { type: "setting.change", key: "keepTools", value: true });
  assert.equal(operationForSession(s).parameters.keepTools, true);
  assert.equal(commandById("D01").defaults.keepTools, undefined);
  assert.equal(commandById("D03").defaults.keepTools, undefined);
});
test("D02 rejects unsupported modes, parameters, subshapes, duplicate targets and wrong roles before evaluation", () => {
  const cases = [
    (s) => {
      s.command.mode = "sequential";
    },
    (s) => {
      s.command.adapter = "rectangle.center.v1";
    },
    (s) => {
      s.parameters.mode = "sequential";
    },
    (s) => {
      s.parameters.keepTools = "true";
    },
    (s) => {
      s.inputs.cut = s.inputs.tools;
    },
    (s) => {
      s.inputs.arguments[0].kind = "face";
    },
    (s) => {
      s.inputs.arguments[0].role = "tools";
    },
    (s) => {
      s.inputs.arguments.push(s.inputs.arguments[0]);
    },
  ];
  for (const change of cases) {
    const s = session();
    change(s);
    assert.throws(() => operationForSession(s), /Difference|工具保持/);
  }
  const s = session();
  s.inputs.tools = [ref("a", "tools")]; // Explicit self-subtraction is a valid empty result.
  assert.doesNotThrow(() => operationForSession(s));
});
test("D02 ties ordered native remainders to target identities and validates completeness", () => {
  const inputs = session().inputs;
  const a = { slotKey: "argument/0", geometryHash: "remainder-a" };
  const b = { slotKey: "argument/1", geometryHash: "remainder-b" };
  const first = differenceOutputs([a, b], inputs);
  const reversed = differenceOutputs(
    [
      { ...b, slotKey: "argument/0" },
      { ...a, slotKey: "argument/1" },
    ],
    { ...inputs, arguments: [...inputs.arguments].reverse() },
  );
  assert.deepEqual(
    Object.fromEntries(first.map((o) => [o.slotKey, o.geometryHash])),
    Object.fromEntries(reversed.map((o) => [o.slotKey, o.geometryHash])),
  );
  assert.throws(() => differenceOutputs([a], inputs), /対象数/);
  assert.throws(() => differenceOutputs([a, a], inputs), /対応/);
  assert.equal(
    differenceOutputs([{ slotKey: "result" }], {
      arguments: [inputs.arguments[0]],
    })[0].slotKey,
    "result",
  );
});
test("D02 restores retained tools, respects other consumers and restores a deselected tool", () => {
  const primitive = (id) => ({
    id,
    operation: { id: "solid.box" },
    inputs: {},
    parameters: {},
    status: "valid",
    outputSlots: [{ key: "result", entityId: id, bodyId: id }],
    resultPolicy: "copy",
  });
  const cut = {
    id: "cut",
    operation: { id: "solid.difference" },
    inputs: {
      arguments: [ref("a", "arguments")],
      tools: [ref("c", "tools")],
    },
    parameters: { keepTools: true },
    status: "valid",
    resultPolicy: "replace",
    outputSlots: [{ key: "result", entityId: "out", bodyId: "a" }],
  };
  const doc = {
    features: [primitive("a"), primitive("c"), cut],
    entities: ["a", "c", "out"].map((id) => ({
      id,
      bodyId: id === "out" ? "a" : id,
    })),
    bodies: ["a", "c"].map((id) => ({
      id,
      tipEntityId: null,
      status: "ready",
      splitIntoBodyIds: [],
    })),
  };
  reconcileDifferenceTools(doc);
  assert.equal(doc.bodies[1].tipEntityId, "c");
  cut.parameters.keepTools = false;
  reconcileDifferenceTools(doc);
  assert.equal(doc.bodies[1].tipEntityId, null);
  cut.parameters.keepTools = true;
  doc.features.push({
    ...primitive("later"),
    resultPolicy: "replace",
    inputs: { object: [ref("c", "object")] },
  });
  reconcileDifferenceTools(doc);
  assert.equal(doc.bodies[1].tipEntityId, null);
  doc.features.pop();
  cut.inputs.tools = [];
  reconcileDifferenceTools(doc, [ref("c", "tools")]);
  assert.equal(doc.bodies[1].tipEntityId, "c");
});
