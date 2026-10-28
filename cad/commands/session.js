import { clone, id } from "../document.js";
import { adaptCommand } from "./registry.js";
import { validateDifference } from "../difference.js";
import { validateDrawingPlane, inDrawingPlane } from "./input.js";
export function createCommandSession(
  command,
  { selection = [], parameters = null, featureId = null } = {},
) {
  const initial = clone(parameters || command.defaults),
    used = new Set(),
    inputs = {};
  for (const slot of command.inputs.filter((slot) =>
    ["entity", "subshape"].includes(slot.kind),
  )) {
    const eligible = selection.filter((r) =>
      slot.kind === "subshape"
        ? r.kind && slot.allowedEntityKinds.includes(r.kind)
        : (!r.kind || slot.key === "body") &&
          slot.allowedEntityKinds.includes(r.entityKind) &&
          !used.has(r.entityId),
    );
    const picked =
      command.baseOperation.id === "shape.transform" && eligible.length > 1
        ? []
        : eligible.slice(0, slot.maxCount ?? undefined);
    inputs[slot.key] = picked.map(({ entityKind, ...ref }) =>
      slot.kind === "subshape"
        ? ref
        : { entityId: ref.entityId, role: slot.key },
    );
    if (slot.kind === "entity") picked.forEach((r) => used.add(r.entityId));
  }
  return {
    id: id(),
    command: clone(command),
    state: "collecting",
    parameters: initial,
    inputValues: {},
    inputs,
    featureId,
    toleranceOverrides: {},
    previewSequence: 0,
    diagnostics: [],
    rawDraft: {},
    result: null,
  };
}
export function sessionReady(s) {
  return s.command.inputs.every((slot) => {
    if (slot.kind === "point")
      return !!slot.default || Array.isArray(s.inputValues?.[slot.key]);
    if (!["entity", "subshape"].includes(slot.kind)) return true;
    const count = s.inputs[slot.key]?.length || 0;
    return (
      count >= (slot.minCount ?? 1) &&
      (slot.maxCount == null || count <= slot.maxCount)
    );
  });
}
export function dispatchSession(s, event) {
  if (s.state === "committing") throw new Error("確定処理中です");
  if (event.type === "setting.change") {
    s.parameters[event.key] = clone(event.value);
    s.previewSequence++;
    s.result = null;
    s.state = "collecting";
  } else if (event.type === "input.set") {
    const slot = s.command.inputs.find((x) => x.key === event.key);
    if (!slot) throw new Error("Unknown input slot");
    s.inputs[event.key] = clone(event.refs);
    s.previewSequence++;
    s.result = null;
    s.state = "collecting";
  } else if (event.type === "cancel") {
    s.state = "cancelled";
    s.result = null;
  } else throw new Error("Unknown command event");
  return s;
}
export function operationForSession(s) {
  validateDifference(s.command, s.parameters, s.inputs);
  if (!sessionReady(s)) throw new Error("必要な形状を選択してください");
  let command = s.command,
    parameters = s.parameters;
  if (command.id === "C04" && s.drawingMode && s.drawingMode !== "center") {
    const points = rectanglePointKeys(s).map((key) => s.inputValues[key]);
    if (
      points.some(
        (p) => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite),
      )
    )
      throw new Error("長方形の作図点をXYZで指定してください");
    parameters = clone(parameters);
    if (s.drawingMode === "threePoints") {
      command = { ...command, adapter: "rectangle.threePoints.v1" };
      parameters.points = points;
    } else {
      const [a, b] = points,
        plane = validateDrawingPlane(parameters.plane);
      if (!inDrawingPlane(b, plane, a))
        throw new Error("2コーナーは同じ作業平面上に指定してください");
      const delta = b.map((v, i) => v - a[i]);
      const u = delta.reduce((n, v, i) => n + v * plane.xAxis[i], 0);
      const v = delta.reduce((n, value, i) => n + value * plane.yAxis[i], 0);
      if (Math.abs(u) <= 1e-12 || Math.abs(v) <= 1e-12)
        throw new Error("長方形の幅・高さを正数で指定してください");
      parameters.anchor = a.map(
        (n, i) =>
          n + Math.min(0, u) * plane.xAxis[i] + Math.min(0, v) * plane.yAxis[i],
      );
      parameters.widthMm = Math.abs(u);
      parameters.heightMm = Math.abs(v);
      command = { ...command, adapter: "rectangle.twoCorners.v1" };
    }
  }
  return {
    operation: s.command.baseOperation,
    parameters: adaptCommand(command, parameters, s.inputValues),
    inputs: clone(s.inputs),
  };
}
export function rectanglePointKeys(s) {
  return s.drawingMode === "threePoints"
    ? ["rectangleA", "rectangleB", "rectangleC"]
    : ["rectangleA", "rectangleB"];
}
export function setRectangleMode(s, mode) {
  if (
    s.command.id !== "C04" ||
    !["center", "twoCorners", "threePoints"].includes(mode)
  )
    throw new Error("未対応の長方形モードです");
  const p = operationForSession(s).parameters;
  validateDrawingPlane(p.plane);
  const { xAxis: x, yAxis: y } = p.plane;
  const a = p.anchor.map(
    (n, i) =>
      n -
      (p.anchorMode === "center"
        ? (p.widthMm * x[i] + p.heightMm * y[i]) / 2
        : 0),
  );
  s.parameters = p;
  s.drawingMode = mode;
  s.inputValues = {};
  if (mode === "center") {
    p.anchor = a.map((n, i) => n + (p.widthMm * x[i] + p.heightMm * y[i]) / 2);
    p.anchorMode = "center";
  } else {
    p.anchorMode = "corner";
    p.anchor = a;
    s.inputValues.rectangleA = a;
    s.inputValues.rectangleB = a.map(
      (n, i) =>
        n + p.widthMm * x[i] + (mode === "twoCorners" ? p.heightMm * y[i] : 0),
    );
    if (mode === "threePoints")
      s.inputValues.rectangleC = a.map((n, i) => n + p.heightMm * y[i]);
  }
  s.previewSequence++;
  s.result = null;
  s.state = "collecting";
}
