# Maintenance and interaction improvements

2026-10-20. Baseline: `c01aad65a115e8986f082d3fdda2afa156f42457`.
Branch: `codex/canvas-ai-performance`.

## Scope and preserved behavior

Implemented the requested validation/consistency fixes, canvas-local AI authoring,
visible progress/errors/retry/cancel, menu-based settings and performance work.
The intentionally global Output tool assignment remains shared by logical tool ID.
The user authorized commit and push; no PR, main merge or deployment is requested.
No real printer command or paid inference was sent during automated verification.

The supplied constitution is preserved in `app-design-constitution.md`.
See `constitution-review.md` for all ten principles, evidence and remaining gaps.
It is an evaluation reference, not an independent grant of implementation scope.

## Changes

- Common file/project/output settings validation, bounded sparse logical tools,
  final bed/Z checks, initial layer height consistency and empty-output handling.
- Native CAD process cancellation/timeout/bounded pipes; atomic project writes;
  unused import routes removed while legacy USD data remains supported.
- Canvas instruction cards, on-demand AI settings/native menu, stateful progress,
  persistent error details, rollback on failed application and syntax checks for
  disconnected Code Components. No automatic graph wiring.
- Session-only prompt draft preservation; restored projection, view axis,
  selection, layout controls and saved layer without rearranging objects.
- Last valid shape remains dimmed after invalid edits, with output blocked until
  corrected. Actual dimmed drawing and recovery are covered by a browser test.
- Reused preview geometry, cached source measurements, typed buffers, worker
  reuse and demand-driven idle rendering; packaged assets reduced by ~22 MiB
  (about 33 MiB to 11 MiB) by excluding unused development samples.
- Archived old HTTP bridges under `legacy/`; shared frontend manifest;
  JS/browser, Python and macOS Rust CI, with Pages gated on successful main CI.

## Verification

- JavaScript: **137 tests passed**, no skips.
- Python/OCCT: **21 discovered, 19 passed, 2 optional NVIDIA USD tests skipped**.
- Rust CAD process helper: **5 passed**, covering concurrent pipe draining,
  timeout, running/early cancellation and output cap.
- Packaged-frontend browser: **14 passed**. Scenarios cover startup/export, bounds errors, two viewport sizes,
  canvas placement, drafts, saved view/layout/layer restoration, invalid detached
  code, failed final generation rollback, idle rendering, stale shape recovery,
  retry/cancel and intentionally shared Output tools. Native APIs/AI are mocked.
- Full Tauri crate compilation requires macOS CI or a local development machine;
  Linux session lacks GTK/WebKit development libraries. Rust syntax/format and
  standalone process helper were checked here. CI results must be distinguished
  from these local results.

## Measured performance and limits

Same headless Chromium/software-rendering session, synthetic 50,100-point paths,
8 printer-profile updates; these are diagnostic measurements, not Mac benchmarks.

| Metric | Baseline | Updated |
| --- | ---: | ---: |
| Median profile update | 7.1 ms | 2.0 ms |
| Path geometry disposals over 8 updates | 1,600 | 0 |
| Idle animation-frame callbacks in 500 ms | 30 | 0 |
| Initial import (single measurement) | 100.6 ms | 166.1 ms |

Repeated placement/profile work and idle polling improved. Initial import did
not improve in this final sample; do not claim a universal speedup. Loading still
includes validation and buffer construction and needs real-model profiling.

## Remaining / restart here

1. Add a separately designed draft save/recovery path: current Save rejects
   generation errors, so incomplete work cannot yet be saved as a normal project.
2. Revisit intermediate-geometry restrictions and numerical limits per operation;
   retain computational bounds and necessary Stack/Boolean contracts.
3. Verify the installed macOS app: menu, dialogs, Keychain, reopen, window sizes,
   real Codex progress/cancel/errors, VoiceOver/keyboard and CAD runtime discovery.
4. Verify Rhino live updates and project reopen. Test PrusaLink connection and
   transfer before user-directed physical printing; never infer actual print
   reliability from mocked APIs or G-code text checks.
5. Normalize language/unit conventions, split large app/UI modules where useful,
   and profile initial STEP/path loading with representative local models.

Other limits: prompt drafts are session-only; path-point progress isn't restored;
CAD Python is not bundled in distributables; collision/gantry checking, STEP
export and general curved-face modeling are absent. Credit balance is not exposed
in this session, so no remaining-credit amount can be reported.
