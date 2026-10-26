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

// Body visibility is derived from the ordered history, including cached results.
// Replaying it also restores tools/inputs when a replacement is changed or removed.
export function rebuildBodyResults(doc) {
  const entities = new Map(doc.entities.map((e) => [e.id, e]));
  const bodies = new Map(doc.bodies.map((b) => [b.id, b]));
  for (const body of bodies.values()) {
    body.tipEntityId = null;
    body.status = "missing";
    body.splitIntoBodyIds = [];
  }
  for (const f of topologicalFeatures(doc)) {
    if (f.status === "suppressed") continue;
    const outputs = f.outputSlots.filter((s) => entities.has(s.entityId));
    if (!outputs.length && f.status !== "empty") continue;
    for (const slot of outputs) {
      let body = bodies.get(slot.bodyId);
      if (!body) {
        body = { id: slot.bodyId, name: f.name, splitIntoBodyIds: [] };
        bodies.set(body.id, body);
        doc.bodies.push(body);
      }
      body.tipEntityId = slot.entityId;
      body.status = "ready";
      body.splitIntoBodyIds = [];
    }
    if (f.resultPolicy !== "replace") continue;
    for (const [key, refs] of Object.entries(f.inputs)) {
      if (
        (f.operation.id === "solid.difference" &&
          key === "tools" &&
          f.parameters.keepTools) ||
        (["solid.split", "surface.split"].includes(f.operation.id) &&
          key === "cutters")
      )
        continue;
      for (const ref of refs) {
        if (ref.kind) continue;
        const input = entities.get(ref.entityId),
          body = bodies.get(input?.bodyId);
        if (!body || outputs.some((s) => s.bodyId === body.id)) continue;
        body.tipEntityId = null;
        const parts = outputs.filter((s) => s.sourceEntityId === ref.entityId);
        const candidates = parts.length
          ? parts
          : outputs.filter((s) => !s.sourceEntityId);
        body.status = candidates.length > 1 ? "split" : "missing";
        body.splitIntoBodyIds =
          candidates.length > 1 ? candidates.map((s) => s.bodyId) : [];
      }
    }
  }
}
