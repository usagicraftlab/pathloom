import { geometryEdges } from "../cad-graph.js";

const unique = (values) => [...new Set(values.filter(Boolean))];

export function bindingIdsForGraphSelection(definition, { nodeIds = [], edge = null } = {}) {
  const edges = geometryEdges(definition);
  const pending = [...nodeIds, edge?.from].filter(Boolean);
  const visited = new Set();
  while (pending.length) {
    const nodeId = pending.pop();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const candidate of edges)
      if (candidate.to === nodeId) pending.push(candidate.from);
  }
  return unique([...visited]
    .filter((nodeId) => nodeId.startsWith("input:"))
    .map((nodeId) => definition.inputs.find((input) => `input:${input.id}` === nodeId)?.cadBinding?.id));
}

export function graphHighlightsForBindings(definition, bindingIds = []) {
  const wanted = new Set(bindingIds);
  const edges = geometryEdges(definition);
  const nodes = new Set(definition.inputs
    .filter((input) => wanted.has(input.cadBinding?.id))
    .map((input) => `input:${input.id}`));
  const highlightedEdges = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!nodes.has(edge.from) || nodes.has(edge.to)) continue;
      nodes.add(edge.to);
      changed = true;
    }
  }
  for (const edge of edges)
    if (nodes.has(edge.from) && nodes.has(edge.to)) highlightedEdges.push(edge);
  return { nodeIds: [...nodes], edges: highlightedEdges };
}

export function bindingIdsForCadSelection(document, entityIds = []) {
  const entities = entityIds.map((id) => document.entities.find((entity) => entity.id === id)).filter(Boolean);
  const ids = new Set(entityIds);
  const bodyIds = new Set(entities.map((entity) => entity.bodyId));
  return unique(document.outputBindings
    .filter((binding) => ids.has(binding.resolvedEntityId) || bodyIds.has(binding.source?.bodyId))
    .map((binding) => binding.id));
}

export function cadTargetsForBindings(document, bindingIds = []) {
  const wanted = new Set(bindingIds);
  return document.outputBindings.filter((binding) => wanted.has(binding.id)).flatMap((binding) => {
    const body = document.bodies.find((candidate) => candidate.id === binding.source?.bodyId);
    const entityId = binding.resolvedEntityId || body?.tipEntityId;
    const entity = document.entities.find((candidate) => candidate.id === entityId);
    return entity ? [{ bindingId: binding.id, entityId: entity.id, featureId: entity.producer?.featureId }] : [];
  });
}
