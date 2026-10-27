export function parseScalar(text, kind = "length") {
  const match = String(text)
    .trim()
    .match(
      /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|m|deg|rad)?$/i,
    );
  if (!match)
    throw new Error("数値と単位（mm/cm/m、deg/rad）を入力してください");
  const n = Number(match[1]),
    unit = (match[2] || "").toLowerCase();
  if (!Number.isFinite(n)) throw new Error("有限の数値が必要です");
  if (kind === "angle") {
    if (unit && !["deg", "rad"].includes(unit))
      throw new Error("角度単位が必要です");
    return n * (unit === "rad" ? 1 : Math.PI / 180);
  }
  if (["deg", "rad"].includes(unit)) throw new Error("長さ単位が必要です");
  const value = n * ({ cm: 10, m: 1000 }[unit] || 1);
  if (!Number.isFinite(value)) throw new Error("有限の長さが必要です");
  return value;
}
// Coordinate mapping needs the same orthonormal frame that the native kernel
// accepts. Offset-specific plane membership remains owned by native validation.
export function validateDrawingPlane(plane) {
  const vectors = [plane?.origin, plane?.xAxis, plane?.yAxis];
  if (
    vectors.some(
      (v) => !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite),
    )
  )
    throw new Error("作業平面には有限の原点・X軸・Y軸が必要です");
  const [, x, y] = vectors;
  if (
    Math.abs(x.reduce((n, v) => n + v * v, 0) - 1) > 1e-6 ||
    Math.abs(y.reduce((n, v) => n + v * v, 0) - 1) > 1e-6 ||
    Math.abs(x.reduce((n, v, i) => n + v * y[i], 0)) > 1e-6
  )
    throw new Error("作業平面の軸は直交する単位ベクトルが必要です");
  return plane;
}
export function inDrawingPlane(point, plane, origin = plane.origin) {
  validateDrawingPlane(plane);
  const x = plane.xAxis,
    y = plane.yAxis;
  const normal = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  return (
    Math.abs(point.reduce((n, v, i) => n + (v - origin[i]) * normal[i], 0)) <=
    1e-6
  );
}
export function parseCoordinate(text, { previous = null, plane = null } = {}) {
  text = String(text).trim();
  const relative = text.startsWith("@");
  if (relative) text = text.slice(1);
  const parts = text.split(",");
  if (parts.length < 2 || parts.length > 3)
    throw new Error("x,y または x,y,z を入力してください");
  let p = parts.map((v) => parseScalar(v));
  if (p.length === 2) {
    if (plane) {
      validateDrawingPlane(plane);
      p = plane.origin.map(
        (v, i) =>
          (relative ? 0 : v) + p[0] * plane.xAxis[i] + p[1] * plane.yAxis[i],
      );
    } else p.push(0);
  }
  if (relative) {
    if (!previous) throw new Error("相対座標の起点を先に指定してください");
    p = p.map((v, i) => v + previous[i]);
  }
  if (!p.every(Number.isFinite)) throw new Error("有限の座標が必要です");
  return p;
}
