# Issue #17 — general surface editing plan

This plan concretizes Phase 3 instruction 015 against the requirements in
`cad-workspace-spec.md` §22.4/§22.6, the roadmap, and the command-status ledger.
It intentionally excludes Issue #18 onward, real-Mac Issue #37, Draft PR #43,
and workspace layout changes.

## Low-level operation decisions

| ID | Public command / mode | OCCT-level operation and reason |
| --- | --- | --- |
| F01 | `surface.join` v2 | `BRepBuilderAPI_Sewing`; it preserves an open shell and does not falsely force a solid. |
| F02 | `surface.explode` / `surface.extract` v2 | Face traversal plus `BRepBuilderAPI_Copy`; the exact face, trim wires, and orientation are retained. |
| F03 | `surface.split` / `surface.trim` | `BRepAlgoAPI_Splitter`; all pieces keep stable geometric slots, while trim selects retained pieces explicitly. |
| F04 | `surface.untrim` v2 | `BRep_Tool.Surface` plus finite-domain `BRepBuilderAPI_MakeFace`; full and selected-boundary modes retain the base-surface domain in history. |
| F05 | `surface.extend` | Exact base-surface parameter-domain extension with `BRepBuilderAPI_MakeFace`; unsupported infinite/degenerate domains fail with a typed diagnostic rather than fitting silently. |
| F06 | `surface.offset` v2 | `BRepOffsetAPI_MakeOffsetShape`; one/both sides and optional solidification are explicit outputs/options. |
| F07 | `surface.fillet` / `surface.chamfer` | OCCT filling/ruled construction between explicitly selected boundary edges; trim and join are separate options and the connector face can remain independent. |
| F08 | `surface.blend` | `BRepOffsetAPI_MakeFilling` with G0/G1/G2 boundary constraints; continuity is explicit and approximation tolerance is reported. |
| F09 | `surface.match` | Filling against the mutable and reference edges; only the mutable side is returned and the reference input is copied/read-only. |
| F10 | `surface.rebuild` / `surface.editPoles` | `GeomConvert_SurfaceToBSplineSurface` and B-spline pole editing; rebuild/edit mode, U/V degree/control data, and measured deviation are recorded. |
| F11 | `surface.reverse` / `shape.boundaries` v2 | Topological orientation reversal and exact edge extraction; open/shared boundary classification is informational and does not imply a solid. |
| D08 | `shape.moveFace` | Detached mode is exact face extraction plus transform; integrated planar push/pull uses selected-face direction/distance and rejects unsupported general-face reconstruction explicitly. |
| D09 | `shape.splitFace` / `surface.extract` | Splitter/pcurve-derived pieces or exact face copies; open results are valid outputs and source/cutter/selector references remain in history. |

## Contracts and verification

- Registry-first v2 commands use typed object/subshape inputs and shared command
  diagnostics. Existing v1 definitions remain readable.
- Multi-output operations use deterministic geometric slot keys; recomputation,
  save/open, Undo/Redo, and fresh-runtime import must preserve the chosen output.
- Exact B-rep is the operand and saved source. Tessellation is display-only.
- Approximate F08–F10 results report tolerance/deviation and never claim exactness.
- Fixtures cover a normal case and an incompatible/degenerate case for every ID,
  including copy/separate, split/trim selection, both-side offset, independent
  connector surfaces, boundary inspection, and detached versus integrated face move.
- Final verification is Node 24 `npm test`, Node 20.20.2 all JS tests, all native
  tests, browser tests, and both push/PR CI. Real macOS GUI/Tauri/OS dialogs stay
  unexecuted and remain Issue #37.

