import { id, clone, references } from "./document.js";
export function packageShapes(
  doc,
  entityIds,
  { name = "CAD asset", withHistory = true } = {},
) {
  const selected = entityIds.map((id) => doc.entities.find((e) => e.id === id));
  if (!selected.length || selected.some((e) => !e))
    throw new Error("保存する形状を選択してください");
  const needed = new Set();
  function visit(f) {
    if (needed.has(f.id)) return;
    needed.add(f.id);
    if (withHistory)
      for (const ref of references(f.inputs)) {
        const e = doc.entities.find((e) => e.id === ref.entityId);
        if (!e)
          throw new Error(
            "未解決の外部参照があります。形状snapshotとして保存するか、参照を修復してください。",
          );
        visit(doc.features.find((f) => f.id === e.producer.featureId));
      }
  }
  for (const e of selected)
    visit(doc.features.find((f) => f.id === e.producer.featureId));
  const entities = withHistory
    ? doc.entities.filter((e) => needed.has(e.producer.featureId))
    : selected;
  const assetHashes = new Set(entities.map((e) => e.geometry.assetHash));
  const assets = Object.fromEntries(
    [...assetHashes].map((h) => {
      if (!doc.assets[h]?.data)
        throw new Error("正本資産を取得してから保存してください");
      return [h, clone(doc.assets[h])];
    }),
  );
  return {
    format: "pathloom-shape-library-entry",
    schemaVersion: 1,
    id: id(),
    name,
    units: "mm",
    withHistory,
    selectedEntityIds: [...entityIds],
    features: withHistory
      ? clone(doc.features.filter((f) => needed.has(f.id)))
      : [],
    entities: clone(entities),
    bodies: [
      ...new Map(
        selected.map((e) => [
          e.bodyId,
          {
            id: e.bodyId,
            name: e.name,
            tipEntityId: e.id,
            splitIntoBodyIds: [],
            status: "ready",
          },
        ]),
      ).values(),
    ],
    sketches: withHistory
      ? clone(
          doc.sketches.filter((s) =>
            doc.features.some((f) => needed.has(f.id) && f.sketchId === s.id),
          ),
        )
      : [],
    commandDefinitions: withHistory
      ? clone(
          doc.commandDefinitions.filter((c) =>
            doc.features.some(
              (f) =>
                needed.has(f.id) &&
                f.command.id === c.id &&
                f.command.version === c.version,
            ),
          ),
        )
      : [],
    assets,
  };
}
export function insertShapes(doc, entry) {
  if (
    entry?.format !== "pathloom-shape-library-entry" ||
    entry.schemaVersion !== 1 ||
    entry.units !== "mm" ||
    !Array.isArray(entry.entities) ||
    !entry.entities.length
  )
    throw new Error("Unsupported shape library entry");
  const map = new Map();
  const slotKeys = new Map();
  function remap(value) {
    if (!value) return value;
    if (!map.has(value)) map.set(value, id());
    return map.get(value);
  }
  const entities = clone(entry.entities);
  const features = [];
  const remapEntity = (e) => {
    const original = e.id;
    e.producer.slotKey =
      slotKeys.get(`${e.producer.featureId}:${e.producer.slotKey}`) ||
      e.producer.slotKey;
    e.id = remap(e.id);
    e.bodyId = remap(e.bodyId);
    e.producer.featureId = remap(e.producer.featureId);
    delete e.displayCache;
    return e;
  };
  if (entry.withHistory) {
    for (const f of clone(entry.features)) {
      const originalFeatureId = f.id;
      f.id = remap(f.id);
      if (f.sketchId) f.sketchId = remap(f.sketchId);
      for (const ref of references(f.inputs))
        ref.entityId = remap(ref.entityId);
      for (const slot of f.outputSlots) {
        if (
          slot.sourceEntityId &&
          ["solid.split", "surface.split", "solid.difference"].includes(
            f.operation.id,
          )
        ) {
          const oldKey = slot.key,
            oldPrefix = `${f.operation.id}/${slot.sourceEntityId}`;
          slot.sourceEntityId = remap(slot.sourceEntityId);
          if (oldKey === oldPrefix || oldKey.startsWith(oldPrefix + "/")) {
            slot.key =
              `${f.operation.id}/${slot.sourceEntityId}` +
              oldKey.slice(oldPrefix.length);
            slotKeys.set(`${originalFeatureId}:${oldKey}`, slot.key);
          }
        }
        slot.entityId = remap(slot.entityId);
        slot.bodyId = remap(slot.bodyId);
      }
      for (const e of f.lastValid?.entitySnapshots || []) remapEntity(e);
      f.status = f.status === "suppressed" ? "suppressed" : "dirty";
      features.push(f);
    }
    for (const e of entities) remapEntity(e);
  } else {
    for (const e of entities) {
      const featureId = id(),
        entityId = remap(e.id),
        bodyId = id();
      e.id = entityId;
      e.bodyId = bodyId;
      e.producer = { featureId, slotKey: "result" };
      delete e.displayCache;
      features.push({
        id: featureId,
        name: entry.name,
        operation: { id: "asset.snapshot", version: 1 },
        command: { id: "asset.snapshot", version: 1, mode: "snapshot" },
        inputs: {},
        parameters: { assetHash: e.geometry.assetHash },
        toleranceOverrides: {},
        outputSlots: [{ key: "result", entityId, bodyId }],
        featureRevision: 1,
        requestedHash: e.resultHash,
        resultHash: e.resultHash,
        status: "valid",
        diagnostics: [],
        lastValid: {
          resultHash: e.resultHash,
          entitySnapshots: [clone(e)],
          inputRevisionHashes: [],
        },
      });
    }
  }
  const bodies = entities
    .filter((e) =>
      entry.withHistory
        ? entry.bodies.some(
            (b) =>
              b.id && remap(b.id) === e.bodyId && remap(b.tipEntityId) === e.id,
          )
        : true,
    )
    .map((e) => ({
      id: e.bodyId,
      name: entry.name,
      tipEntityId: e.id,
      splitIntoBodyIds: [],
      status: "ready",
    }));
  const sketches = clone(entry.sketches || []);
  for (const s of sketches) {
    s.id = remap(s.id);
    for (const p of s.points) p.id = remap(p.id);
    for (const l of s.lines) {
      l.id = remap(l.id);
      l.start = remap(l.start);
      l.end = remap(l.end);
    }
    for (const c of s.circles) {
      c.id = remap(c.id);
      c.center = remap(c.center);
    }
    for (const c of s.constraints) {
      c.id = remap(c.id);
      c.refs = c.refs.map(remap);
    }
    delete s.draft;
    delete s.lastValid;
  }
  return {
    features,
    entities,
    bodies,
    sketches,
    assets: clone(entry.assets),
    commandDefinitions: clone(entry.commandDefinitions || []),
    selectedEntityIds: entry.selectedEntityIds.map(remap),
  };
}
