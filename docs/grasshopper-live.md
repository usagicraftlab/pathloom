# Grasshopper live connection

Pathloom Desktop listens only on the local machine at:

```text
ws://127.0.0.1:8765
```

The connection is intended for Rhino / Grasshopper running on the same Mac. No LAN or internet access is required.

## Message format

Grasshopper sends one JSON message whenever its toolpath changes:

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

`source` is the stable identity of the Grasshopper object. Pathloom should keep the same Pathloom object and replace only its geometry when another `toolpath.update` arrives with the same `source`.

This allows Pathloom-side state to survive Grasshopper recomputes:

- instance placement
- duplicate count
- print order
- tool color / filament choice
- object and tool speed
- E-rate settings

Grasshopper remains responsible for **where the nozzle travels**. Pathloom remains responsible for **how that toolpath is previewed, configured and prepared for printing**.

## Validation

The desktop runtime currently rejects messages when:

- `type` is not `toolpath.update`
- `source` is empty
- `paths` is empty
- a path has fewer than two points
- XYZ points are not numeric arrays

Invalid messages are reported in Pathloom without stopping the local WebSocket server.

## Current implementation status

The macOS/Tauri runtime now starts the localhost WebSocket listener and forwards valid messages to the Pathloom UI as `grasshopper-toolpath-update` events. The UI shows whether Grasshopper is waiting, connected, or sending data.

The remaining integration step is binding these events directly to Pathloom's internal source state so repeated updates replace the source geometry instead of creating a new object.

## Security boundary

The listener binds to `127.0.0.1`, not `0.0.0.0`. It is therefore intentionally local-only. Pathloom does not need to expose a Grasshopper endpoint to the local network or internet.
