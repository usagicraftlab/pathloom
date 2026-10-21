import { clone, id, WORLD_XY } from "../document.js";
export function createSketch() {
  return {
    id: id(),
    plane: clone(WORLD_XY),
    points: [],
    lines: [],
    circles: [],
    constraints: [],
    dimensions: [],
    lastValid: null,
  };
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
export function constrainedRectangle({
  widthMm = 60,
  heightMm = 40,
  center = [0, 0],
  plane = WORLD_XY,
} = {}) {
  const s = createSketch();
  s.plane = clone(plane);
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
  const { origin, xAxis, yAxis } = sketch.plane;
  return {
    points: sketch.points.map((p) =>
      origin.map((v, i) => v + p.u * xAxis[i] + p.v * yAxis[i]),
    ),
    closed: true,
  };
}
