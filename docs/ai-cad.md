# AI CAD implementation stages

> Historical implementation log. Earlier descriptions of the chat composer,
> Apply/Discard, missing native slicing, and NVIDIA requirements are superseded
> by later stages and the current [README](../README.md). The canvas-local AI
> workflow and maintenance results are in [maintenance-progress.md](maintenance-progress.md).

Based on the supplied `pathloom_ai_cad_design.docx`. The first requested generator is a section stacked with progressive rotation and scaling.

## Implemented first prototype (stage B)

- Generate → Generated object: a versioned data definition describes a section, stacking, twist/scale, and tool assignment.
- Height, layer height, total rotation, top scale, sampling and alternating tool count have numeric inputs and sliders.
- Closed polyline and closed Catmull–Rom control-point sections. XY point inputs and direct point creation/dragging on the 3D plane; input visibility is independent of output.
- Recalculation runs in a disposable module Worker with a five-second timeout, bounded input/point counts, and no evaluation of executable user code. The worker interprets only known operations and versions. It has no Tauri bridge.
- Generated geometry uses the existing source/instance, preview, tools, placement and G-code paths. Existing source settings are retained on updates.
- Closed planar paths, increasing layer Z, and a non-self-intersecting base section. Positive scaling and a rigid transform preserve a simple section within each layer. This does not check nozzle clearance, support/overhang or physical printability between layers.
- Invalid/pending generation retains the last visible result but blocks its G-code export and project save.
- Undo/redo for generator edits. Local app-data library stores immutable full-definition versions; JSON import/export and `.toolpath` export.
- Open, Save and Save as for `.pathloom` v1. Embedded geometry, full generator/curve definitions, instance placement and order, output tool settings, printer profile, basic settings, camera, selected layer and input visibility are snapshots. Opening does not restart live-file links. Credentials are not part of the format.
- Project validation happens before replacing the current workspace. Native saves use a same-directory temporary file and rename.

## Codex chat integration (stage C, bounded generator)

- Chat occupies the far-left column, with a separate Inputs column immediately to its right. Both use the same translucent island/header styles as Basic Settings. The generator Object dropdown is removed; new objects and selection in Objects/the viewport determine the editing target. Existing handles can be dragged without entering Edit mode. Base curve, library, additional parameters and connection/model settings collapse independently.
- Design chat uses the installed Codex App Server over stdio with ChatGPT sign-in. CLI discovery supports PATH and the VS Code extension bundle. The account is managed by local Codex; no token files are read or copied by Pathloom and no credentials are serialized into a project.
- Connect reads the actual account type, model catalog and rate-limit windows. The available mini/nano model is preferred; otherwise the catalog's default is used. A model catalog is not an inference entitlement guarantee.
- Browser sign-in uses the supported account/login/start flow. The local Codex account is shared with Codex CLI. Usage reset values are displayed only when returned, otherwise the UI links to the usage page.
- Only ChatGPT accounts are accepted. API-key environment variables are removed from the child process; no API-key fallback, credit purchase or limit reset endpoints are implemented. Missing/exhausted plan limits block generation. Standard service tier is requested.
- AI receives the current generator definition, request, limited recent conversation, relevant library definitions and constraints. It returns structured data, not executable code. Shell, connectors, plugins, multi-agent and web search are disabled for the integration. Client tool/approval requests are rejected.
- Each response is checked in a bounded Worker before automatically updating the processing graph. Late responses to changed inputs are not applied. Cancel stops the pending request. Request history is included in project snapshots.
- AI proposals can compose the versioned operations listed below and reuse saved operation snapshots. Arbitrary JavaScript and unknown operation types are rejected.
- Generated geometry and Basic Settings must agree on layer height before G-code export; the user is shown the required value on a mismatch.

References:
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth

## Remaining limitations

DXF and STEP files can be imported. DXF supports 2D LINE, (LW)POLYLINE, CIRCLE, ARC, ELLIPSE and SPLINE entities, converted into visible editable polyline curve inputs; units and elevation are currently treated as raw XY coordinates. Browser STEP import uses a WebAssembly Open CASCADE worker for display and Z slicing. Slice results may contain closed contours and open line paths; both are emitted as `.toolpath` paths.

Desktop builds also have an experimental native B-rep path. It reads STEP with Open CASCADE, stages the shape through NVIDIA's `occt_to_usd`, then asks `usd-brep` for CAD face descriptors and a display tessellation. Desktop users can click a rendered face to select it and Shift-click to add or remove faces; the selected surface is highlighted, and triangle-to-face mappings are saved in the project. Numeric X/Y face movement is implemented as a kernel operation: Pathloom sweeps each selected planar face boundary, then uses an exact B-rep Boolean union or difference to push or pull that face and stitch a new solid. The edited USD B-rep is kept in the application's local data directory, and the project stores its local asset ID so it can be reopened on the same installation. Movement is rejected for curved faces, faces with inner loops, and vectors tangent to the selected face; STEP export and kernel-backed slicing are not implemented yet. It requires CPython 3.12 with `cadquery-ocp` and NVIDIA `usd-brep`, plus a locally built `occt_to_usd` executable configured with `PATHLOOM_OCCT_TO_USD`; Python can be selected with `PATHLOOM_BREP_PYTHON`. This bridge is an integration prototype and STEP import requires its native dependencies and converter. Project files moved to another installation do not carry the local USD assets, so those shapes remain displayable but cannot be edited there until the STEP is reimported. The published Python wheel is for Windows and Linux; this repository's current desktop bundle targets macOS, where the native stack needs a source build. NVIDIA usd-brep supplies B-rep and USD functionality but is not a complete general-purpose CAD application or an arbitrary-code sandbox. Checks do not establish overhang support, collision clearance or printer-specific safety. Authentication uses the installed Codex CLI account rather than a separate bundled OAuth client. Printer testing and native dialog interaction require user verification.

### Curve processing components

Curve Boolean takes one or more closed planar curves in A and optionally in B. Its mode is Union, Difference (A minus B), Intersection or XOR; Union also works with only A. Curves are sampled and polygon-clipped locally with the vendored Clipper library at 0.0001 mm integer precision. Boolean contours are validated before they enter printable geometry. XOR or other results whose boundaries meet at a point can be rejected by the printability intersection check because they create zero-width connections.

Offset Curve expands or contracts closed contours with rounded joins. Positive distance expands outer boundaries; negative distance contracts them. Nested contours are normalized before offset so holes move in the opposite direction. Join / Close Curves connects selected open curves when endpoints fall within the tolerance and closes a loop only when the remaining ends also meet; it does not invent a long closing segment. Divide Curve emits evenly spaced point markers (closed curves omit the duplicate seam point); Evaluate Curve emits one marker per curve at normalized arc-length `t`. Point results are stage previews, not printable paths, and cannot yet connect to downstream geometry components.

## Verification

`npm test` covers deterministic generation, closure and planar increasing Z, twist and scale, multiple tools, invalid/self-crossing inputs, point limits, project JSON round trip and broken references. Browser verification also exercised the module Worker, repeated parameter changes, save/open with mocked native dialogs, and local library reuse. Native commands are checked with `cargo check --manifest-path src-tauri/Cargo.toml --offline --locked`. Browser checks additionally cover proposal preview/apply/discard, undo, stale replies, invalid proposals, cancellation and chat persistence using a mocked native bridge. A real App Server check verified ChatGPT account type, model listing and usage, then completed one structured CAD inference and validated the resulting definition. Native dialog interaction and actual printer testing are separate checks.

## Print parameter links

Each numeric input has a contextual chain menu to drive either Print width or Print height. Each print setting has at most one source parameter. Linked print inputs are disabled, show a chain icon and follow successful local/AI generator updates. Unlinking retains the most recent value and restores manual editing. Links reference a source ID and parameter key, persist in `.pathloom`, and are removed when their source is deleted. Projects with invalid links are rejected before loading.

## Multiple inputs, operation composition and reusable library

Version 2 definitions contain independently named/grouped curve, point, number and numeric-list inputs. The Inputs column lists these compactly and shows controls only for the selected input. Geometry can be hidden independently of generation. Curves and points support direct dragging; numbers support sliders, ranges, units and print-setting links. Referenced inputs cannot be deleted until disconnected.

The Processing section composes versioned sections, stack/loft, twist/scale, translate, radial wave, radial shells, repeat, tool assignment and merge operations. Parameters accept literals or compatible input references. Multiple sections can be stacked separately or interpolated with loft. Shell spacing is a radial displacement, not a precise normal offset. Existing version 1 definitions migrate without changing their generated paths.

Library items can store a complete generator or an individual operation with its referenced input snapshots. Names, descriptions, tags and kind filters support search. Saves create immutable revisions; reuse assigns fresh input IDs and reconnects the operation to the current output. Items support JSON import/export. Library references do not silently change when another revision is saved.

Execution validates graph references/types/versions, budgets, planar paths (open or closed), nondecreasing nonnegative Z, and intersections within a layer. These checks do not prove printer clearance or support. Code Components execute only in the isolated runtime described below.

The expanded implementation passes 19 unit tests and browser checks with mocked native dialogs and AI responses, including multiple inputs, operation composition, library reuse, project restoration and print links. A real remote inference for the new catalog remains untested: automatic approval review rejected transmission of the test definition/catalog without explicit approval of the destination and content.

## Processing-first interaction

The far-left column now presents ordered operation cards above the chat composer. Validated chat responses automatically update the processing graph and printable model; prose responses and Apply/Discard controls are hidden. Errors remain visible as status text. Each card previews its own stage in the viewport without changing the final printable output. Parameters expand inside the card and numeric controls edit either the referenced input or the literal value. Worker limits and stale-response checks still apply.

Inputs expose number sliders/values and lists directly in their rows. Right-click opens a dismissible contextual inspector for naming, grouping, curve details, ranges and print links. A parameter can link to either print width or print height; selecting one clears its other link. Manual Name/New/Undo/Redo/Add Input controls are hidden. AI may add typed inputs through the complete definition response.

Verified with 20 unit tests and a mocked browser flow covering automatic processing results, inline editing, right-click settings, mutually exclusive print links, stage previews, operation sliders and final-project persistence. This verification sends no external inference request.

## Native project menu and pinned previews

Open, Save and Save As are in the macOS File menu (Cmd+O, Cmd+S, Cmd+Shift+S). The top toolbar no longer shows these actions or Generate. Processing is available at startup and opens automatically for saved generators; the saved graph is recalculated locally when opening a project.

Each operation has an explicit Show through checkbox, exclusive across the graph. The checked stage stays pinned through edits and project saves; clearing it displays the final result. Stage preview does not replace printable output. While Processing is open, layer/path inspection sliders stay at their maxima. Parameter details use an arrow only, and parameter-source dropdowns have been removed.

Number/list inputs are hidden from Inputs unless explicitly exposed through a Processing parameter's right-click inspector. Both Processing parameters and Inputs use the expanded contextual inspector (name, range/unit where applicable, Show in Inputs and print links). AI updates preserve existing user exposure by ID and do not expose newly generated parameters automatically.

## Display cleanup

Parameters replaces the Inputs heading. Only explicitly exposed numeric/list controls appear there. Geometry visibility is opt-in from the corresponding Processing parameter's context inspector; an exposed curve or point is drawn in 3D and editable, with a global Show geometry inputs toggle near the viewport edge. Settings is available through the native menu, and Generate G-code is above Basic Settings. Geometry counts precede the print estimates. Stage-preview prose and the Final result header are removed. Scrollbars are hidden while scrolling remains available; locked 3D inspection sliders are hidden during Processing. Operation titles toggle their details using the same triangle convention as the other fold controls.

## Interactive display priority

No checked stage means the final output; unchecking cancels outstanding stage previews. Intermediate/display-only geometry uses normal tool colors and full opacity. Fold triangles are 14px and point downward when expanded.

Parameter edits schedule a reduced display graph on the next animation frame in a reusable Worker, coalescing pending edits to the latest definition. Display sections use at most 48 samples and stacks approximately 24 layers (more only to respect the 5mm layer-height bound), retaining total height. The full graph runs after 400ms without edits. Display approximations never enter project paths or G-code; pending/invalid exact generation keeps save/export blocked. Stale replies are discarded, lightweight workers have a 1.5-second timeout, and selection/project changes cancel outstanding display work.

## Workspace stages

Three icon tabs at the upper left switch a single left menu between AI generation (Processing/chat), parameter adjustment (explicitly exposed parameters) and output (Basic Settings, Objects, Layouts and G-code). The viewport, model, controls and chat state are shared rather than recreated. Output displays the final printable model, temporarily suspending intermediate previews; switching back restores the checked stage. Workspace mode persists in `.pathloom`, defaults to generation for generator projects and output for imported-only projects, and supports arrow-key tab navigation. Direct geometry editing is disabled in output mode.

## Processing flow and parameter links

Each operation card labels its geometry input(s) and output type/destinations. Parameter rows identify shared values and Print Settings references. Right-click a numeric/point/list parameter and open Parameter Link → component → compatible parameter to share one typed input; modifying either component updates both. Literal source values are promoted to a shared input. Unlink snapshots the current value for that parameter.

Print Settings is the first link submenu for numbers. Its seven numeric fields can drive generation; the dependent controls are read-only and follow output settings. Bindings persist as input metadata, update on project opening, and cannot drive Print Settings back through the existing reverse link control. Save/export rejects stale references on other objects until selected/recalculated. Compatible parameter links preserve the existing data-only graph and use no executable expressions.

## Versioned custom processing recipes

AI can define reusable components in `definition.recipes`. Each recipe declares an ID, immutable version, label, incoming geometry type (`paths` or `contours`), typed public parameters/defaults, an internal graph of known native operations, and a path output. Internal sources use `$input` for incoming geometry and `{parameter: key}` for public arguments. A regular instance references `recipe:<id>` and its exact version, with normal literal/input/Print Settings bindings.

Validation expands recipes into the same bounded, typed geometry graph before execution; native geometry/intersection checks still apply. Recipes cannot invoke code, nest other recipes, or hide recursive references. Limits are 16 embedded recipe versions, 16 internal steps and 24 public parameters per recipe, 32 outer operations and 256 expanded operations, with existing point/time budgets. This allows AI to redesign a composite algorithm using existing primitives; it does not add arbitrary new native geometry algorithms or JavaScript execution.

Explicit Save Component saves new custom components as immutable local library entries; subsequent AI edits of saved components create revisions, preserving referenced input snapshots and embedded recipe definitions. Revisions within one recipe ID share a library family. Same-version algorithm changes are rejected (independent of JSON key order); prior snapshots are retained. Reusing a saved version of the current terminal recipe swaps that instance's revision instead of stacking another copy of its geometry. Library export/import and `.pathloom` preserve recipe definitions, interfaces and pinned versions.

Verification includes native tests, recipe graph/typing/immutability/library tests, and a mocked browser flow creating a v1 bottom component, adjusting it, authoring v2, automatically saving both, rejecting an unversioned modification, saving the project and restoring v1. No real external inference was sent during this verification.

## Calling saved custom operations

In generation mode, right-click blank space in the Processing column and choose Add Component → Library → group → saved Component/version. The menu reads the current local library each time it opens. This action appends a new component instance; the project stores all instantiated components independently. Empty libraries show a short empty state.

Add Component also offers New Component with AI…, which focuses the chat composer with an editable custom-operation request. It does not submit or contact AI automatically in an explicit additive mode. Escape, clicking outside and changing workspace modes dismiss the context menu. Browser verification uses a mock AI response to exercise empty state, composer action, saved recipe creation, insertion, project save and dismissal.

## Editing an existing component with AI

Right-click a Component card → Edit with AI… to focus the composer with an explicit Editing target badge and an editable request. The target step ID and scoped-edit instructions accompany the next AI request. Clearing the badge returns to whole-workflow requests; changing the editing source or cancelling clears it. No request is sent by choosing the menu action.

Scoped responses preserve the selected step ID, graph output and ordering, other components and unrelated inputs. Shared values referenced by the selected component may update their linked consumers. Multi-step replacements are encapsulated in a custom recipe under the same component ID. Existing recipes require a new immutable version; new/revised custom definitions are automatically saved to the local library. Unrelated modifications are rejected before geometry is applied. Verification uses mocked responses for native parameter changes, unrelated-edit rejection, native-to-custom replacement and a custom v2 upgrade.

## Connected node editor

Generation now uses a pannable/zoomable node canvas beside the shared 3D view. Curves appear as input nodes, operations have typed geometry inputs and exactly one geometry output port, and a single Print output sink selects the graph's final path output. Merge exposes multiple path inputs through one output. Drag an output port onto an input (or click each port) to reconnect; dependency order is updated without changing node IDs. Incompatible types, duplicate merge sources and cycles are rejected. Required inputs/output cannot be left disconnected; connect another source to replace them. Selecting a wire and pressing Delete removes optional curve/merge connections when cardinality permits.

Nodes drag by their headings; blank-space dragging pans, the wheel zooms, and toolbar controls fit or arrange the graph. Input geometry can be configured from its node's right-click inspector. Parameter controls, preview checkboxes, Edit with AI and Add Node → Library remain available. Layout and view metadata persist in generator/project snapshots without recalculating printable geometry, and AI edits retain the user's layout. Layout-only changes do not invalidate in-flight AI responses. Worker results preserve newer layout edits.

Tests cover typed reconnection, dependency sorting, cycles, curves, merge branches, final output selection and layout validation. Browser verification exercises real port gestures, node dragging, zoom, project save/open, fold controls, preview checks and context menus with a mocked AI/native bridge.

## Components and groups

The node UI calls each operation a **Component**. The complete graph belongs to the
`.pathloom` project and is saved with File → Save; there is no separate Generator
versus Operation save choice. Existing library JSON continues to accept the legacy
`kind: operation` representation.

Right-click empty graph space → Add Component to browse Curve, Transform, Pattern,
Toolpath and Utility. The built-in catalog includes Circle, Ellipse, Rectangle,
Rounded rectangle, Polygon, Star, Rotate, Scale, Scale NU, Mirror X/Y, Resample,
Reverse, Curve seam, Rectangular array and Polar array, alongside the existing
Stack, Move, Linear array and toolpath processing components. Curve primitives
produce closed XY contours: connect their output to Stack. Generic transforms
accept either contours or stacked paths. Z-axis rotation preserves planar layers.

New Component with AI starts an additive request: existing nodes and inputs must
remain intact, and multiple internal steps are encapsulated in one custom recipe.
Right-click an existing node → Edit with AI to change that component instead.
Groups, names and library identity survive edits. A saved component receives a new
immutable library revision when AI changes its parameters or algorithm.

Right-click a node → Save Component… to choose its name and group (including a new
custom group). Existing saved nodes can update their family with a new version or
be saved independently. Reuse them from Add Component → Library → group.
Unsaved custom components are pale purple, saved and built-in components white,
and curve input nodes yellow. Project saving also retains unsaved custom recipes;
Component saving makes them reusable in other projects.

### Point inputs

Add Component → Point adds an independent geometry input with editable X/Y/Z on
the node. Its single output connects to Point parameter ports such as Circle
center or Rotate pivot. Shared coordinates use the existing typed input reference
format and persist with projects and saved Components. Disconnecting a Point wire
retains its current coordinates as a literal parameter. Point inputs are exposed
in the 3D view by default and support the existing drag interaction and Show
geometry inputs toggle. Point parameter ports and geometry source ports coexist.

### Floating graph and final Toolpath conversion

The generation panel overlays the full-size 3D viewport. It uses the same white
20% opacity / 5 px blur surface as other panels. Drag the right edge to resize;
the focused resize handle also accepts Left/Right keys. Width is remembered on
this device and clamped to the available window width.

New projects keep shape geometry in `definition.output` (`layers` or prepared
`paths`) and connect independent Tool rules through optional `definition.toolOutput`.
Print output has separate Geometry and Tool information ports and performs final
conversion. New graphs do not need a To Toolpath node. Existing saved
stack/assign-tool/to-toolpath graphs remain readable with their previous output.
Surface/Brep processing is not implemented; layers are sampled planar curves.

Tool assignment (`tool-info`) is a standalone Component with a Tool-ID sequence
(0–4) and By layer / By curve mode. By layer assigns the same Tool to all paths at
a given Z, including bottom rings. By curve follows geometry input order. The
rules are applied only at Print output; disconnecting its Tool input uses T0 for
new geometry (legacy path attributes are preserved when present).

Build Toolpath (`build-toolpath`) is optional and does actual path preparation:
change seam position, reverse direction while preserving the seam, and optionally
order curves by nearest start within each layer. It preserves planar closed paths
and accepts stacked geometry or existing paths. Nearest ordering is bounded to
2048 curves. Tool assignment is applied after this preparation.

### Graph navigation and fixed-size parameter editing

Right-drag pans the graph; a right-click without dragging opens the existing
context menu. Left-drag blank canvas draws a selection rectangle. Shift adds to
selection; dragging a selected node body moves the entire selection while
preserving relative positions. Middle-drag also pans, and Escape clears selection.
Selections are temporary; moved positions and the graph view persist normally.

Double-click the Component body to open a separate parameter panel at normal UI scale. A single click selects it; drag anywhere except connection dots and interactive controls to move it. Keyboard Enter/Space on the heading also opens parameters.
Opening details or editing parameters leaves node dimensions and port positions
unchanged. Click outside, use its close button, or press Escape to dismiss it.

### Typed port icons

Ports use colored SVG silhouettes instead of persistent text labels: crosshair
and dot for Point, multiple dots for Points, green Curve icons shared by editable, closed planar and stacked curves,
and a terracotta printing path. Number/List/Boolean
and generic geometry also have distinct icon definitions. Port names and types
remain in hover tooltips and accessible labels. Existing wires and the temporary
connection preview take their source port's type color, including while selected.

### Search and create from blank canvas

Double-click blank graph space to open the Component menu with its search field
focused. Right-click blank space opens the same searchable menu. Search matches
built-in names, operation IDs, descriptions, groups, Point/Curve inputs, and saved
library names/descriptions. Matching categories expand automatically; Enter adds
the first matching Component and Down focuses the first result. Create new
component remains available beside Add Component even when nothing matches.
Component action menus share the add menu's surface, typography, row padding and
hover styling. Import is not part of the graph context menu.


### Unified Curve geometry

Curve is the public geometry type for editable curves, sampled closed profiles and
curves at different heights. All use the same green port icon and `Shape (Curve)`
format; counts are attributes, not distinct types. The legacy serialized
`contours` / `layers` tags remain readable for dimension and compatibility handling.
New projects connect `input:<id>` directly into Stack; Sections is no longer a
required stage. Old Sections nodes are named Sample curve; Resample curve is an
optional explicit operation and preserves open/closed state.

Component details show count, closed/open state, XY-parallel planarity, and Z
range. Stack requires closed geometry at XY/Z=0; loft inputs need matching sample
counts. Printing requires closed planar curves with explicit Z coordinates.
Boolean inputs must be coplanar; Offset processes each height separately. Move
can lift a planar Curve in Z. These are geometric checks rather than user-facing
type distinctions. Generated Curves can feed collection parameters using
`step:<component-id>`; source references use `input:<input-id>` for editable Curves.
The explicit prefixes avoid collisions between input and Component IDs.

### Graph keyboard controls

In Generate mode, ⌘/Ctrl+A selects all nodes, ⌘/Ctrl+Shift+A clears the
selection, and Escape clears node/wire selection. Delete/Backspace removes the
selected wire or Components; required inputs must be reconnected first, and at
least one geometry Component must remain. ⌘/Ctrl+Z undoes a graph change and
⌘/Ctrl+Shift+Z redoes it. ⌘/Ctrl+K or ⌘/Ctrl+F opens Component search.
F fits the graph, Shift+F fits selected nodes, +/− zoom, and 0 resets zoom.
Arrow keys move selected nodes by one unit (Shift: ten); with no selection they
pan the canvas. Text fields retain their normal editing shortcuts. Default
Processing is generated on startup without a parameter edit or AI request.

### STEP Input and editable B-rep

Add Component → STEP Input imports exact Open CASCADE B-rep in Desktop. The
editable source, original B-rep, and face-edit history are embedded in the project;
triangulation and triangle-to-face IDs are only a display/slicing cache. Double-click
the node to replace its file. Click the STEP in 3D to select its entire object;
⌘+Shift-click toggles individual faces. ⌘+Shift-drag adds every intersecting
face in the rectangle, including occluded faces, across multiple STEP inputs. Selection displays an XYZ pivot. Drag an
axis arrow for a live mesh preview; releasing commits one native CAD operation.
Escape or pointer cancellation restores the original preview without an edit.
Object selection translates the whole B-rep. Closed solids currently support
planar-face push/pull along the face normal. Open B-reps keep shared boundaries: selected faces move, adjacent planar faces
are rebuilt using the moved shared vertices and re-sewn. A planar cap with curved
neighbors can stretch its connected component with an exact affine CAD transform,
keeping the far boundary fixed. Unsupported curved selected faces, inner loops,
non-planar neighboring polygons or collapsing transforms fail without detaching
faces. Shared mesh boundary vertices also follow during the disposable preview.
Failed operations keep the exact original shape. Graph undo/redo restores edits.

New STEP imports are centered in XY and translated onto Z=0 in the native B-rep,
not only in their display mesh. Later user transformations are preserved as-is.


Run `npm run cad:setup` once for the local Python 3.12 / cadquery-ocp 7.8.1.1 runtime.
It lives under ignored `.pathloom-runtime/`, separate from system Python. An
installed runtime can also be selected with `PATHLOOM_BREP_PYTHON`. Distributed
apps need that runtime provisioned; the CAD kernel is not embedded in the app
bundle yet. NVIDIA USD BRep commands remain separate/optional; this Intel Mac
uses OCCT B-rep directly, not NVIDIA USD. Browser-only import remains a clearly
identified mesh reference and requires Desktop reimport for face editing.

Connect Surface to Geometry → Slice STEP, then its Curve output to downstream
components or Print output. Desktop slicing computes sections directly from the
editable OCCT B-rep, joins CAD edges into wires, and samples curved edges with the
Tolerance parameter (default 0.02 mm). Lines retain only their endpoints; collinear
CAD edges are merged. Sections use the chosen layer interval, starting half a
layer above the minimum Z. Native failures are reported without falling back to
triangles. Legacy mesh-only inputs use approximate slicing with a visible warning.
The graph preserves the current B-rep coordinates, including user Z translations. Mesh-only inputs from earlier projects remain
readable. Standard Desktop import no longer depends on `occt_to_usd`.

### Directional views

The six bottom-right buttons show Top/Bottom/Front/Back/Left/Right with exact
orthographic projection. Zooming/panning retains orthographic projection. A right
rotation drag restores perspective while preserving framing. Free orbit permits
views below the bed. Face range selection works with both camera projections.

### Code Components

Create new component and Edit with AI can now define a new algorithm as a
versioned JavaScript Component. The AI receives `codeComponentFormat` alongside
the built-in catalog. Proposals are checked for graph scope, schemas and pinned
versions, then executed locally before application. A failed candidate is sent
back for one bounded correction; a second failure leaves the original graph
unchanged. Verification checks program execution and geometry, not print safety.

Code Components use `definition.recipes` with `code` and `returns`, in place of
internal `steps`. Instances still use `recipe:<id>` and a pinned `version`.
They preserve ordinary Component groups, parameter links and Library snapshots.
Code is saved inside the project and Library, so installed builds can use new
algorithms without rebuilding the application.

A code body receives `input`, `params`, and `cad`, and returns Curve arrays:

```js
return input.map(curve => ({
  ...curve,
  points: curve.points.map(([x, y, z = 0]) =>
    [x, y + params.amplitude * Math.sin(x / 10), z])
}));
```

For a Component with `accepts: "surface"`, `input` is `{type: "surface"}` and
`cad.section(params.layerHeight, params.tolerance)` returns sections of its
connected editable B-rep. That capability uses the existing native kernel; code
cannot call arbitrary OCCT operations or change the application itself. The
initial output types are Curve collections (`contours`, `layers`, `paths`, or
`curve`), with number/point/list/boolean parameters.

Double-click a code Component and open **Code · JavaScript** to inspect or edit
its body. **Validate & apply** runs the full graph before installing a new pinned
version; errors retain the current version. Other instances stay at their pinned
versions. Right-click **Save Component…** chooses its Library group as usual.

The bundled QuickJS WebAssembly interpreter has no file, network, DOM, desktop
IPC, host module loader or shell bindings. Each run gets a fresh context, a 64 MB
heap limit, a 750 ms interpreter deadline and a 256 KB stack limit. Output is
bounded to 300,000 finite points and coordinates within ±10,000 mm. CAD requests
are constrained to the connected B-rep's section API and handled outside the
interpreter. Graph workers retain the 30-second end-to-end timeout. Saved code
is revalidated and isolated on every run. Libraries/projects containing code
never execute it in the application JavaScript realm.

The vendored engine is built from quickjs-emscripten-core and the release-sync
variant using `npm run code:build`; no network is needed at runtime. Upstream
runtime controls: https://github.com/justjake/quickjs-emscripten .

### Lightweight AI context and graph patches

AI design requests now pass through `cad-ai-context.js`. Surface inputs retain
IDs and metadata, but mesh arrays, editable B-rep (including original/history
payloads), face maps and kernel fields stay in a local per-request vault. The AI
receives opaque `geometryRef` tokens plus dimensions, bounds and geometry counts.
Library candidates use the same treatment. Responses resolve only references
issued for that request; fabricated CAD payloads and unknown references are
rejected before normal graph validation. Applying a proposal checks the current
project stamp, so a stale reply cannot overwrite newer geometry.

The preferred response is a `pathloom-design-patch` (serialized in the existing
`definitionJson` response field): changed inputs/steps use `upsert`/`remove`,
recipes use versioned `upsert`, and output references are included only when
changed. Upserts preserve existing metadata; unchanged geometry, historical
recipes and editor layout remain local. Complete lightweight definitions remain
readable for compatibility. Both response forms pass the same scope checks,
version checks and isolated execution before application.

Context packing targets 140 KB beneath the native 150 KB guard. If necessary,
it removes optional history/Library suggestions, replaces large code bodies with
local `codeRef` tokens (prioritizing the selected Component's body), and drops
catalog descriptions. Validation retries use the same envelope and budget. If
the remaining logical graph/request still exceeds the budget, the UI explicitly
asks for a smaller edit instead of transmitting the full CAD data.

Saved Components appear directly alongside built-ins in their saved category
(e.g. Transform); there is no separate Library category in Add Component. New
AI Components are instructed to select an existing semantic category.

### Print output intro line

Double-click Print output to enable **Intro line** and edit Gap (mm), Length
(mm), and Direction (degrees). Defaults are disabled, 2.5 mm gap, 10 mm length,
and 0°. Direction points outward from the first curve start: 0° is +X, 90° is
+Y in object coordinates. The line prints from its outer end toward the object,
ending Gap millimetres before the start. The remaining gap is an ordinary travel
move with no extrusion. Instance rotation rotates the intro with the object.

Exactly one intro is inserted per object instance, before the first curve on
its lowest printed layer, using the same Z, Tool, speed and extrusion settings.
Other curves/layers are unchanged. It is generated after Tool assignment, so
by-curve color sequences are not shifted. It participates in geometry validation,
bed bounds, preview, time and filament estimates, project persistence, and
G-code export. Upstream Component previews omit this output-only addition.
Settings are stored in `definition.printOutput.intro` and may also be changed by
an AI graph patch; scoped edits to another Component preserve these settings.

### View cube and layer pauses

The bottom-right orientation cube tracks the camera. Click a visible face or any
of the six labeled arrows to switch to an orthographic Top/Bottom/Front/Back/Left/
Right view. Rotation dragging restores perspective as before. The six arrows
remain reachable even when the corresponding cube face is hidden.

In Print/Output mode, select an object and a layer, then right-click the vertical
layer slider to insert a pause **before** that layer starts. A pause marker appears
beside the slider; click it to select its layer, or right-click it to remove the
pause. The menu also removes all pauses for that object. Pause settings belong
to each placed instance and persist in `.pathloom` as `pauseLayers` (1-based layer
indices). Copies can have independent pauses. Layer indices remain fixed when
geometry is regenerated; export rejects markers beyond the new layer count, and
the menu can clear them. Pauses are emitted once per marked layer per instance,
before any of its print paths (including the first-layer intro, when applicable).

Prusa export inserts `;PAUSE_PRINT` and `M601`. User-controlled waiting time is not
included in duration estimates. Firmware behavior follows Prusa's pause command:
https://help.prusa3d.com/article/buddy-firmware-specific-g-code-commands_633112 .

### Continuous parameter edits

Parameter input updates and completed numeric generations retain their DOM controls; structural edits still rebuild the inspector. Visible input geometry is
rebuilt only if its geometry, visibility, placement or selection changed;
numeric edits do not recreate the imported STEP meshes. Redraw requests coalesce
per animation frame. Interactive preview jobs are throttled to an 80 ms minimum
interval, with one worker and only the latest pending values. Display graph
validation/simplification runs in the worker. Unchanged CAD payloads transfer once
per worker, then use worker-local references; preview replies omit definitions
and CAD payloads.

Full generation waits 800 ms after the last input, or 120 ms after releasing a
parameter slider. Holding a slider postpones full generation. Starting final
generation cancels its preview worker. Stale generation results remain rejected.
Export retains the pending/error gate until the latest full geometry validates.

Native sections use a shared, single-flight queue and content keys (SHA-256 when
Web Crypto is available). Requests for identical sections share a result. Worker
termination cancels its subscription and removes unstarted work with no remaining
subscribers. A running native process finishes; it is not forcibly terminated.
Interactive previews only reuse completed native sections rather than starting
new expensive CAD work. On a section cache miss the existing preview remains
visible until the final section is ready. Native results and worker-local geometry
caches are bounded. The kernel and final path validation are unchanged.

### Multiple print objects

Add Component → Toolpath → Print output adds another printer node. A printer
node’s context menu can duplicate or remove it; double-click opens Object name
and that object’s intro-line settings. Connect Shape and Tool assignment
independently for each object. Keep at least one Print output.

All output nodes share one processing graph evaluated once. Each output becomes
an object in Print Settings, with its own placement, instances, tool overrides
and layer pauses. Editing a shared upstream parameter updates every output.
Removing an output removes its object without changing remaining placements.

The existing output/toolOutput/printOutput fields represent the primary object;
printOutputs contains additional {id,name,source,toolSource?,intro?} objects.
Generation returns objects and retains paths for primary-output compatibility.
Projects store a shared generator graph once and use generatorRef for siblings,
with generatorGroup and generatorOutputId retaining stable object identity.

Slice STEP samples the center of each layer at modelMinZ + (n + 0.5) × layerHeight.
The resulting XY contour is printed at modelMinZ + (n + 1) × layerHeight,
independently of the sampling plane. Thus 0.6 mm layers sample at 0.3, 0.9,
1.5 mm and print at 0.6, 1.2, 1.8 mm. Mesh fallback uses the same rule.

When regeneration fails, cached print geometry is hidden until a valid result
is generated. Cached results are also blocked from export while regenerating.
Intro-line collisions report the Print output Direction/Gap/Length settings
explicitly instead of appearing as a general body-intersection failure.

The Processing graph allows negative node coordinates and unrestricted panning.
Dragging and keyboard nudges share this behavior; saved layouts retain their
positions, including Print output above its source. Auto-arrange is explicit.
Connection paths remain visible across the origin; Fit uses the actual bounds.

### PrusaLink from Desktop

Settings → Printer Connection stores the printer address, authentication mode,
username and storage in the app configuration directory. The initial address is
http://192.168.11.5 and storage is usb. API keys and Digest passwords are stored
in the system credential store (macOS Keychain), never in project JSON or browser
storage. An existing local-config.json is imported on first access. Leave the
secret field blank to retain a credential for the same address/auth/user; a new
address requires its own credential. Test connection can use unsaved fields.

Generate G-code and Send to Printer are separate, adjacent buttons. Send to Printer
opens a filename dialog with two adjacent actions: Transfer only and Transfer and
print. Clicking either action starts that command immediately; pressing Enter in
the filename field defaults to Transfer only.
G-code is generated on confirmation using the same exporter as local file saves.
The Desktop Rust runtime checks printer status and storage, sends PUT to the v1
file endpoint with Overwrite: ?0, and emits printer-upload-progress events. A
100% transfer bar means bytes were submitted; success waits for the printer's
HTTP response. Interrupted PUTs are not automatically retried. Check the printer
before retrying an uncertain transfer. Read-only/unavailable storage, rejected
authentication, filename conflicts and printer errors are shown in the dialog.
Closing is allowed before transfer and after an error, but disabled during PUT.

The connection UI uses printer_connection_get/save/test and
printer_upload_gcode Tauri commands. Read/save replies contain only connection
metadata and hasCredentials. HTTP redirects are disabled, LAN requests bypass
HTTP proxies, and errors omit credentials and raw printer responses. UI tests use
mock IPC; Rust tests use a local HTTP server and an in-memory credential vault.
Actual upload/print operation requires a reachable printer and valid credentials.

### Typed code Components

Code Components may return Curve collections, Point collections (`returns: "points"`,
value `[[x,y,z], ...]`), a finite `number`, a numeric `list`, a `boolean`, or
`tool-info` (`{sequence: [0,1], mode: 0}`). The output type is checked by the isolated
runtime and preserved through versioning and library saves. A primary input can
accept these types; Point input nodes provide a one-element Point collection.

For independent Curve inputs (for example, closest points between curves A and B),
use named `curves` parameters with empty-array defaults. Instance values contain
raw input IDs or `step:<id>` references. The runtime resolves these to actual Curve
collections in `params`, and the node editor exposes each as a wired Curve port.
Existing native multi-Curve operations retain their own input semantics.

Construction Curve coordinates need only be finite; they can be nonplanar,
negative in Z, or self-intersecting. Stage previews and AI proposal checks do not
apply print constraints. Print output still validates printable paths. Keep its
connection unchanged when adding Point or numeric construction Components.
Scalar/list stage previews show their values in the processing status.

Memory, execution-time, payload and point-count budgets remain in place. Custom
code still cannot access the network, filesystem or application APIs. Surface
creation/editing requires native CAD capabilities; arbitrary code cannot fabricate
an editable B-rep from a JavaScript object.

### Disconnected Components

New Components added through the menu, Library, or AI are placed without geometry
connections and preserve Print output. Nodes with missing required inputs use
`pendingInputs: true` and wait until the user connects their ports. Waiting nodes
and downstream branches produce no stale geometry; the rest of the graph remains
usable. Disconnected Print output stores a null geometry source and exports no paths.
These states persist in project files and support undo/redo.

Select a wire and press Delete/Backspace, or double-click the wire, to disconnect
it. Option-click an input port to remove all its incoming wires. Required inputs,
Merge inputs and Print output geometry can all be disconnected and reconnected.
