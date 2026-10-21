import { clone, id } from "../document.js";
import { adaptCommand } from "./registry.js";
export function createCommandSession(
  command,
  { selection = [], parameters = null, featureId = null } = {},
) {
  const initial = clone(parameters || command.defaults),
    used = new Set(),
    inputs = {};
  for (const slot of command.inputs.filter((slot) =>
    ["entity", "subshape"].includes(slot.kind),
  )) {
    const eligible = selection.filter((r) =>
      slot.kind === "subshape"
        ? r.kind && slot.allowedEntityKinds.includes(r.kind)
        : (!r.kind || slot.key === "body") &&
          slot.allowedEntityKinds.includes(r.entityKind) &&
          !used.has(r.entityId),
    );
    const picked = eligible.slice(0, slot.maxCount ?? undefined);
    inputs[slot.key] = picked.map(({ entityKind, ...ref }) =>
      slot.kind === "subshape"
        ? ref
        : { entityId: ref.entityId, role: slot.key },
    );
    if (slot.kind === "entity") picked.forEach((r) => used.add(r.entityId));
  }
  return {
    id: id(),
    command: clone(command),
    state: "collecting",
    parameters: initial,
    inputValues: {},
    inputs,
    featureId,
    toleranceOverrides: {},
    previewSequence: 0,
    diagnostics: [],
    rawDraft: {},
    result: null,
  };
}
export function sessionReady(s) {
  return s.command.inputs.every((slot) => {
    if (slot.kind === "point")
      return !!slot.default || Array.isArray(s.inputValues?.[slot.key]);
    if (!["entity", "subshape"].includes(slot.kind)) return true;
    const count = s.inputs[slot.key]?.length || 0;
    return (
      count >= (slot.minCount ?? 1) &&
      (slot.maxCount == null || count <= slot.maxCount)
    );
  });
}
export function dispatchSession(s, event) {
  if (s.state === "committing") throw new Error("確定処理中です");
  if (event.type === "setting.change") {
    s.parameters[event.key] = clone(event.value);
    s.previewSequence++;
    s.result = null;
    s.state = "collecting";
  } else if (event.type === "input.set") {
    const slot = s.command.inputs.find((x) => x.key === event.key);
    if (!slot) throw new Error("Unknown input slot");
    s.inputs[event.key] = clone(event.refs);
    s.previewSequence++;
    s.result = null;
    s.state = "collecting";
  } else if (event.type === "cancel") {
    s.state = "cancelled";
    s.result = null;
  } else throw new Error("Unknown command event");
  return s;
}
export function operationForSession(s) {
  if (!sessionReady(s)) throw new Error("必要な形状を選択してください");
  return {
    operation: s.command.baseOperation,
    parameters: adaptCommand(s.command, s.parameters, s.inputValues),
    inputs: clone(s.inputs),
  };
}
