import { deriveVisibleEntities } from "./document.js";
import { replacementRefs } from "./difference.js";

export const centerOf = (entity) => entity.bbox.min.map(
  (value, axis) => (value + entity.bbox.max[axis]) / 2,
);

// This is a display replay. It never edits body tips, bindings or the document.
export function stageEntities(doc, featureId) {
  if (featureId == null) return deriveVisibleEntities(doc);
  const end = doc.features.findIndex((feature) => feature.id === featureId);
  if (end < 0) return deriveVisibleEntities(doc);
  const entities = new Map(doc.entities.map((entity) => [entity.id, entity]));
  const tips = new Map();
  for (const feature of doc.features.slice(0, end + 1)) {
    if (feature.status === "suppressed") continue;
    if (!feature.lastValid && !["valid", "warning", "empty"].includes(feature.status)) continue;
    if (feature.resultPolicy === "replace")
      for (const reference of replacementRefs(feature))
        tips.delete(entities.get(reference.entityId)?.bodyId);
    for (const slot of feature.outputSlots) {
      const entity = entities.get(slot.entityId);
      if (entity) tips.set(entity.bodyId, entity);
    }
  }
  return [...tips.values()].filter((entity) => entity.visibility !== "hidden");
}

function segmentIntersection(a, b, c, d) {
  const u = b.map((value, axis) => value - a[axis]);
  const v = d.map((value, axis) => value - c[axis]);
  const dot = (x, y) => x.reduce((sum, value, axis) => sum + value * y[axis], 0);
  const w = a.map((value, axis) => value - c[axis]);
  const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v);
  const dd = dot(u, w), ee = dot(v, w), denominator = aa * cc - bb * bb;
  if (Math.abs(denominator) < 1e-12) return null;
  const s = (bb * ee - cc * dd) / denominator;
  const t = (aa * ee - bb * dd) / denominator;
  if (s < 0 || s > 1 || t < 0 || t > 1) return null;
  const p = a.map((value, axis) => value + s * u[axis]);
  const q = c.map((value, axis) => value + t * v[axis]);
  return Math.hypot(...p.map((value, axis) => value - q[axis])) <= 1e-6 ? p : null;
}

export function snapCandidates(doc, { includeIntersections = true } = {}) {
  const result = [], segments = [];
  const add = (point, label, entityId) => {
    if (Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))
      result.push({ point: [...point], label, entityId });
  };
  for (const entity of deriveVisibleEntities(doc).filter((item) => !item.locked)) {
    add(centerOf(entity), "中心", entity.id);
    for (const point of entity.displayCache?.preview?.points || []) add(point.point, "端点", entity.id);
    for (const topology of entity.displayCache?.topology || [])
      if (topology.kind === "face") add(topology.fingerprint?.centroid, "面中心", entity.id);
    for (const curve of entity.displayCache?.preview?.curves || []) {
      const points = curve.points;
      if (!points?.length) continue;
      add(points[0], "端点", entity.id);
      add(points.at(-1), "端点", entity.id);
      const lengths = points.slice(1).map((point, index) => Math.hypot(...point.map((value, axis) => value - points[index][axis])));
      const half = lengths.reduce((a, b) => a + b, 0) / 2;
      let length = 0;
      for (let index = 0; index < lengths.length; index++) {
        if (length <= half && half <= length + lengths[index] && lengths[index] > 0) {
          const ratio = (half - length) / lengths[index];
          add(points[index].map((value, axis) => value + ratio * (points[index + 1][axis] - value)), "中点", entity.id);
        }
        length += lengths[index];
        segments.push({ a: points[index], b: points[index + 1], entityId: entity.id });
      }
    }
  }
  if (includeIntersections) {
    const sorted = segments.map((segment) => ({...segment,
      min: segment.a.map((value, axis) => Math.min(value, segment.b[axis])),
      max: segment.a.map((value, axis) => Math.max(value, segment.b[axis])),
    })).sort((a, b) => a.min[0] - b.min[0]);
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length && sorted[j].min[0] <= sorted[i].max[0] + 1e-6; j++) {
        if ([1, 2].some((axis) => sorted[j].min[axis] > sorted[i].max[axis] + 1e-6 || sorted[j].max[axis] < sorted[i].min[axis] - 1e-6)) continue;
        const point = segmentIntersection(sorted[i].a, sorted[i].b, sorted[j].a, sorted[j].b);
        if (point) add(point, "交点", null);
      }
  }
  return result;
}

export function boundsOverlap(a, b, tolerance = 1e-6) {
  return a.min.every((value, axis) =>
    Math.min(a.max[axis], b.max[axis]) >= Math.max(value, b.min[axis]) - tolerance);
}

export function thumbnailPath(entity) {
  const points = (entity.displayCache?.preview?.curves || []).flatMap((curve) => curve.points || []);
  if (!points.length) return "";
  const project = (point) => [point[0] - point[1] * 0.6, -point[2] - (point[0] + point[1]) * 0.35];
  const projected = points.map(project);
  const min = [0, 1].map((axis) => Math.min(...projected.map((point) => point[axis])));
  const max = [0, 1].map((axis) => Math.max(...projected.map((point) => point[axis])));
  const scale = 20 / Math.max(max[0] - min[0], max[1] - min[1], 1);
  return (entity.displayCache?.preview?.curves || []).map((curve) => curve.points.map((point, index) => {
    const p = project(point);
    return `${index ? "L" : "M"}${(4 + (p[0] - min[0]) * scale).toFixed(2)},${(3 + (p[1] - min[1]) * scale).toFixed(2)}`;
  }).join(" ")).join(" ");
}
