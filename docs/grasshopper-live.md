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
