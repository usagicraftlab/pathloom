export const TOLERANCES = Object.freeze({
  kernelLinearMm: 1e-6,
  joinLinearMm: 0.01,
  fitLinearMm: 0.01,
  solverLinearMm: 1e-6,
  angularRad: 1e-5,
});
export const WORLD_XY = Object.freeze({
  origin: [0, 0, 0],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
});
export const id = () => crypto.randomUUID();
export const clone = (value) => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function sha256(value) {
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : canonical(value),
  );
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function createCadDocument() {
  return {
    format: "pathloom-cad-document",
    schemaVersion: 1,
    id: id(),
    documentRevision: 0,
    units: "mm",
    kernel: { family: "occt", version: null },
    tolerances: { ...TOLERANCES },
    features: [],
    entities: [],
    bodies: [],
    sketches: [],
    assets: {},
    commandDefinitions: [],
    outputBindings: [],
    draftSessions: [],
    uiState: {
      activeStage: "model",
      leftWidth: 280,
      rightWidth: 320,
      inspectorRatio: 0.55,
      selection: [],
      workPlane: clone(WORLD_XY),
    },
  };
}
export function references(inputs) {
  return Object.values(inputs)
    .flatMap((a) => (Array.isArray(a) ? a : [a]))
    .filter(Boolean);
}
export function topologicalFeatures(doc) {
  const producers = new Map(
      doc.features.flatMap((f) => f.outputSlots.map((s) => [s.entityId, f.id])),
    ),
    features = new Map(doc.features.map((f) => [f.id, f])),
    done = new Set(),
    visiting = new Set(),
    out = [];
  function visit(f) {
    if (done.has(f.id)) return;
    if (visiting.has(f.id))
      throw new Error("CAD history contains a dependency cycle");
    visiting.add(f.id);
    for (const ref of references(f.inputs)) {
      const dep = features.get(producers.get(ref.entityId));
      if (dep) visit(dep);
    }
    visiting.delete(f.id);
    done.add(f.id);
    out.push(f);
  }
  for (const f of doc.features) visit(f);
  return out;
}
export function validateCadDocument(doc) {
  if (
    !doc ||
    doc.format !== "pathloom-cad-document" ||
    doc.schemaVersion !== 1 ||
    doc.units !== "mm" ||
    typeof doc.id !== "string" ||
    !Number.isSafeInteger(doc.documentRevision) ||
    doc.documentRevision < 0
  )
    throw new Error("Unsupported CAD document schema");
  for (const name of [
    "features",
    "entities",
    "bodies",
    "sketches",
    "commandDefinitions",
    "outputBindings",
    "draftSessions",
  ])
    if (!Array.isArray(doc[name])) throw new Error(`Invalid CAD ${name}`);
  const all = new Set();
  for (const array of [
    doc.features,
    doc.entities,
    doc.bodies,
    doc.sketches,
    doc.outputBindings,
  ])
    for (const entry of array) {
      if (typeof entry.id !== "string" || !entry.id || all.has(entry.id))
        throw new Error("Duplicate or invalid CAD ID");
      all.add(entry.id);
    }
  for (const [k, v] of Object.entries(TOLERANCES))
    if (!Number.isFinite(doc.tolerances?.[k]) || doc.tolerances[k] <= 0)
      throw new Error("Invalid CAD tolerance " + k);
  const statuses = [
    "dirty",
    "running",
    "valid",
    "warning",
    "empty",
    "failed",
    "blocked",
    "suppressed",
    "cancelled",
  ];
  const slots = new Set();
  for (const f of doc.features) {
    if (
      !f.operation?.id ||
      f.operation.version !== 1 ||
      !f.command?.id ||
      !Number.isSafeInteger(f.featureRevision) ||
      !statuses.includes(f.status) ||
      !f.parameters ||
      !f.inputs ||
      !Array.isArray(f.outputSlots) ||
      !Array.isArray(f.diagnostics)
    )
      throw new Error("Invalid CAD feature");
    for (const s of f.outputSlots) {
      if (typeof s.key !== "string" || slots.has(s.entityId))
        throw new Error("Invalid CAD output slot");
      slots.add(s.entityId);
    }
    if (
      f.lastValid != null &&
      (!f.lastValid.resultHash ||
        !Array.isArray(f.lastValid.entitySnapshots) ||
        !Array.isArray(f.lastValid.inputRevisionHashes) ||
        f.lastValid.inputRevisionHashes.some((h) => typeof h !== "string"))
    )
      throw new Error("Invalid last-valid CAD snapshot");
    for (const e of f.lastValid?.entitySnapshots || [])
      if (!e.geometry?.assetHash || !doc.assets?.[e.geometry.assetHash])
        throw new Error("Missing last-valid CAD asset");
    for (const r of references(f.inputs))
      if (
        typeof r.entityId !== "string" ||
        (!slots.has(r.entityId) &&
          !doc.features.some((p) =>
            p.outputSlots.some((s) => s.entityId === r.entityId),
          ) &&
          r.unresolved !== true)
      )
        throw new Error("Dangling CAD reference must be marked unresolved");
  }
  for (const body of doc.bodies)
    if (
      !["ready", "pending", "split", "missing"].includes(body.status) ||
      !Array.isArray(body.splitIntoBodyIds) ||
      (body.tipEntityId != null && typeof body.tipEntityId !== "string")
    )
      throw new Error("Invalid CAD body");
  for (const e of doc.entities) {
    if (
      !["point", "curve", "surface", "shell", "solid", "compound"].includes(
        e.kind,
      ) ||
      !slots.has(e.id) ||
      !e.geometry?.assetHash ||
      !doc.assets?.[e.geometry.assetHash]
    )
      throw new Error("Missing CAD entity asset or producer");
    for (const n of [...e.bbox.min, ...e.bbox.max])
      if (!Number.isFinite(n)) throw new Error("Invalid CAD bounds");
  }
  function finiteTree(v) {
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error("Nonfinite CAD value");
    if (v && typeof v === "object")
      for (const x of Object.values(v)) finiteTree(x);
  }
  finiteTree(doc);
  topologicalFeatures(doc);
  return doc;
}
export function deriveVisibleEntities(doc) {
  const tips = new Set(
    doc.bodies.filter((b) => b.status !== "missing").map((b) => b.tipEntityId),
  );
  return doc.entities.filter(
    (e) => tips.has(e.id) && e.visibility !== "hidden",
  );
}
export function applyDocumentPatch(doc, patch) {
  const next = clone(doc);
  for (const key of [
    "features",
    "entities",
    "bodies",
    "sketches",
    "outputBindings",
  ])
    if (patch[key]) {
      const change = patch[key];
      next[key] = next[key].filter((x) => !change.remove?.includes(x.id));
      for (const entry of change.upsert || []) {
        const i = next[key].findIndex((x) => x.id === entry.id);
        if (i < 0) next[key].push(clone(entry));
        else next[key][i] = clone(entry);
      }
    }
  next.documentRevision = doc.documentRevision + 1;
  return validateCadDocument(next);
}
