import { canonical } from "./document.js";
// Exact assets are immutable/hash-shared, never duplicated into every Undo entry.
function restored(entry, current) {
  const next = structuredClone(entry.state);
  for (const f of next.features) {
    const previous = current.features.find((p) => p.id === f.id);
    if (previous) {
      const changed =
        canonical([f.parameters, f.inputs, f.operation]) !==
        canonical([previous.parameters, previous.inputs, previous.operation]);
      f.featureRevision =
        Math.max(f.featureRevision, previous.featureRevision) +
        (changed ? 1 : 0);
    }
  }
  return {
    ...next,
    assets: { ...current.assets, ...entry.assets },
    documentRevision: current.documentRevision + 1,
  };
}
function snapshot(doc) {
  const { assets, ...state } = doc;
  return { state: structuredClone(state), assets };
}
export function createTransactions(get, set, cancel = () => {}) {
  let undo = [],
    redo = [];
  return {
    record(before, after, label) {
      undo.push({ before: snapshot(before), after: snapshot(after), label });
      if (undo.length > 100) undo.shift();
      redo = [];
    },
    squashLast(count, label) {
      if (!Number.isSafeInteger(count) || count < 2 || undo.length < count)
        return false;
      const entries = undo.splice(undo.length - count, count);
      undo.push({
        before: entries[0].before,
        after: entries.at(-1).after,
        label: label || entries.at(-1).label,
      });
      redo = [];
      return true;
    },
    undo() {
      const entry = undo.pop();
      if (!entry) return false;
      cancel();
      const current = get();
      set(restored(entry.before, current));
      redo.push(entry);
      return true;
    },
    redo() {
      const entry = redo.pop();
      if (!entry) return false;
      cancel();
      const current = get();
      set(restored(entry.after, current));
      undo.push(entry);
      return true;
    },
    clear() {
      undo = [];
      redo = [];
    },
    get canUndo() {
      return !!undo.length;
    },
    get canRedo() {
      return !!redo.length;
    },
  };
}
