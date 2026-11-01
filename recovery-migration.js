import { validateProject } from "./pathloom-project.js";

const clone = (value) => structuredClone(value);

export const PROJECT_RECOVERY_FORMAT = "pathloom-project-recovery";
export const PROJECT_RECOVERY_SCHEMA = 1;
export const LIBRARY_FORMAT = "pathloom-library";
export const LIBRARY_SCHEMA = 1;
export const LIBRARY_TYPES = new Set(["component", "shape", "command"]);

function unknownCompatibility(input) {
  if (!input || typeof input !== "object" || input.format !== "pathloom")
    return null;
  if (![1, 2].includes(input.version))
    return `project version ${String(input.version)}`;
  if (
    input.version === 2 &&
    input.cadDocument?.format === "pathloom-cad-document" &&
    input.cadDocument.schemaVersion !== 1
  )
    return `CAD schemaVersion ${String(input.cadDocument.schemaVersion)}`;
  const feature = input.cadDocument?.features?.find(
    (value) => value?.operation && value.operation.version !== 1,
  );
  if (feature)
    return `CAD operation ${String(feature.operation.id)} version ${String(feature.operation.version)}`;
  return null;
}

export function prepareProjectOpen(input) {
  const raw = clone(input);
  const compatibility = unknownCompatibility(raw);
  if (compatibility)
    return {
      mode: "read-only",
      raw,
      compatibility,
      summary: {
        format: raw.format,
        version: raw.version,
        sourceCount: Array.isArray(raw.sources) ? raw.sources.length : null,
        importedShapeCount: Array.isArray(raw.importedShapes)
          ? raw.importedShapes.length
          : null,
        cadFeatureCount: Array.isArray(raw.cadDocument?.features)
          ? raw.cadDocument.features.length
          : null,
      },
    };
  return { mode: "editable", project: validateProject(raw) };
}

export function createProjectRecovery(project, savedAt = new Date().toISOString()) {
  return {
    format: PROJECT_RECOVERY_FORMAT,
    schemaVersion: PROJECT_RECOVERY_SCHEMA,
    savedAt,
    project: clone(project),
  };
}

export function parseProjectRecovery(input) {
  if (
    input?.format === PROJECT_RECOVERY_FORMAT &&
    input.schemaVersion === PROJECT_RECOVERY_SCHEMA &&
    typeof input.savedAt === "string" &&
    input.project &&
    typeof input.project === "object"
  )
    return {
      kind: "project",
      savedAt: input.savedAt,
      candidate: prepareProjectOpen(input.project),
      envelope: clone(input),
    };
  if (input?.format === "pathloom-cad-document")
    return { kind: "legacy-cad", document: clone(input) };
  throw new Error("Unsupported recovery data");
}

export function readLibraryContainer(raw, expectedType) {
  if (!LIBRARY_TYPES.has(expectedType)) throw new Error("Invalid library type");
  if (Array.isArray(raw))
    return {
      entries: clone(raw),
      migrated: true,
      container: {
        format: LIBRARY_FORMAT,
        schemaVersion: LIBRARY_SCHEMA,
        libraryType: expectedType,
        entries: clone(raw),
      },
    };
  if (
    raw?.format !== LIBRARY_FORMAT ||
    raw.schemaVersion !== LIBRARY_SCHEMA ||
    raw.libraryType !== expectedType ||
    !Array.isArray(raw.entries)
  )
    throw new Error(`Unsupported ${expectedType} library`);
  return { entries: clone(raw.entries), migrated: false, container: clone(raw) };
}

export function writeLibraryContainer(entries, type) {
  if (!Array.isArray(entries)) throw new Error("Invalid library entries");
  return readLibraryContainer(entries, type).container;
}
