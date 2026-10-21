import { id } from "./document.js";
export function bindBody(doc, entity) {
  const found = doc.outputBindings.find(
    (b) => b.source.mode === "body-result" && b.source.bodyId === entity.bodyId,
  );
  if (found) return found;
  const binding = {
    id: id(),
    name: entity.name || "CAD shape",
    source: { mode: "body-result", bodyId: entity.bodyId },
    expectedKind: entity.kind === "curve" ? "curve" : "brep",
    resolvedEntityId: entity.id,
    resolvedResultHash: entity.resultHash,
    status: "ready",
    sampling: { toleranceMm: 0.02 },
  };
  doc.outputBindings.push(binding);
  doc.documentRevision++;
  return binding;
}
export function curveSamples(summary) {
  const remaining = (summary.preview?.curves || []).map((c) =>
    c.points.map((p) => [...p]),
  );
  if (!remaining.length) throw new Error("Curveに評価可能な区間がありません");
  const points = remaining.shift();
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  while (remaining.length) {
    const i = remaining.findIndex(
      (p) =>
        distance(points.at(-1), p[0]) < 1e-6 ||
        distance(points.at(-1), p.at(-1)) < 1e-6,
    );
    if (i < 0)
      throw new Error("複数の不連続なCurveは個別に生成へ渡してください");
    const p = remaining.splice(i, 1)[0];
    if (distance(points.at(-1), p[0]) >= 1e-6) p.reverse();
    points.push(...p.slice(1));
  }
  const closed = points.length > 2 && distance(points[0], points.at(-1)) < 1e-6;
  if (closed) points.pop();
  return { type: "polyline", closed, points };
}
export function generationInput(binding, entity, asset) {
  const base = {
    id: `cad-${binding.id}`,
    name: binding.name,
    group: "CAD",
    exposed: true,
    visible: true,
    cadBinding: {
      id: binding.id,
      status: binding.status,
      resultHash: binding.resolvedResultHash,
      assetHash: entity.geometry.assetHash,
      sampling: binding.sampling,
    },
  };
  if (entity.kind === "curve")
    return { ...base, type: "curve", curve: curveSamples(entity.displayCache) };
  if (!entity.displayCache.preview?.meshes.length)
    throw new Error("この型を生成へ渡すadapterは未実装です");
  return {
    ...base,
    type: "surface",
    filename: binding.name + ".brep",
    kernel: "Open CASCADE",
    brep: {
      format: "occt-brep",
      version: 1,
      data: asset.data,
      original: asset.data,
      history: [],
    },
    faces: entity.displayCache.faces,
    meshes: entity.displayCache.preview.meshes,
  };
}
