import test from "node:test";
import assert from "node:assert/strict";
import { commandById } from "../cad/commands/registry.js";
import {
  createCommandSession,
  operationForSession,
  rectanglePointKeys,
  setRectangleMode,
  sessionReady,
} from "../cad/commands/session.js";
import {
  parseScalar,
  parseCoordinate,
  validateDrawingPlane,
  inDrawingPlane,
} from "../cad/commands/input.js";

const plane = { origin: [10, 20, 30], xAxis: [1, 0, 0], yAxis: [0, 0, 1] };
test("P1-05 relative UV adds only the displacement, while absolute UV includes plane origin", () => {
  assert.deepEqual(
    parseCoordinate("@1,2", { plane, previous: [5, 6, 7] }),
    [6, 6, 9],
  );
  assert.deepEqual(parseCoordinate("1,2", { plane }), [11, 20, 32]);
  assert.deepEqual(
    parseCoordinate("@1cm,2mm", { plane, previous: [5, 6, 7] }),
    [15, 6, 9],
  );
  assert.deepEqual(parseCoordinate("-2,3,-5", { plane }), [-2, 3, -5]);
  assert.deepEqual(
    parseCoordinate("@1,2,-3", { plane, previous: [5, 6, 7] }),
    [6, 8, 4],
  );
});
test("P1-05 units and incomplete/overflow coordinates fail before creating geometry", () => {
  assert.equal(parseScalar("1cm"), 10);
  assert.equal(parseScalar(".001m"), 1);
  for (const value of ["", "1,", "NaN,2", "Infinity,0", "1deg,0", "1e308m,0"])
    assert.throws(() => parseCoordinate(value));
  assert.throws(() => parseCoordinate("@1,2"), /起点/);
  assert.throws(
    () => parseCoordinate("@1e308,0,0", { previous: [1e308, 0, 0] }),
    /有限/,
  );
});
test("P1-05 plane mapping follows the native orthonormal-frame contract without restricting free XYZ", () => {
  const arbitrary = {
    origin: [-3, 4, -5],
    xAxis: [1, 0, 0],
    yAxis: [0, Math.cos(0.4), Math.sin(0.4)],
  };
  assert.equal(validateDrawingPlane(arbitrary), arbitrary);
  assert.ok(
    inDrawingPlane(parseCoordinate("2,7", { plane: arbitrary }), arbitrary),
  );
  assert.equal(inDrawingPlane([0, 5, 0], plane), false);
  for (const invalid of [
    null,
    {},
    { ...plane, xAxis: [0, 0, 0] },
    { ...plane, yAxis: [1, 0, 0] },
    { ...plane, xAxis: [2, 0, 0] },
    { ...plane, origin: [0, 0, Infinity] },
  ])
    assert.throws(() => parseCoordinate("1,2", { plane: invalid || {} }));
  assert.deepEqual(parseCoordinate("1,2,-9", { plane: {} }), [1, 2, -9]);
});
test("P1-05 Rectangle mode changes preserve geometry and pinned command definitions", () => {
  const original = commandById("C04"),
    session = createCommandSession(original);
  setRectangleMode(session, "twoCorners");
  session.inputValues.rectangleA = [40, 30, 0];
  session.inputValues.rectangleB = [10, 10, 0];
  let p = operationForSession(session).parameters;
  assert.deepEqual(p.anchor, [10, 10, 0]);
  assert.equal(p.widthMm, 30);
  assert.equal(p.heightMm, 20);
  setRectangleMode(session, "threePoints");
  session.inputValues.rectangleA = [0, 0, -10];
  session.inputValues.rectangleB = [10, 0, -10];
  session.inputValues.rectangleC = [4, 0, 10];
  p = operationForSession(session).parameters;
  assert.equal(p.widthMm, 10);
  assert.equal(p.heightMm, 20);
  assert.deepEqual(p.plane.yAxis, [0, 0, 1]);
  assert.equal(rectanglePointKeys(session).length, 3);
  setRectangleMode(session, "center");
  assert.deepEqual(operationForSession(session).parameters.anchor, [5, 0, 0]);
  assert.deepEqual(commandById("C04"), original);
  assert.deepEqual(session.command, original);
});
test("P1-05 two corners use the chosen plane and reject an off-plane or zero-area rectangle", () => {
  const session = createCommandSession(commandById("C04"));
  session.parameters.plane = plane;
  setRectangleMode(session, "twoCorners");
  session.inputValues.rectangleA = [10, 20, 30];
  session.inputValues.rectangleB = [4, 20, 25];
  const p = operationForSession(session).parameters;
  assert.deepEqual(p.anchor, [4, 20, 25]);
  assert.equal(p.widthMm, 6);
  assert.equal(p.heightMm, 5);
  session.inputValues.rectangleB = [4, 21, 25];
  assert.throws(() => operationForSession(session), /同じ作業平面/);
  session.inputValues.rectangleB = [10, 20, 25];
  assert.throws(() => operationForSession(session), /幅・高さ/);
});
test("P1-05 three-point Rectangle rejects missing, collinear and nonfinite point sets", () => {
  const session = createCommandSession(commandById("C04"));
  setRectangleMode(session, "threePoints");
  for (const points of [
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, Infinity, 0],
    ],
    [[0, 0, 0], [1, 0, 0], null],
  ]) {
    [
      session.inputValues.rectangleA,
      session.inputValues.rectangleB,
      session.inputValues.rectangleC,
    ] = points;
    assert.throws(() => operationForSession(session));
  }
});
test("P1-05 Move preselection stays explicit for multiple selected objects", () => {
  const command = commandById("transform.move"),
    selection = [
      { entityId: "a", entityKind: "solid" },
      { entityId: "b", entityKind: "curve" },
    ];
  const one = createCommandSession(command, {
    selection: selection.slice(0, 1),
  });
  assert.equal(sessionReady(one), true);
  assert.equal(one.inputs.object[0].entityId, "a");
  const multiple = createCommandSession(command, { selection });
  assert.equal(sessionReady(multiple), false);
  assert.deepEqual(multiple.inputs.object, []);
  multiple.inputs.object = [{ entityId: "b" }];
  assert.equal(sessionReady(multiple), true);
  assert.equal(operationForSession(multiple).parameters.mode, "move");
});
