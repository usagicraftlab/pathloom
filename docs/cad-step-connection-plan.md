# Issue #14 — existing STEP connection plan

This plan concretizes the three Issue #14 acceptance conditions without changing
the existing project-v1 fields or the CAD document schema version. The source of
truth remains exact OCCT B-rep; preview meshes are never imported as CAD history.

| Contract | Implementation | Evidence |
| --- | --- | --- |
| Existing input/save compatibility | Add an explicit `import.step` history adapter that accepts only an editable `importedShapes` entry with an embedded `occt-brep` source. It creates one CAD feature/body/entity and reuses the exact asset hash. Existing `importedShapes`, source placement, and version-1 open behavior remain unchanged; version 2 saves both the legacy input and `cadDocument`. | `tests/step-connection.test.mjs` and `tests/browser/cad-step-connection.spec.mjs` import, edit, save and reopen the shape. The display-only case stays legacy-only. |
| Units / placement / truth / provenance | Persist `units: mm`, the imported placement matrix, source imported-shape ID/name/kernel, source exact hash, and original exact hash in the import feature parameters and immutable asset metadata. Validate the adapter payload and hash before document mutation. | JS/browser assertions compare metadata, exact hash, bbox, volume and downstream history; candidate validation precedes the atomic document assignment. |
| STEP export and independent reread | Export the selected current CAD body through OCCT `STEPControl_Writer`, not its mesh. Re-read the exported text with a fresh runtime/reader and compare bbox, area/volume, closure, and exact validity within the documented kernel tolerance. Browser UI exposes export for a selected current body; Tauri owns the save dialog. | `native/test_step_connection.py` uses independent Runtime instances; browser covers adapter → Move → save/reopen → export/reimport. Rust validates the bounded `.step` save path. |

Boundaries: this issue does not migrate display-only browser STEP meshes into
invented B-rep, does not claim arbitrary assembly metadata/name preservation, and
does not complete actual macOS dialog verification (Issue #37). It does not start
Issue #15 or Phase 3.
