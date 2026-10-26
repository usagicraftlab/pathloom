import { references, topologicalFeatures } from "./document.js";

// Difference alone supports ordered whole-solid targets and tools. Reject other
// modes before transport rather than silently treating their settings as hints.
export function validateDifference(command, parameters, inputs) {
  if (command.baseOperation.id !== "solid.difference") return;
  if (
    command.mode !== "default" ||
    command.adapter !== "direct.v1" ||
    Object.keys(parameters).some((key) => key !== "keepTools") ||
    Object.keys(inputs).some((key) => !["arguments", "tools"].includes(key))
  )
    throw new Error(
      "Differenceの未対応モードです。対象／工具と工具保持だけを指定してください。",
    );
  if (
    parameters.keepTools !== undefined &&
    typeof parameters.keepTools !== "boolean"
  )
    throw new Error("工具保持はtrue/falseで指定してください。");
  for (const [role, refs] of Object.entries(inputs))
    if (
      !Array.isArray(refs) ||
      refs.some(
        (ref) => !ref?.entityId || ref.kind || (ref.role && ref.role !== role),
      ) ||
      new Set(refs.map((ref) => ref.entityId)).size !== refs.length
    )
      throw new Error(
        "Differenceは対象／工具それぞれに重複のない立体を選択してください。",
      );
}

export function validateDifferenceTargets(doc, inputs) {
  const bodyIds = new Set();
  for (const ref of inputs.arguments || []) {
    const entity = doc.entities.find((e) => e.id === ref.entityId);
    if (entity && bodyIds.has(entity.bodyId))
      throw new Error(
        "Differenceでは同じbodyの履歴形状を複数対象にできません。対象を選び直してください。",
      );
    if (entity) bodyIds.add(entity.bodyId);
  }
}

// Native replies are ordered one-per-target, even for empty/compound results.
// Persist target identity rather than an array index, so explicit reordering
// cannot swap the existing entities' meaning. Keep the legacy single result key.
export function differenceOutputs(outputs, inputs) {
  const targets = inputs.arguments || [];
  if (outputs.length !== targets.length)
    throw new Error("Differenceの対象数と結果数が一致しません。");
  return targets.map((target, index) => {
    const key = targets.length === 1 ? "result" : `argument/${index}`;
    const output = outputs.find((o) => o.slotKey === key);
    if (!output)
      throw new Error("Differenceの対象に対応する結果がありません。");
    return {
      ...output,
      slotKey: targets.length === 1 ? "result" : `argument/${target.entityId}`,
      differenceTargetId: target.entityId,
    };
  });
}

export function replacementRefs(feature) {
  if (
    feature.operation.id === "solid.difference" &&
    feature.parameters.keepTools === true
  )
    return feature.inputs.arguments || [];
  return references(feature.inputs);
}

// Rebuild only Difference tool bodies. This also restores a tool when keepTools
// is turned on after a previous cut, without reviving a tool consumed by another
// feature. Other bodies and Split/binding policies remain owned by the Store.
export function reconcileDifferenceTools(doc, extraRefs = []) {
  const entities = new Map(doc.entities.map((e) => [e.id, e]));
  const refs = doc.features
    .filter((f) => f.operation.id === "solid.difference")
    .flatMap((f) => f.inputs.tools || [])
    .concat(extraRefs);
  const states = new Map(
    refs.map((r) => [
      entities.get(r.entityId)?.bodyId,
      { tipEntityId: null, status: "missing", splitIntoBodyIds: [] },
    ]),
  );
  states.delete(undefined);
  if (!states.size) return;
  for (const f of topologicalFeatures(doc)) {
    if (
      f.status === "suppressed" ||
      (!f.lastValid && !["valid", "warning", "empty"].includes(f.status))
    )
      continue;
    for (const slot of f.outputSlots)
      if (states.has(slot.bodyId) && entities.has(slot.entityId))
        states.set(slot.bodyId, {
          tipEntityId: slot.entityId,
          status: "ready",
          splitIntoBodyIds: [],
        });
    if (f.resultPolicy !== "replace") continue;
    const policy =
      f.operation.id === "solid.difference" &&
      f.lastValid?.differenceKeepTools !== undefined
        ? { ...f, parameters: { keepTools: f.lastValid.differenceKeepTools } }
        : f;
    for (const ref of replacementRefs(policy)) {
      const bodyId = entities.get(ref.entityId)?.bodyId;
      if (
        !ref.kind &&
        states.has(bodyId) &&
        !f.outputSlots.some((s) => s.bodyId === bodyId)
      )
        states.set(bodyId, {
          tipEntityId: null,
          status:
            f.operation.id !== "solid.difference" && f.outputSlots.length > 1
              ? "split"
              : "ready",
          splitIntoBodyIds:
            f.operation.id !== "solid.difference" && f.outputSlots.length > 1
              ? f.outputSlots.map((s) => s.bodyId)
              : [],
        });
    }
  }
  for (const body of doc.bodies)
    if (states.has(body.id)) Object.assign(body, states.get(body.id));
}
