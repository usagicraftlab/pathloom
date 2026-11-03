import { clone, id, WORLD_XY } from "../document.js";

const finitePlane = (plane) =>
  plane &&
  [plane.origin, plane.xAxis, plane.yAxis].every(
    (axis) => Array.isArray(axis) && axis.length === 3 && axis.every(Number.isFinite),
  );

export function createSketch({ plane = WORLD_XY, support = null } = {}) {
  return {
    id: id(),
    plane: clone(plane),
    localOrigin: { u: 0, v: 0 },
    support: support ? clone(support) : null,
    supportStatus: support ? "linked" : "datum",
    supportWarning: null,
    points: [],
    lines: [],
    circles: [],
    constraints: [],
    dimensions: [],
    lastValid: null,
  };
}

// A copied sketch is a new model, not another view of the source sketch. Every
// element and constraint identity is remapped so edits, diagnostics and future
// references can never leak between the two sketches.
export function copySketchToSupport(sketch, { plane = sketch.plane, support = null } = {}) {
  validateSketch(sketch);
  if (!finitePlane(plane)) throw new Error("Invalid sketch copy plane");
  const next = clone(sketch),
    identities = new Map();
  for (const item of [
    ...next.points,
    ...next.lines,
    ...next.circles,
    ...next.constraints,
    ...(next.dimensions || []),
  ])
    if (item?.id) identities.set(item.id, id());
  const remap = (value) => {
    if (typeof value === "string") return identities.get(value) || value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
    return value;
  };
  const copied = remap(next);
  copied.id = id();
  copied.plane = clone(plane);
  copied.support = support ? clone(support) : null;
  copied.supportStatus = support ? "linked" : "datum";
  copied.supportWarning = null;
  copied.lastValid = null;
  delete copied.solveReport;
  delete copied.draft;
  return validateSketch(copied);
}
export function validateSketch(s) {
  if (
    !s ||
    !Array.isArray(s.points) ||
    !Array.isArray(s.constraints) ||
    !Array.isArray(s.lines) ||
    !Array.isArray(s.circles)
  )
    throw new Error("Invalid sketch");
  // v1 fixtures and projects may predate explicit local-frame persistence.
  if (s.plane != null && !finitePlane(s.plane))
    throw new Error("Invalid sketch plane");
  if (
    s.localOrigin &&
    ![s.localOrigin.u, s.localOrigin.v].every(Number.isFinite)
  )
    throw new Error("Invalid sketch local origin");
  const ids = new Set();
  for (const e of [...s.points, ...s.lines, ...s.circles, ...s.constraints]) {
    if (!e.id || ids.has(e.id)) throw new Error("Duplicate sketch ID");
    ids.add(e.id);
  }
  for (const p of s.points)
    if (![p.u, p.v].every(Number.isFinite))
      throw new Error("Invalid sketch point");
  const pointIds = new Set(s.points.map((p) => p.id));
  for (const l of s.lines)
    if (!pointIds.has(l.start) || !pointIds.has(l.end))
      throw new Error("Missing sketch line point");
  for (const c of s.circles)
    if (
      !pointIds.has(c.center) ||
      !Number.isFinite(c.radiusMm) ||
      c.radiusMm <= 0
    )
      throw new Error("Invalid sketch circle");
  return s;
}

// A sketch remains one history item. Moving its support changes only the local
// frame; the element/constraint arrays have no internal chronological history.
export function updateSketchSupport(sketch, nextPlane) {
  validateSketch(sketch);
  const next = clone(sketch);
  if (nextPlane == null) {
    next.supportStatus = "orphaned";
    next.supportWarning = {
      code: "SKETCH_SUPPORT_MISSING",
      message: "基準面が見つからないため、スケッチを現在位置に保持しています。",
    };
    return next;
  }
  if (!finitePlane(nextPlane)) throw new Error("Invalid sketch support plane");
  next.plane = clone(nextPlane);
  next.supportStatus = next.support ? "linked" : "datum";
  next.supportWarning = null;
  return next;
}

export function sketchPointWorld(sketch, point) {
  const { origin, xAxis, yAxis } = sketch.plane;
  return origin.map(
    (value, index) =>
      value + point.u * xAxis[index] + point.v * yAxis[index],
  );
}
export function constrainedRectangle({
  widthMm = 60,
  heightMm = 40,
  center = [0, 0],
  plane = WORLD_XY,
  support = null,
} = {}) {
  const s = createSketch({ plane, support });
  const [u, v] = center,
    w = widthMm / 2,
    h = heightMm / 2;
  const names = ["a", "b", "c", "d"];
  s.points = [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([x, y], i) => ({ id: id(), u: u + x, v: v + y }));
  s.lines = s.points.map((p, i) => ({
    id: id(),
    start: p.id,
    end: s.points[(i + 1) % 4].id,
  }));
  const constraints = s.lines.map((line, i) => ({
    id: id(),
    kind: i % 2 ? "vertical" : "horizontal",
    refs: [line.id],
  }));
  constraints.push(
    {
      id: id(),
      kind: "distanceU",
      refs: [s.points[0].id, s.points[1].id],
      value: widthMm,
      label: "幅",
      mode: "driving",
    },
    {
      id: id(),
      kind: "distanceV",
      refs: [s.points[1].id, s.points[2].id],
      value: heightMm,
      label: "高さ",
      mode: "driving",
    },
    {
      id: id(),
      kind: "center",
      refs: [s.points[0].id, s.points[2].id],
      value: center,
      label: "中心",
    },
  );
  s.constraints = constraints;
  return s;
}
export function sketchCurveParameters(sketch) {
  return {
    points: sketch.points.map((point) => sketchPointWorld(sketch, point)),
    closed: true,
  };
}
