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
  return n * ({ cm: 10, m: 1000 }[unit] || 1);
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
    if (plane)
      p = plane.origin.map(
        (v, i) =>
          (relative ? 0 : v) + p[0] * plane.xAxis[i] + p[1] * plane.yAxis[i],
      );
    else p.push(0);
  }
  if (relative) {
    if (!previous) throw new Error("相対座標の起点を先に指定してください");
    p = p.map((v, i) => v + previous[i]);
  }
  return p;
}
