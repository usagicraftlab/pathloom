# Grasshopper live connection

Pathloom Desktop listens only on the local machine at:

```text
ws://127.0.0.1:8765
```

The connection is intended for Rhino / Grasshopper running on the same Mac. No LAN or internet access is required.

## Recommended Grasshopper setup

Use one C# Script component with these inputs:

- `Curves` — Curve, List Access
- `Tools` — int, List Access
- `Source` — string, Item Access
- `Label` — string, Item Access
- `Step` — double, Item Access
- `Send` — bool, Item Access

Output:

- `Status` — string

Paste `examples/grasshopper/PathloomSender.cs` into the C# Script body.

The sender converts the Grasshopper curve list directly into Pathloom's live toolpath format:

```text
Curve list order -> path order
Tools             -> tool ID
Curve geometry    -> XYZ points
```

Polyline curves keep their vertices. Other curves are sampled at approximately `Step` millimeters.

`Tools` may contain either one value, applied to every curve, or one value for each curve.

Keep `Source` unchanged between recomputes, for example `gh-live-1`. Pathloom then updates the existing source geometry instead of creating another object.

With `Send = true`, Grasshopper recomputes will send the current geometry to Pathloom automatically. Use `Send = false` while editing the definition if you do not want updates sent.

## Message format

The sender generates a message equivalent to:

```json
{
  "type": "toolpath.update",
  "source": "gh-live-1",
  "label": "Grasshopper Live",
  "paths": [
    {
      "order": 0,
      "tool": 0,
      "points": [[0, 0, 0.2], [10, 0, 0.2], [10, 10, 0.2]]
    },
    {
      "order": 1,
      "tool": 1,
      "points": [[10, 10, 0.2], [20, 10, 0.2]]
    }
  ]
}
```

`source` is the stable identity of the Grasshopper object. When another `toolpath.update` arrives with the same `source`, Pathloom replaces that source's geometry while preserving Pathloom-side state where possible:

- instance placement
- duplicate count
- print order
- tool color / filament choice
- object and tool speed
- E-rate settings

Grasshopper remains responsible for **where the nozzle travels**. Pathloom remains responsible for **how that toolpath is previewed, configured and prepared for printing**.

## Validation

The desktop runtime rejects messages when:

- `type` is not `toolpath.update`
- `source` is empty
- `paths` is empty
- a path has fewer than two points
- XYZ points are not numeric arrays

Invalid messages are reported in Pathloom without stopping the local WebSocket server.

## Security boundary

The listener binds to `127.0.0.1`, not `0.0.0.0`. It is therefore intentionally local-only. Pathloom does not expose the Grasshopper endpoint to the local network or internet.

## Live B-rep input (Rhino → Pathloom)

This is separate from the curve/toolpath sender above. B-reps remain editable CAD
geometry inside Pathloom. Rhino is authoritative; later GH geometry changes
replace Pathloom-side face edits. Nothing is written back into Rhino.

1. Start Pathloom Desktop (`npm start`). The native CAD runtime must be installed
   (`npm run cad:setup`, already set up on this machine).
2. In Grasshopper, add a **C# Script** component and configure its inputs:

   | Name | Type hint | Access | Value |
   | --- | --- | --- | --- |
   | `Breps` | Brep | List | Referenced Rhino B-rep(s) or GH-generated B-reps |
   | `Source` | string | Item | `gh-brep-1` |
   | `Label` | string | Item | e.g. `Rhino form` |
   | `Send` | bool | Item | Boolean Toggle = True |

3. Rename one output to `Status`. Paste the body from
   [PathloomBrepSender.cs](../examples/grasshopper/PathloomBrepSender.cs) inside
   `RunScript` (not in the additional-code area). Default namespaces are not
   required by this script.
4. Each GH solution sends the latest exact B-reps. Pathloom creates a Rhino input
   automatically on the active graph. Alternatively, add **Rhino B-rep Input**
   from Add Component first. Its default Source is `gh-brep-1`; double-click to
   configure a different binding. Use a different stable Source per sender.
5. Connect its Surface output to **Slice STEP**, then Curve processing / Print
   output. Subsequent updates preserve input IDs, node layout and these wires.

The bridge is local-only (`ws://127.0.0.1:8765`). Export uses a temporary headless
Rhino document, leaving the active document unchanged. Rhino units are converted
to millimetres and Rhino world coordinates are preserved; live inputs are not
recentered on every update. Standard file STEP imports still center onto the bed.

Updates follow GH solutions, not Rhino's transient drag-preview frames. In Rhino,
reference the geometry through a GH Brep parameter so edits trigger a solution.
Keep Send=True; turning it off pauses sending and retains the last geometry.
An empty Breps list sends `brep.clear`, emptying the bound input; downstream slicing
then reports missing geometry instead of exporting stale paths. Invalid B-reps
are not exported and leave the previous geometry intact.

Native conversions run outside the UI. Pending changes are coalesced per Source;
only the latest complete conversion is applied. Geometry and binding are saved
inside `.pathloom`; reopening offline retains the last exact B-rep. Live messages
apply to the active graph. Incoming updates use the sender's Source, not a file
path. Maximum live STEP: 16 MB; cached sources: 32 / 64 MB total. The UI replays
native cached updates after a reload.

Protocol:

```json
{"type":"brep.update","source":"gh-brep-1","label":"Rhino form","step":"ISO-10303-21; ... END-ISO-10303-21;"}
{"type":"brep.clear","source":"gh-brep-1"}
```
