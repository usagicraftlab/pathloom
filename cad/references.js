// Similarity only supplies candidates. It never authorizes an automatic rebind.
export function resolveSubshape(ref, entity) {
  if (!entity) return { status: "missing", candidates: [] };
  const topology = entity.displayCache?.topology || [];
  let matches = [];
  if (ref.recordedResultHash === entity.resultHash)
    matches = topology.filter(
      (t) => t.kind === ref.kind && t.topologyId === ref.topologyId,
    );
  if (matches.length !== 1 && ref.semanticPath)
    matches = topology.filter(
      (t) =>
        t.kind === ref.kind &&
        JSON.stringify(t.semanticPath) === JSON.stringify(ref.semanticPath),
    );
  if (matches.length === 1)
    return {
      status: "ready",
      selector: {
        kind: ref.kind,
        topologyId: matches[0].topologyId,
        orientation: "forward",
      },
    };
  return {
    status: matches.length > 1 ? "ambiguous" : "missing",
    candidates: topology.filter((t) => t.kind === ref.kind),
  };
}
export function makeSubshapeRef(entity, topology) {
  return {
    entityId: entity.id,
    kind: topology.kind,
    semanticPath: topology.semanticPath,
    topologyId: topology.topologyId,
    recordedResultHash: entity.resultHash,
    fingerprint: topology.fingerprint,
  };
}
