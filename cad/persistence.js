import {
  createCadDocument,
  validateCadDocument,
  sha256,
  clone,
} from "./document.js";
export function upgradeProject(project) {
  if (project.version === 1)
    return { ...clone(project), version: 2, cadDocument: createCadDocument() };
  if (project.version !== 2) throw new Error("Unsupported project version");
  validateCadDocument(project.cadDocument);
  return project;
}
export async function verifyAssets(doc) {
  for (const [hash, a] of Object.entries(doc.assets)) {
    if (
      !a ||
      a.format !== "occt-brep" ||
      a.encoding !== "utf-8" ||
      typeof a.data !== "string" ||
      new TextEncoder().encode(a.data).byteLength !== a.byteLength ||
      (await sha256(a.data)) !== hash
    )
      throw new Error("CAD_ASSET_MISSING: corrupt exact asset " + hash);
  }
  return doc;
}
