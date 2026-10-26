import { id, references } from "./document.js";

export const isSplit = (operation) =>
  ["solid.split", "surface.split"].includes(operation);

// Native slots encode source entity + exact asset hash. Legacy UUID slots have
// no source metadata; migrate only a unique exact match with one known target.
export function splitSlots(doc, feature, outputs) {
  const used = new Set();
  const keys = new Set();
  const sources = feature.inputs.targets || [];
  return outputs.map((output) => {
    if (
      output.slotKey !==
        `${feature.operation.id}/${output.sourceKey}/${output.geometryHash}` ||
      keys.has(output.slotKey)
    )
      throw new Error(
        "CAD_REFERENCE_AMBIGUOUS: Split出力の由来が不正または重複しています",
      );
    keys.add(output.slotKey);
    if (!sources.some((ref) => ref.entityId === output.sourceKey))
      throw new Error("CAD_REFERENCE_MISSING: Split出力の入力由来がありません");
    let slot = feature.outputSlots.find(
      (slot) =>
        slot.key === output.slotKey &&
        slot.sourceEntityId === output.sourceKey &&
        doc.entities.some(
          (e) =>
            e.id === slot.entityId &&
            e.geometry.assetHash === output.geometryHash,
        ),
    );
    if (!slot && sources.length === 1) {
      const legacy = feature.outputSlots.filter(
        (slot) =>
          !used.has(slot.entityId) &&
          !slot.sourceEntityId &&
          /^[0-9a-f-]{36}$/i.test(slot.key) &&
          doc.entities.some(
            (e) =>
              e.id === slot.entityId &&
              e.geometry.assetHash === output.geometryHash,
          ),
      );
      if (legacy.length === 1) slot = legacy[0];
    }
    if (slot && used.has(slot.entityId))
      throw new Error(
        "CAD_REFERENCE_AMBIGUOUS: Split出力の由来が重複しています",
      );
    slot = {
      key: output.slotKey,
      entityId: slot?.entityId || id(),
      bodyId: slot?.bodyId || id(),
      sourceEntityId: output.sourceKey,
    };
    used.add(slot.entityId);
    return slot;
  });
}

export function applySplitBodies(doc, feature) {
  const currentBodies = new Set(feature.outputSlots.map((slot) => slot.bodyId));
  for (const slot of feature.outputSlots) {
    const body = doc.bodies.find((body) => body.id === slot.bodyId);
    body.splitOrigin = { featureId: feature.id, entityId: slot.sourceEntityId };
    body.replacementBodyIds = [];
  }
  for (const body of doc.bodies) {
    if (
      body.splitOrigin?.featureId !== feature.id ||
      currentBodies.has(body.id)
    )
      continue;
    body.tipEntityId = null;
    body.status = "missing";
    body.replacementBodyIds = feature.outputSlots
      .filter(
        (slot) =>
          !body.splitOrigin.entityId ||
          slot.sourceEntityId === body.splitOrigin.entityId,
      )
      .map((slot) => slot.bodyId);
  }
  for (const dependent of doc.features)
    for (const ref of references(dependent.inputs))
      if (ref.unresolved && ref.splitOrigin?.featureId === feature.id)
        ref.candidateEntityIds = feature.outputSlots
          .filter(
            (slot) =>
              !ref.splitOrigin.entityId ||
              slot.sourceEntityId === ref.splitOrigin.entityId,
          )
          .map((slot) => slot.entityId);
  if (feature.resultPolicy !== "replace") return;
  for (const ref of feature.inputs.targets || []) {
    const input = doc.entities.find((entity) => entity.id === ref.entityId);
    const body = doc.bodies.find((body) => body.id === input?.bodyId);
    if (!body) continue;
    body.tipEntityId = null;
    body.splitIntoBodyIds = feature.outputSlots
      .filter((slot) => slot.sourceEntityId === ref.entityId)
      .map((slot) => slot.bodyId);
    body.status = body.splitIntoBodyIds.length ? "split" : "missing";
  }
}

export function restoreSplitInputs(doc, feature) {
  for (const slot of feature.outputSlots) {
    const body = doc.bodies.find((body) => body.id === slot.bodyId);
    if (body) {
      body.tipEntityId = null;
      body.status = "missing";
      body.replacementBodyIds = [];
    }
  }
  if (feature.resultPolicy !== "replace") return;
  for (const ref of feature.inputs.targets || []) {
    const input = doc.entities.find((entity) => entity.id === ref.entityId);
    const body = doc.bodies.find((body) => body.id === input?.bodyId);
    if (body) {
      const previous = [...doc.features]
        .reverse()
        .find(
          (other) =>
            other.id !== feature.id &&
            isSplit(other.operation.id) &&
            other.resultPolicy === "replace" &&
            other.status !== "suppressed" &&
            other.lastValid &&
            other.inputs.targets.some(
              (target) => target.entityId === ref.entityId,
            ),
        );
      body.splitIntoBodyIds = previous
        ? previous.outputSlots
            .filter((slot) => slot.sourceEntityId === ref.entityId)
            .map((slot) => slot.bodyId)
        : [];
      body.tipEntityId = previous ? null : input.id;
      body.status = previous
        ? body.splitIntoBodyIds.length
          ? "split"
          : "missing"
        : "ready";
    }
  }
}
