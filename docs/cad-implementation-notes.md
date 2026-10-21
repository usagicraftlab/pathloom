# CAD implementation decisions and restart notes

Started 2026-10-21 JST from local HEAD `93c5139` on `codex/cad-workspace`.
The user explicitly adopted work-order §28.5. No push/merge/publication is
performed for this CAD addition. Existing improvements and shared Output tools
are preserved. The supplied v2.0 document is `cad-workspace-spec.md`.

## Structure

- `cad/document.js`, `history.js`, `transactions.js`, `references.js`: independent
  document, dependency order/invalidation, stable slots, semantic references,
  explicit repair and monotonic Undo revisions.
- `cad/commands`: registered data definitions, constrained adapters, sessions and
  unit/coordinate parsing. No evaluation of arbitrary user code.
- `cad/store.js`: preview/commit/recompute, dependency freshness, last-valid exact
  geometry, failure states, portable asset collection, sketch/library integration.
- `native/cad_runtime.py`, `cad_operations`: persistent OCP process, immutable
  shape handles, exact assets, validation, tessellation and bounded JSONL.
- `src-tauri/src/cad_runtime.rs`: dedicated process supervisor, serialized IPC,
  bounded stdout, non-retaining stderr drain, epochs and kill/restart isolation.
- `cad/workspace-ui.js`, `view-adapter.js`: left commands / upper-right settings /
  lower-right history and the shared Three.js viewport. Original SVG icon.
- `cad/sketch`: independent small nonlinear solver in a Worker, QR with pivoting,
  analytic Jacobians for basic constraints and finite differences for other
  currently implemented relationships. General NURBS/arc constraints are pending.
- `generation-adapter.js`: explicit body-result binding, existing curve/surface
  input types with validated binding metadata; no automatic graph wiring.
- `shape-library.js`: portable exact shapes / dependency closure and typed ID
  remapping. Recovery storage is separate from the user's project file.

## Deliberate implementation adjustments

1. For this first runtime integration, exact B-rep assets are exported at successful
   feature commit as well as at save. This costs an extra transfer but protects
   unsaved committed geometry when hard cancellation invalidates every process
   handle. Replacing this with shared asset storage is a later optimization;
   dropping the committed asset protection is not acceptable.
2. The native daemon has a serialized operation gate and a 60 s watchdog; the
   browser expires the matching request at 65 s. The older STEP/slice compatibility
   path retains its existing 25 s limit. Python retains at most 1,024 handles and
   512 MiB of serialized B-rep (OCCT working memory is not thereby bounded).
3. Existing input types are reused rather than adding a half-connected
   `cad-reference` port. Curve sampling remains an explicit 0.02 mm adapter
   boundary; source B-rep stays in the CAD document. Referenced geometry is vaulted
   out of AI requests. Pending CAD input blocks affected graph output.
4. Project v2 is validated through an explicit adapter to the existing v1 domain,
   plus separate CAD validation. Legacy v1 remains accepted; reading a file never
   overwrites it automatically. Saving uses v2. Flush + same-directory rename is
   used by the native writer.
5. Unknown metadata is preserved by the document schema, while core IDs, numeric
   data, DAG and required assets are validated. Unknown operation versions are
   currently rejected; a full read-only recovery UI for them remains pending.
6. Exact subshape IDs apply to the same asset; primitive semantic paths and
   extrusion Generated links support dimension changes. Fingerprint proximity
   never silently authorizes a new target. Rounded corners intentionally remove
   the old sharp-corner semantic edge. General Modified/Generated map propagation
   through every advanced operation is not complete. Native startup executes
   rectangle/extrude/fillet/open-Loft probes and labels unimplemented advanced
   operations explicitly. The binding reports its own version; the exact OCCT
   version is null when the wrapper does not expose it.
7. Recovery currently covers the CAD document and drafts, not the entire legacy
   generation workspace. It waits at least 1 s idle and no more frequently than
   every 10 s; it does not overwrite the user's project. Full-application draft
   recovery is still a separate integration task.

## Evidence and limitations

Use `cad-command-status.md` and `cad-verification-status.md`; unexecuted conditions
are not passes. Tests under `native/test_cad*.py` use real OCCT geometry.
`tests/browser/cad-workspace.spec.mjs` substitutes only Tauri IPC/OS storage; actual
geometric operations run in the persistent Python daemon. That does not prove
macOS installation, dialogs, process supervision or Keychain behavior.

The Rust Session transport is additionally extracted without modification into
`work/cad-implementation/rust-session` for Linux type checking and real process
communication / malformed reply / hard-kill tests. Full Tauri compilation still
requires macOS or Linux GTK/WebKit development libraries. `rustfmt` parsing is
not a substitute for that full build.

## Next implementation areas (do not declare CAD complete)

- Missing major operations: curve extend/trim/fillet/blend/rebuild/pole edits,
  helix/spiral, projection/pull, advanced surface trim/extend/fillet/blend/match/
  rebuild, Sweep2, Network/Patch, Pipe, Cap/assemble, generalized face edits.
- Complete modes and typed schemas for every operation; reject ignored options.
  Add normal + failure fixtures for every ID, not only the shared primitives.
- Complete sketch element types, component-isolated scaled solving, hard/soft drag,
  remaining Jacobians, proven conflict candidate isolation, reference dimensions
  and graphical glyph/drag editing. Current solver does not claim full §21.
- Ordered input reordering, rectangle multi-mode UI, broader overlapping-pick coverage,
  selection boxes, remaining snap types and keyboard/VoiceOver coverage.
- User-command DSL/AI editing/version upgrades, explicit command upgrades and alias collision UI; matching project definitions are already pinned.
- Library migration/placement/external-reference choices and display-handle GC.
- Complete generation branch isolation, project open/close draft protection and
  full-application recovery integration; real Mac performance and integration tests.
- Audit LGPL exception/source/replaceability and transitive distributions. See
  `THIRD_PARTY_NOTICES.md`. No licensing decision is inferred for project code.

## Resume commands

```sh
node --test tests/*.test.mjs
npm run test:cad-native
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

Use the existing local Python interpreter and Rust toolchain; do not replace
configured authentication. Logs/screenshots are under `work/cad-implementation`.

## Current local milestone

42 of the 65 feature IDs have command registrations, with incomplete modes and
per-ID verification. B07 reuses `shape.extrude` but lacks its own complete UI/test
path. 22 IDs have not been implemented: C11, C12, E03, E05, E07, E08, E09, E11,
E13, S08, S10, S11, F03, F05, F07, F08, F09, F10, B06, B08, D08, D09.
No conclusion of full CAD completion is warranted.

The current next development loop should start with curve mode/parameter schemas
and exact Trim/Extend/Fillet/Blend fixtures, then the remaining sketch/drag work,
then Sweep2/Network/Patch/Match research. Continue to close each operator's full
schema -> exact geometry -> fixtures -> session -> history -> Undo/save ->
diagnostics -> UI path. Do not expose missing operators as working buttons.

Current verification logs are `final-js-tests.log`, `final-native-tests.log`,
`final-browser-tests.log` and `rust-session-tests.log` in
`work/cad-implementation/`. The latest version of these logs is authoritative
for this local milestone; they are intentionally excluded from distribution.

Session implementation detail: stdin is drained by a dedicated writer thread,
so a blocked request write is covered by the supervisor watchdog and hard cancel.
Protocol mismatch, EOF, timeout and cancellation are distinguished. Superseded
errors cannot overwrite newer feature edits, and explicit cancel does not restart
that feature automatically. The four transport tests are also in the native Rust
module for the eventual full macOS `cargo test` run.

Version-2 validation strips the CAD region before using the legacy validator,
avoiding a redundant clone of large exact assets. A saved CAD snapshot fixes its
revision first, omits display caches and includes only referenced exact assets.
Normal Save permits a failed CAD-linked generation state while retaining the
last valid paths and the failure flag; G-code still checks current binding hashes.
Other inactive generation graphs receive updated input snapshots and remain
explicitly waiting for recalculation when selected. Full automatic multi-graph
scheduling is still pending.

## Verified checkpoint results

- `node --test tests/*.test.mjs`: **155 passed**, no skips.
- `npm run test:cad-native`: **37 discovered, 35 passed, 2 optional USD tests skipped**.
- Packaged `npm run test:browser`: **21 passed**, including 7 real-OCCT CAD flows
  and 14 existing AI/output regression flows. Checked that packaged JS matches
  the final source files.
- Exact production Rust Session extract: **4 passed**, including hard cancellation
  while reading and while stdin is full. Rust source format/syntax checks pass.
- `git diff --check`: clean. Full Tauri/macOS compilation and real OS persistence
  remain **unexecuted**. Browser file storage is substituted transport; it is not
  evidence of the real macOS dialogs or app-data filesystem.
- No push, merge, PR, publication, real AI request or printer transmission.

The next action is implementation of the remaining items, not a statement that
all P0-P5 gates passed. The 65-ID and A/T/R ledgers are the scope inventory.
Credit balance is not available to this session; no low-credit condition is
claimed. Existing successful work is preserved as a local checkpoint.

## Additional explicit limitations

- Topology IDs are currently scoped to a geometry hash and OCP traversal ordinal.
  Changed geometry is never matched by ordinal alone; rectangle/extrude semantic
  paths and explicit repair cover the tested flow. A durable UUID topology table
  with complete Modified/Generated provenance is still needed for full §18/23
  compliance across all operators and serialization cases.
- Input stages/parameter validation are complete only for implemented subsets.
  Per-operator schemas, automatic profile-normal defaults, every coordinate/mode
  flow and all optional flags still require the per-ID completion loop.
- Curve/B-rep generation adapters are connected; unsupported geometry kinds are
  not offered a misleading active generation button. AI sees local CAD reference
  tokens and geometry summaries, and cannot invent a live CAD binding.
- New JS modules/tests were formatted with development-only Prettier 3.6.2 (MIT);
  no production dependency or package-lock change was introduced for formatting.
  JavaScript and packaged browser tests were rerun after formatting.
