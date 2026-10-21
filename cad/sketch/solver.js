import { validateSketch } from "./model.js";
// Householder QR with column pivoting. No normal-equation matrix inversion.
export function qrSolve(matrix, rhs, tolerance = 1e-10) {
  const a = matrix.map((r) => [...r]),
    b = [...rhs],
    m = a.length,
    n = a[0]?.length || 0,
    order = Array.from({ length: n }, (_, i) => i);
  let rank = 0;
  for (let k = 0; k < Math.min(m, n); k++) {
    let best = k,
      largest = -1;
    for (let j = k; j < n; j++) {
      let norm = 0;
      for (let i = k; i < m; i++) norm += a[i][j] ** 2;
      if (norm > largest) {
        largest = norm;
        best = j;
      }
    }
    if (Math.sqrt(largest) < tolerance) break;
    if (best !== k) {
      for (let i = 0; i < m; i++) [a[i][k], a[i][best]] = [a[i][best], a[i][k]];
      [order[k], order[best]] = [order[best], order[k]];
    }
    const norm = Math.sqrt(largest),
      alpha = a[k][k] >= 0 ? -norm : norm,
      v = Array.from({ length: m - k }, (_, i) => a[k + i][k]);
    v[0] -= alpha;
    const vv = v.reduce((s, x) => s + x * x, 0);
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += v[i] * a[k + i][j];
      for (let i = 0; i < v.length; i++) a[k + i][j] -= (2 * v[i] * dot) / vv;
    }
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += v[i] * b[k + i];
    for (let i = 0; i < v.length; i++) b[k + i] -= (2 * v[i] * dot) / vv;
    rank++;
  }
  const perm = Array(n).fill(0);
  for (let i = rank - 1; i >= 0; i--) {
    let v = b[i];
    for (let j = i + 1; j < rank; j++) v -= a[i][j] * perm[j];
    perm[i] = v / a[i][i];
  }
  const x = Array(n).fill(0);
  order.forEach((j, i) => (x[j] = perm[i]));
  return { x, rank };
}
function variables(s) {
  const fixed = new Set(
    s.constraints
      .filter((c) => c.kind === "fixed" && !c.suppressed)
      .flatMap((c) => c.refs),
  );
  const vars = [];
  for (const p of s.points)
    if (!fixed.has(p.id))
      for (const key of ["u", "v"]) vars.push({ object: p, key });
  for (const c of s.circles)
    if (!fixed.has(c.id)) vars.push({ object: c, key: "radiusMm" });
  return vars;
}
function residuals(s) {
  const pts = new Map(s.points.map((p) => [p.id, [p.u, p.v]])),
    lines = new Map(s.lines.map((l) => [l.id, l])),
    circles = new Map(s.circles.map((c) => [c.id, c]));
  const point = (id) => {
      if (!pts.has(id)) throw new Error("Unknown sketch point " + id);
      return pts.get(id);
    },
    line = (id) => {
      const l = lines.get(id);
      if (!l) throw new Error("Unknown sketch line " + id);
      const a = point(l.start),
        b = point(l.end),
        d = b.map((v, i) => v - a[i]),
        n = Math.hypot(...d);
      if (n < 1e-12) throw new Error("SKETCH_DEGENERATE: 零長線があります");
      return { a, b, d, n, unit: d.map((v) => v / n) };
    },
    circle = (id) => {
      const c = circles.get(id);
      if (!c) throw new Error("Unknown sketch circle " + id);
      return { ...c, p: point(c.center) };
    };
  const out = [],
    owners = [];
  for (const c of s.constraints) {
    if (c.suppressed || c.mode === "reference" || c.kind === "fixed") continue;
    const [a, b] = c.refs;
    let r;
    switch (c.kind) {
      case "coincident":
        r = point(a).map((v, i) => v - point(b)[i]);
        break;
      case "horizontal":
        r = [line(a).d[1]];
        break;
      case "vertical":
        r = [line(a).d[0]];
        break;
      case "length":
        r = [line(a).n - c.value];
        break;
      case "distance":
        r = [Math.hypot(...point(a).map((v, i) => v - point(b)[i])) - c.value];
        break;
      case "distanceU":
      case "distanceV": {
        const i = c.kind === "distanceU" ? 0 : 1;
        r = [point(b)[i] - point(a)[i] - c.value];
        break;
      }
      case "radius":
        r = [circle(a).radiusMm - c.value];
        break;
      case "diameter":
        r = [2 * circle(a).radiusMm - c.value];
        break;
      case "equalLength":
        r = [line(a).n - line(b).n];
        break;
      case "equalRadius":
        r = [circle(a).radiusMm - circle(b).radiusMm];
        break;
      case "concentric":
        r = circle(a).p.map((v, i) => v - circle(b).p[i]);
        break;
      case "parallel":
      case "perpendicular":
      case "angle": {
        const u = line(a).unit,
          v = line(b).unit;
        const dot = u[0] * v[0] + u[1] * v[1],
          cross = u[0] * v[1] - u[1] * v[0];
        r = [
          c.kind === "parallel"
            ? cross
            : c.kind === "perpendicular"
              ? dot
              : Math.atan2(
                  Math.sin(Math.atan2(cross, dot) - c.value),
                  Math.cos(Math.atan2(cross, dot) - c.value),
                ),
        ];
        break;
      }
      case "center":
        r = point(a).map((v, i) => (v + point(b)[i]) / 2 - c.value[i]);
        break;
      case "lineCircleTangent": {
        const l = line(a),
          cc = circle(b),
          d = cc.p.map((v, i) => v - l.a[i]);
        r = [
          d[0] * l.unit[1] - d[1] * l.unit[0] - (c.side || -1) * cc.radiusMm,
        ];
        break;
      }
      default:
        throw new Error("SKETCH_UNSUPPORTED_CONSTRAINT: " + c.kind);
    }
    out.push(...r);
    owners.push(...r.map(() => c.id));
  }
  return { values: out, owners };
}
function jacobian(s, vars, r) {
  return r.map(() => Array(vars.length).fill(0)).map((row, i) => row);
}
function differentiated(s, vars, r) {
  const j = jacobian(s, vars, r),
    index = new Map(vars.map((v, i) => [`${v.object.id}:${v.key}`, i])),
    points = new Map(s.points.map((p) => [p.id, p])),
    lines = new Map(s.lines.map((l) => [l.id, l]));
  let row = 0;
  const fallback = [];
  const put = (at, id, key, value) => {
    const column = index.get(`${id}:${key}`);
    if (column !== undefined) j[at][column] += value;
  };
  const length = (at, lineId, factor = 1) => {
    const l = lines.get(lineId),
      a = points.get(l.start),
      b = points.get(l.end),
      du = b.u - a.u,
      dv = b.v - a.v,
      n = Math.hypot(du, dv);
    for (const [key, d] of [
      ["u", du],
      ["v", dv],
    ]) {
      put(at, b.id, key, (factor * d) / n);
      put(at, a.id, key, (-factor * d) / n);
    }
  };
  for (const c of s.constraints) {
    if (c.suppressed || c.mode === "reference" || c.kind === "fixed") continue;
    const [a, b] = c.refs;
    let count = 1;
    if (c.kind === "horizontal" || c.kind === "vertical") {
      const l = lines.get(a),
        key = c.kind === "horizontal" ? "v" : "u";
      put(row, l.end, key, 1);
      put(row, l.start, key, -1);
    } else if (c.kind === "coincident" || c.kind === "center") {
      count = 2;
      for (const [i, key] of ["u", "v"].entries()) {
        put(row + i, a, key, c.kind === "center" ? 0.5 : 1);
        put(row + i, b, key, c.kind === "center" ? 0.5 : -1);
      }
    } else if (c.kind === "distanceU" || c.kind === "distanceV") {
      const key = c.kind === "distanceU" ? "u" : "v";
      put(row, b, key, 1);
      put(row, a, key, -1);
    } else if (c.kind === "radius" || c.kind === "diameter")
      put(row, a, "radiusMm", c.kind === "radius" ? 1 : 2);
    else if (c.kind === "length") length(row, a);
    else if (c.kind === "equalLength") {
      length(row, a);
      length(row, b, -1);
    } else if (c.kind === "equalRadius") {
      put(row, a, "radiusMm", 1);
      put(row, b, "radiusMm", -1);
    } else if (c.kind === "distance") {
      const p = points.get(a),
        q = points.get(b),
        n = Math.hypot(p.u - q.u, p.v - q.v);
      if (n > 1e-12)
        for (const key of ["u", "v"]) {
          put(row, a, key, (p[key] - q[key]) / n);
          put(row, b, key, (q[key] - p[key]) / n);
        }
      else fallback.push(row);
    } else {
      count = c.kind === "concentric" ? 2 : 1;
      for (let i = 0; i < count; i++) fallback.push(row + i);
    }
    row += count;
  }
  if (fallback.length)
    for (let k = 0; k < vars.length; k++) {
      const { object, key } = vars[k],
        v = object[key],
        h = Math.max(1e-8, Math.abs(v) * 1e-6);
      object[key] = v + h;
      const a = residuals(s).values;
      object[key] = v - h;
      const b = residuals(s).values;
      object[key] = v;
      for (const i of fallback) j[i][k] = (a[i] - b[i]) / (2 * h);
    }
  return j;
}
export function solveSketch(
  raw,
  { iterations = 200, timeBudgetMs = 1500, toleranceMm = 1e-6 } = {},
) {
  validateSketch(raw);
  const s = structuredClone(raw),
    vars = variables(s),
    start = performance.now();
  let lambda = 1e-3,
    iteration = 0,
    converged = false,
    r = residuals(s).values;
  for (
    ;
    iteration < iterations && performance.now() - start < timeBudgetMs;
    iteration++
  ) {
    if (r.every((v) => Math.abs(v) <= toleranceMm)) {
      converged = true;
      break;
    }
    if (!vars.length) break;
    const j = differentiated(s, vars, r),
      a = j.map((row) => [...row]),
      b = r.map((v) => -v);
    for (let k = 0; k < vars.length; k++) {
      const row = Array(vars.length).fill(0);
      row[k] =
        Math.sqrt(lambda) * Math.max(1, Math.hypot(...j.map((row) => row[k])));
      a.push(row);
      b.push(0);
    }
    const { x } = qrSolve(a, b);
    const old = vars.map((v) => v.object[v.key]);
    vars.forEach((v, k) => (v.object[v.key] += x[k]));
    const next = residuals(s).values;
    if (
      s.circles.some((c) => c.radiusMm <= 0) ||
      next.reduce((n, v) => n + v * v, 0) >= r.reduce((n, v) => n + v * v, 0)
    ) {
      vars.forEach((v, k) => (v.object[v.key] = old[k]));
      lambda *= 10;
    } else {
      r = next;
      lambda /= 3;
    }
  }
  if (r.every((v) => Math.abs(v) <= toleranceMm)) converged = true;
  const j = differentiated(s, vars, r),
    rank =
      vars.length && r.length
        ? qrSolve(
            j,
            r.map(() => 0),
            1e-7,
          ).rank
        : 0,
    conflicts = residuals(s).owners.filter(
      (_, i) => Math.abs(r[i]) > toleranceMm,
    );
  const status = converged
    ? r.length > rank
      ? "redundant"
      : "solved"
    : "no-convergence";
  return {
    status,
    sketch: converged ? s : structuredClone(raw),
    candidate: converged ? null : s,
    degreesOfFreedom: vars.length - rank,
    rank,
    iterations: iteration,
    elapsedMs: performance.now() - start,
    maxResidual: Math.max(0, ...r.map(Math.abs)),
    conflictCandidates: [...new Set(conflicts)],
    diagnostics: converged
      ? status === "redundant"
        ? [
            {
              code: "SKETCH_REDUNDANT",
              message: "重複する拘束があります。形状は使用できます。",
            },
          ]
        : []
      : [
          {
            code: "SKETCH_NO_CONVERGENCE",
            message:
              "拘束を満たす解に収束しませんでした。候補を確認してください。矛盾の証明ではありません。",
          },
        ],
  };
}
