export function parseScalar(text, kind = "length", { defaultUnit = kind === "angle" ? "deg" : "mm" } = {}) {
  const implicitScale = { mm: 1, cm: 10, m: 1000, deg: Math.PI / 180, rad: 1 }[defaultUnit];
  if (implicitScale === undefined || (["deg", "rad"].includes(defaultUnit) ? "angle" : "length") !== kind)
    throw new Error("入力単位を確認してください");
  const source = String(text).trim(), tokens = [];
  if (!source || source.length > 256) throw new Error("数値と単位、四則式を入力してください");
  const pattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|(mm|cm|m|deg|rad)\b|([()+*/-]))/iy;
  for (let position = 0; position < source.length;) {
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) throw new Error("数値と単位、四則式を入力してください");
    tokens.push(match[1] ? { value: Number(match[1] + (match[2] || "")) }
      : match[3] ? { unit: match[3].toLowerCase() } : match[4]);
    position = pattern.lastIndex;
    if (tokens.length > 128) throw new Error("式が長すぎます");
  }
  let index = 0;
  const finite = (value) => {
    if (!Number.isFinite(value.n)) throw new Error("有限の数値が必要です");
    return value;
  };
  function atom(depth) {
    if (depth > 16) throw new Error("式の括弧が深すぎます");
    const token = tokens[index++];
    let value;
    if (token === "+" || token === "-") {
      value = atom(depth + 1);
      value.n *= token === "-" ? -1 : 1;
    } else if (token === "(") {
      value = expression(depth + 1);
      if (tokens[index++] !== ")") throw new Error("括弧を閉じてください");
    } else if (token && typeof token.value === "number") value = { n: token.value, dimension: null };
    else throw new Error("数値が必要です");
    if (tokens[index]?.unit) {
      if (value.dimension) throw new Error("単位を重ねて指定できません");
      const unit = tokens[index++].unit;
      value = { n: value.n * ({ cm: 10, m: 1000, deg: Math.PI / 180 }[unit] || 1),
        dimension: ["deg", "rad"].includes(unit) ? "angle" : "length" };
    }
    return finite(value);
  }
  function product(depth) {
    let a = atom(depth);
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++], b = atom(depth);
      if (operator === "/" && b.n === 0) throw new Error("0では割れません");
      if (operator === "*" ? a.dimension && b.dimension : b.dimension && a.dimension !== b.dimension)
        throw new Error("単位の組み合わせが不正です");
      a = finite({ n: operator === "*" ? a.n * b.n : a.n / b.n,
        dimension: operator === "*" ? a.dimension || b.dimension : b.dimension ? null : a.dimension });
    }
    return a;
  }
  function expression(depth) {
    let a = product(depth);
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++], b = product(depth);
      if (a.dimension && b.dimension && a.dimension !== b.dimension)
        throw new Error("長さと角度は混ぜられません");
      if (a.dimension && !b.dimension) b.n *= implicitScale;
      if (b.dimension && !a.dimension) a.n *= implicitScale;
      a = finite({ n: a.n + (operator === "+" ? b.n : -b.n), dimension: a.dimension || b.dimension });
    }
    return a;
  }
  const value = expression(0);
  if (index !== tokens.length) throw new Error("式を確認してください");
  if (value.dimension && value.dimension !== kind) throw new Error(kind === "angle" ? "角度単位が必要です" : "長さ単位が必要です");
  return finite({ n: value.n * (!value.dimension ? implicitScale : 1) }).n;
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
