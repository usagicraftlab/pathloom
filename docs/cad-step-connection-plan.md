# Issue #14 — existing STEP connection plan

This plan concretizes the three Issue #14 acceptance conditions without changing
the existing project-v1 fields or the CAD document schema version. The source of
truth remains exact OCCT B-rep; preview meshes are never imported as CAD history.

| Contract | Implementation | Evidence |
| --- | --- | --- |
| Existing input/save compatibility | Add an explicit `import.step` history adapter that accepts only an editable `importedShapes` entry with an embedded `occt-brep` source. It creates one CAD feature/body/entity and reuses the exact asset hash. Existing `importedShapes`, source placement, and version-1 open behavior remain unchanged; version 2 saves both the legacy input and `cadDocument`. | JS contract tests plus a packaged-browser flow importing an existing STEP, editing the CAD result, saving, and reopening it. Display-only mesh imports remain legacy-only and get an explicit diagnostic instead of fabricated geometry. |
| Units / placement / truth / provenance | Persist `units: mm`, the imported placement matrix, source imported-shape ID/name/kernel, source exact hash, and original exact hash in the import feature parameters and immutable asset metadata. Validate the adapter payload and hash before document mutation. | JS validation and fresh-store restore compare metadata, exact asset hash, bbox, volume, feature/body IDs, and downstream history. |
| STEP export and independent reread | Export the selected current CAD body through OCCT `STEPControl_Writer`, not its mesh. Re-read the exported text with a fresh runtime/reader and compare bbox, area/volume, closure, and exact validity within the documented kernel tolerance. Browser UI exposes export for a selected current body; Tauri owns the save dialog. | Native round-trip tests use independent runtime instances. Browser test covers adapter → edit → STEP export → independent import and numeric comparison; Rust tests cover bounded write validation. |

Boundaries: this issue does not migrate display-only browser STEP meshes into
invented B-rep, does not claim arbitrary assembly metadata/name preservation, and
does not complete actual macOS dialog verification (Issue #37). It does not start
Issue #15 or Phase 3.
