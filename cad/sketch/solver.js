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
function maps(s) {
  return {
    points: new Map(s.points.map((point) => [point.id, point])),
    lines: new Map(s.lines.map((line) => [line.id, line])),
    circles: new Map(s.circles.map((circle) => [circle.id, circle])),
  };
}

function expandedObjectIds(refs, geometry) {
  const ids = new Set();
  for (const ref of refs || []) {
    if (geometry.points.has(ref)) ids.add(ref);
    const line = geometry.lines.get(ref);
    if (line) {
      ids.add(line.start);
      ids.add(line.end);
    }
    const circle = geometry.circles.get(ref);
    if (circle) {
      ids.add(circle.center);
      ids.add(circle.id);
    }
  }
  return ids;
}

function variables(s) {
  const geometry = maps(s),
    fixed = new Set();
  for (const constraint of s.constraints.filter(
    (candidate) => candidate.kind === "fixed" && !candidate.suppressed,
  ))
    for (const objectId of expandedObjectIds(constraint.refs, geometry))
      fixed.add(objectId);
  const vars = [];
  for (const p of s.points)
    if (!fixed.has(p.id))
      for (const key of ["u", "v"])
        vars.push({ object: p, key, id: `${p.id}:${key}` });
  for (const c of s.circles)
    if (!fixed.has(c.id))
      vars.push({ object: c, key: "radiusMm", id: `${c.id}:radiusMm` });
  return vars;
}

function constraintScale(constraint) {
  if (["parallel", "perpendicular", "angle", "symmetry"].includes(constraint.kind))
    return 1;
  if (typeof constraint.value === "number")
    return Math.max(1, Math.abs(constraint.value));
  if (Array.isArray(constraint.value))
    return Math.max(1, Math.hypot(...constraint.value));
  return 1;
}

function residuals(s, { constraintIds = null, drag = null } = {}) {
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
    owners = [],
    scales = [];
  for (const c of s.constraints) {
    if (
      c.suppressed ||
      c.mode === "reference" ||
      c.kind === "fixed" ||
      (constraintIds && !constraintIds.has(c.id))
    )
      continue;
    const [a, b, axis] = c.refs;
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
      case "pointOnLine": {
        const l = line(b),
          p = point(a),
          d = p.map((value, index) => value - l.a[index]);
        r = [d[0] * l.unit[1] - d[1] * l.unit[0]];
        break;
      }
      case "symmetry": {
        const l = line(axis),
          first = point(a),
          second = point(b),
          middle = first.map((value, index) => (value + second[index]) / 2),
          fromAxis = middle.map((value, index) => value - l.a[index]),
          between = second.map((value, index) => value - first[index]);
        r = [
          fromAxis[0] * l.unit[1] - fromAxis[1] * l.unit[0],
          between[0] * l.unit[0] + between[1] * l.unit[1],
        ];
        break;
      }
      default:
        throw new Error("SKETCH_UNSUPPORTED_CONSTRAINT: " + c.kind);
    }
    out.push(...r);
    owners.push(...r.map(() => c.id));
    scales.push(...r.map(() => constraintScale(c)));
  }
  if (drag && (!constraintIds || constraintIds.has(`drag:${drag.pointId}`))) {
    const current = point(drag.pointId),
      weight = drag.mode === "soft" ? Math.max(1e-6, drag.weight ?? 0.2) : 1;
    out.push(current[0] - drag.target[0], current[1] - drag.target[1]);
    owners.push(`drag:${drag.pointId}`, `drag:${drag.pointId}`);
    scales.push(1 / weight, 1 / weight);
  }
  return { values: out, owners, scales };
}
function jacobian(s, vars, r) {
  return r.map(() => Array(vars.length).fill(0)).map((row, i) => row);
}
function differentiated(s, vars, r, options = {}) {
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
    if (
      c.suppressed ||
      c.mode === "reference" ||
      c.kind === "fixed" ||
      (options.constraintIds && !options.constraintIds.has(c.id))
    )
      continue;
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
      count = ["concentric", "symmetry"].includes(c.kind) ? 2 : 1;
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
      const a = residuals(s, options).values;
      object[key] = v - h;
      const b = residuals(s, options).values;
      object[key] = v;
      for (const i of fallback) j[i][k] = (a[i] - b[i]) / (2 * h);
    }
  if (options.drag && (!options.constraintIds || options.constraintIds.has(`drag:${options.drag.pointId}`))) {
    const at = j.length - 2;
    put(at, options.drag.pointId, "u", 1);
    put(at + 1, options.drag.pointId, "v", 1);
  }
  return j;
}

function constraintVariableIds(s, constraint, variableIds) {
  const geometry = maps(s),
    objectIds = expandedObjectIds(constraint.refs, geometry),
    ids = [];
  for (const objectId of objectIds)
    for (const suffix of ["u", "v", "radiusMm"]) {
      const id = `${objectId}:${suffix}`;
      if (variableIds.has(id)) ids.push(id);
    }
  return ids;
}

function solverComponents(s, vars, drag) {
  const variableIds = new Set(vars.map((variable) => variable.id)),
    adjacency = new Map(vars.map((variable) => [variable.id, new Set()])),
    owners = [];
  for (const constraint of s.constraints) {
    if (constraint.suppressed || constraint.mode === "reference" || constraint.kind === "fixed")
      continue;
    owners.push({
      id: constraint.id,
      variables: constraintVariableIds(s, constraint, variableIds),
    });
  }
  if (drag)
    owners.push({
      id: `drag:${drag.pointId}`,
      variables: ["u", "v"]
        .map((key) => `${drag.pointId}:${key}`)
        .filter((id) => variableIds.has(id)),
    });
  for (const owner of owners)
    for (const first of owner.variables)
      for (const second of owner.variables)
        if (first !== second) adjacency.get(first).add(second);
  const seen = new Set(),
    components = [];
  for (const variable of vars) {
    if (seen.has(variable.id)) continue;
    const queue = [variable.id],
      ids = new Set();
    while (queue.length) {
      const current = queue.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      ids.add(current);
      queue.push(...adjacency.get(current));
    }
    components.push({
      variables: vars.filter((candidate) => ids.has(candidate.id)),
      constraintIds: new Set(
        owners
          .filter((owner) => owner.variables.some((id) => ids.has(id)))
          .map((owner) => owner.id),
      ),
    });
  }
  for (const owner of owners.filter((candidate) => !candidate.variables.length))
    components.push({ variables: [], constraintIds: new Set([owner.id]) });
  return components;
}

function dimensionMeasurements(s) {
  const geometry = maps(s),
    point = (id) => geometry.points.get(id),
    lineLength = (id) => {
      const line = geometry.lines.get(id),
        a = point(line.start),
        b = point(line.end);
      return Math.hypot(b.u - a.u, b.v - a.v);
    },
    measured = [];
  for (const constraint of s.constraints) {
    const [a, b] = constraint.refs || [];
    let value = null,
      unit = "mm";
    if (constraint.kind === "length") value = lineLength(a);
    else if (constraint.kind === "distance") {
      const first = point(a),
        second = point(b);
      value = Math.hypot(second.u - first.u, second.v - first.v);
    } else if (constraint.kind === "distanceU") value = point(b).u - point(a).u;
    else if (constraint.kind === "distanceV") value = point(b).v - point(a).v;
    else if (constraint.kind === "radius") value = geometry.circles.get(a).radiusMm;
    else if (constraint.kind === "diameter") value = geometry.circles.get(a).radiusMm * 2;
    else if (constraint.kind === "angle") {
      const first = geometry.lines.get(a),
        second = geometry.lines.get(b),
        p1 = point(first.start),
        q1 = point(first.end),
        p2 = point(second.start),
        q2 = point(second.end),
        u = [q1.u - p1.u, q1.v - p1.v],
        v = [q2.u - p2.u, q2.v - p2.v];
      value = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
      unit = "rad";
    }
    if (Number.isFinite(value))
      measured.push({
        id: constraint.id,
        label: constraint.label || constraint.kind,
        kind: constraint.kind,
        mode: constraint.mode || "driving",
        value,
        unit,
      });
  }
  return measured;
}

function solveComponent(s, component, options, deadline) {
  const vars = component.variables,
    // Keep the public hard-constraint tolerance at solverLinearMm, but polish
    // accepted geometry below it so downstream exact B-rep measurements do not
    // amplify a just-inside-the-threshold dimensional residual.
    solveTolerance = options.toleranceMm * 0.01,
    residualOptions = {
      constraintIds: component.constraintIds,
      drag: options.drag || null,
    };
  let lambda = 1e-3,
    iteration = 0,
    r = residuals(s, residualOptions),
    converged = r.values.every(
      (value) => Math.abs(value) <= solveTolerance,
    );
  for (; !converged && iteration < options.iterations && performance.now() < deadline; iteration++) {
    if (!vars.length || !r.values.length) break;
    const jacobian = differentiated(s, vars, r.values, residualOptions),
      variableScales = vars.map((variable) => Math.max(1, Math.abs(variable.object[variable.key]))),
      a = jacobian.map((row, rowIndex) =>
        row.map((value, column) => (value * variableScales[column]) / r.scales[rowIndex]),
      ),
      b = r.values.map((value, index) => -value / r.scales[index]);
    for (let column = 0; column < vars.length; column++) {
      const damping = Array(vars.length).fill(0);
      damping[column] = Math.sqrt(lambda) * Math.max(1, Math.hypot(...a.map((row) => row[column])));
      a.push(damping);
      b.push(0);
    }
    const { x } = qrSolve(a, b),
      old = vars.map((variable) => variable.object[variable.key]);
    vars.forEach(
      (variable, index) =>
        (variable.object[variable.key] += x[index] * variableScales[index]),
    );
    const next = residuals(s, residualOptions),
      score = (result) =>
        result.values.reduce(
          (sum, value, index) => sum + (value / result.scales[index]) ** 2,
          0,
        );
    if (s.circles.some((circle) => circle.radiusMm <= 0) || score(next) >= score(r)) {
      vars.forEach((variable, index) => (variable.object[variable.key] = old[index]));
      lambda *= 10;
    } else {
      r = next;
      lambda /= 3;
    }
    converged = r.values.every(
      (value) => Math.abs(value) <= solveTolerance,
    );
  }
  const jacobian = differentiated(s, vars, r.values, residualOptions),
    scaledJacobian = jacobian.map((row, rowIndex) =>
      row.map(
        (value, column) =>
          (value * Math.max(1, Math.abs(vars[column].object[vars[column].key]))) /
          r.scales[rowIndex],
      ),
    ),
    rank =
      vars.length && r.values.length
        ? qrSolve(scaledJacobian, r.values.map(() => 0), 1e-7).rank
        : 0,
    maxResidual = Math.max(0, ...r.values.map(Math.abs)),
    status = converged
      ? vars.length > 0 && r.values.length > rank
        ? "redundant"
        : "solved"
      : "no-convergence";
  return {
    status,
    variableIds: vars.map((variable) => variable.id),
    constraintIds: [...component.constraintIds],
    degreesOfFreedom: Math.max(0, vars.length - rank),
    rank,
    iterations: iteration,
    maxResidual,
    conflictCandidates: [
      ...new Set(
        r.owners.filter((_, index) => Math.abs(r.values[index]) > options.toleranceMm),
      ),
    ],
  };
}
export function solveSketch(
  raw,
  {
    iterations = 200,
    timeBudgetMs = 1500,
    toleranceMm = 1e-6,
    drag = null,
  } = {},
) {
  validateSketch(raw);
  const s = structuredClone(raw),
    vars = variables(s),
    start = performance.now(),
    solveOptions = { iterations, toleranceMm, drag },
    deadline = start + timeBudgetMs,
    components = solverComponents(s, vars, drag).map((component) =>
      solveComponent(s, component, solveOptions, deadline),
    ),
    status = components.some((component) => component.status === "no-convergence")
      ? "no-convergence"
      : components.some((component) => component.status === "redundant")
        ? "redundant"
        : "solved",
    converged = status !== "no-convergence",
    conflicts = [...new Set(components.flatMap((component) => component.conflictCandidates))],
    degreesOfFreedom = components.reduce((sum, component) => sum + component.degreesOfFreedom, 0),
    rank = components.reduce((sum, component) => sum + component.rank, 0),
    maxResidual = Math.max(0, ...components.map((component) => component.maxResidual)),
    measurements = dimensionMeasurements(converged ? s : raw);
  return {
    status,
    sketch: converged ? s : structuredClone(raw),
    candidate: converged ? null : s,
    degreesOfFreedom,
    fullyConstrained: converged && degreesOfFreedom === 0,
    rank,
    iterations: components.reduce((sum, component) => sum + component.iterations, 0),
    elapsedMs: performance.now() - start,
    maxResidual,
    conflictCandidates: conflicts,
    components,
    measurements,
    diagnostics: [
      ...(raw.supportWarning ? [raw.supportWarning] : []),
      ...(status === "redundant"
        ? [{ code: "SKETCH_REDUNDANT", message: "重複する拘束があります。形状は使用できます。" }]
        : status === "no-convergence"
          ? [{
              code: "SKETCH_NO_CONVERGENCE",
              message: "拘束を満たす解に収束しませんでした。候補を確認してください。矛盾の証明ではありません。",
            }]
          : []),
      {
        code: "SKETCH_SOLVER_COMPONENTS",
        message: `${components.length}成分を分離し、変数・残差をスケーリングして解きました。`,
        componentCount: components.length,
        componentStatuses: components.map((component) => component.status),
      },
    ],
  };
}
