# AI CAD implementation stages

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

Execution validates graph references/types/versions, budgets, closed planar paths, nondecreasing nonnegative Z, and intersections within a layer. These checks do not prove printer clearance or support. No executable code is evaluated.

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
