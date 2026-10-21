import { references, topologicalFeatures } from "./document.js";
export function planRecompute(doc, changedIds) {
  const dirty = new Set(changedIds),
    owners = new Map(
      doc.features.flatMap((f) => f.outputSlots.map((s) => [s.entityId, f.id])),
    );
  for (const f of topologicalFeatures(doc))
    if (references(f.inputs).some((r) => dirty.has(owners.get(r.entityId))))
      dirty.add(f.id);
  return topologicalFeatures(doc).filter((f) => dirty.has(f.id));
}
export function markDirty(doc, ids) {
  for (const f of planRecompute(doc, ids)) {
    if (f.status !== "suppressed") f.status = "dirty";
    f.requestedHash = null;
  }
}
export function applyFeatureEdit(doc, id, parameters) {
  const f = doc.features.find((f) => f.id === id);
  if (!f) throw new Error("Feature missing");
  f.parameters = structuredClone(parameters);
  f.featureRevision++;
  markDirty(doc, [id]);
  doc.documentRevision++;
  return f;
}
export function suppressFeature(doc, id, suppressed = true) {
  const f = doc.features.find((f) => f.id === id);
  if (!f) throw new Error("Feature missing");
  f.featureRevision++;
  markDirty(doc, [id]);
  f.status = suppressed ? "suppressed" : "dirty";
  doc.documentRevision++;
}
export function reselectReference(doc, id, inputKey, refs) {
  const f = doc.features.find((f) => f.id === id);
  if (!f) throw new Error("Feature missing");
  f.inputs[inputKey] = structuredClone(refs);
  f.featureRevision++;
  markDirty(doc, [id]);
  doc.documentRevision++;
}
