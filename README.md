# Pathloom

A local macOS workspace for custom 3D printing toolpaths, parametric components,
and exact STEP B-rep editing. The primary runtime is **Pathloom Desktop (Tauri 2)**.
GitHub Pages is a browser preview with a smaller set of capabilities.

## CAD workspace (in development)

The leftmost CAD stage adds exact OCP curve, surface and solid operations with
commands on the left, settings at upper right and feature history below it.
Numerical edits, last-valid geometry, explicit edge repair, Undo/Redo and portable
project v2 assets are connected. The original three stages remain available.
CAD can retain open/nonplanar geometry and negative Z independently of printing.

Use **生成で使用** in shape properties to add an explicit body-result input to the
generation graph. It does not wire nodes automatically. Shape/history Library
and CAD-only recovery data use separate application-data files. Normal Save now
writes v2; v1 files remain readable and are not rewritten merely by opening them.

This is **not the complete 65-command CAD specification**. The
[command ledger](docs/cad-command-status.md),
[acceptance ledger](docs/cad-verification-status.md) and
[implementation/restart notes](docs/cad-implementation-notes.md) distinguish
implemented subsets, numeric evidence, missing modes and local-Mac checks.
Advanced surface matching/network construction and several editing commands are
still pending. CAD requires the separately provisioned runtime below.

The [CAD master plan](docs/cad-master-plan.md),
[roadmap](docs/cad-roadmap.md) and
[development log](docs/cad-development-log.md) record the 2026-10-26 Phase 0 audit
and Phase 1 implementation: result freshness, multiple-target Difference, stable
Split references, plane-aware Offset, basic drawing modes and draft/asset restore.
They include current test results and the remaining macOS GUI acceptance gates.
The existing command and acceptance ledgers remain the per-feature source of truth.

## AI components on the canvas

- Click blank space on the Processing node canvas, or use **✦ New AI Component**.
- Write instructions directly on the temporary card. Click **生成する** or press
  Cmd/Ctrl+Enter. The card shows connecting, generating, validation, repair and
  application, followed by a visible completion state and a node animation.
- New Components appear at the requested canvas position, disconnected. Wire
  their typed ports into the graph. Existing Print outputs remain unchanged.
- Right-click a Component and choose **Edit with AI** to edit that Component.
- Failures retain the instructions and show an explanation, technical details,
  and retry. Cancel stops inference/local validation and discards late replies.
- **File → AI Settings…** in the macOS menu opens connection, model and account
  usage settings. The graph toolbar's gear opens the same dialog in previews.
- Double-click blank space or right-click to search built-in and saved Components.
  Drag blank space for box selection; right/middle drag pans the graph.

AI uses the installed Codex App Server and its local ChatGPT account, not a
separate API key. No model request is made merely by opening an instruction card.
Large STEP geometry remains local; requests use opaque references and summaries.
Code Components run in bundled, isolated QuickJS WebAssembly. Referenced code is
syntax-checked even before a detached Component is connected. File, network, DOM,
shell and desktop IPC are unavailable to Component code.

## Main workflows

- Import `.toolpath` / JSON with ordered paths, logical tool IDs and XYZ points.
- Preview tools, print speed, layers and path progression in Three.js.
- Duplicate, move, rotate, arrange and order placed instances.
- Generate geometry using typed Curve/Point/number/list/boolean Components;
  stack, twist, scale, clip, offset, repeat, prepare paths and assign tools.
- Save immutable custom Component versions in the local Library.
- Import DXF curves and STEP. Desktop stores exact OCCT B-rep and edit history
  inside projects, supports selected planar-face edits and native sectioning.
  Browser STEP is a mesh reference and uses approximate slicing.
- **Open / Save / Save As** in the File menu store a `.pathloom` workspace with
  geometry, graphs, placements, print settings, view and conversation history.
- Generate G-code, including configurable start/end/tool-change templates,
  temperatures, fan, intro lines, per-instance layer pauses, thumbnails and
  approximate time/filament metadata.
- Desktop PrusaLink supports connection testing, API Key or Digest authentication,
  Transfer only, and an explicit Transfer and print action. Credentials remain in
  the OS credential store (Keychain on macOS), outside project files.

**Output tool assignment and filament appearance are intentionally shared across
objects using the same logical tool ID.** Speed and E-rate remain per-source.
Logical tool IDs can be sparse; the UI does not create a row for every missing ID.
Physical output tool numbers are validated before saving and exporting.

All export paths validate settings, finite coordinates, placement, physical tool
settings and build bounds, including Z >= 0. Imported custom 3D paths remain
supported; generator-specific planar/intersection rules are not imposed on all
imported paths. A disconnected Print output emits no paths. Initial generated
layer height and Basic Settings both default to 0.60 mm.

These checks do **not** establish support, collision/gantry clearance or physical
print safety. Custom start/end/tool-change G-code is preserved and requires
printer-specific review. Duration estimates omit acceleration, heating, custom
G-code and manual waiting at pauses. STEP export and general-purpose curved-face
modeling are not implemented.

## Run on macOS

Requirements: macOS 12+, Node 20+, Xcode Command Line Tools and Rust stable.

```sh
xcode-select --install
npm ci
npm run cad:setup
npm start
```

`cad:setup` provisions an ignored Python 3.12 / cadquery-ocp 7.8.1.1 runtime under
`.pathloom-runtime/` and records its absolute interpreter path in application
data (`cad-runtime.json`). Both the CAD daemon and STEP bridge use that path,
including shell-independent launches. Run setup again if the checkout/runtime
moves. `PATHLOOM_BREP_PYTHON` explicitly overrides it with a compatible interpreter.
Finder launch still needs the macOS acceptance check.
The CAD Python environment is not embedded in the app bundle yet;
distribution machines need it provisioned. Standard STEP editing does not need
NVIDIA USD BRep or `occt_to_usd`. Legacy USD assets remain readable through the
compatibility path.

```sh
npm run mac:build       # .app + .dmg
npm run desktop:prepare # frontend assets only
```

Development and packaging discover frontend modules through one asset manifest
in `scripts/frontend-assets.mjs`. Only the UI's bundled Ukigara Clock sample is
shipped; larger development samples remain in the repository.

## Live inputs

Desktop **Add .toolpath** follows saved changes once per second. A stable file
path updates the same source, preserving placement, duplicates and retained tool
settings. Invalid/missing files retain the last valid result. Delete the object
to stop following it. Project opening does not restart file links; add them again.
Write generator output atomically (temporary file followed by rename).

Rhino/Grasshopper on the same machine connects to `ws://127.0.0.1:8765`.
Toolpath updates and exact B-rep updates are supported. B-rep updates replace local
face edits, preserve graph wiring and are coalesced per source. See
[Grasshopper setup and protocol](docs/grasshopper-live.md).

```json
{"paths":[{"order":0,"tool":0,"points":[[0,0,0.6],[10,0,0.6],[10,10,0.6]]}]}
```

## Tests and CI

```sh
npm test
npm run test:cad-native
npx playwright install chromium
npm run test:browser
```

For an existing system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.
Set `PATHLOOM_FRONTEND_DIR=desktop-dist` to browser-test packaged assets instead
of the development root. Tests use mocked AI/native/printer integrations and
never start a real print or make paid inference requests.

GitHub Actions runs JavaScript + browser tests, Python OCCT tests, and Rust tests
on macOS. A successful **main push** check gates Pages publication; Pages uploads
prepared frontend assets instead of the complete repository.

The native CAD runner bounds stdout, drains stderr, enforces a 25-second process
deadline and kills/reaps cancelled section requests. Worker/UI limits are 30
seconds. Completed exact workers and geometry buffers are reused; idle previews
render only after changes. Estimates cache immutable path lengths and transform
endpoints instead of copying entire point arrays for every instance.

## Architecture and history

- `app.js`: workspace/preview wiring and output integration.
- `toolpath-data.js`: shared file, settings, tool and export validation.
- `printer-profiles.js`: G-code templates and template migration.
- `cad-*.js`: graph, CAD, node UI, AI card/context, isolated code and workers.
- `src-tauri/src/`: native files, printer transport, Codex and bounded CAD processes.
- `native/`: exact OCCT operations and legacy USD compatibility.
- `legacy/`: archived Web + Bridge experiments, excluded from packaged assets.

[Maintenance results and remaining verification](docs/maintenance-progress.md)
include measured performance and local-only checks.
[AI CAD stage history](docs/ai-cad.md) records earlier implementations; later
sections supersede earlier limitations. [The error inventory](docs/error-inventory.md)
is a historical snapshot, not a current line-by-line specification.

Bundled upstream libraries and their licenses live under `vendor/`.

## Design review

The [design constitution](docs/app-design-constitution.md),
[ten-principle review](docs/constitution-review.md) and
[verification / remaining work](docs/maintenance-progress.md) distinguish tested
changes from local-macOS checks and follow-up design work.
