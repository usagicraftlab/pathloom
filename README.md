# Pathloom

Preview, color, arrange, and prepare custom 3D printing toolpaths.

## Implemented core workflow

- Project-level print settings: printer, print width, print height, filament diameter, print speed, travel speed
- `＋ Add .toolpath` import with validation
- One `.toolpath` file = one source object
- Object → Tool hierarchy
- Object-level Print speed and E-rate multiplier
- Tool-level speed override and E-rate multiplier
- Fast persistent filament-color palette for rapid visual comparison
- Dynamic 3D preview from imported XYZ paths
- Layer and cumulative path scrubbers
- Tool color / Print order / Speed view modes
- Instance duplication and deletion
- Sequential print-order drag-and-drop
- Auto arrange plus manual X / Y / rotation editing
- Generic G-code generation using imported path geometry and project/object/tool settings
- Local PrusaLink bridge foundation
- GitHub Pages deployment

## `.toolpath` format

Pathloom currently accepts JSON saved as `.toolpath` or `.json`.

```json
{
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

Each file represents one object. Multiple copies are handled as project instances rather than by duplicating path data inside the file.

## G-code note

The current generator outputs generic motion/extrusion G-code using:

`E = path length × print width × print height ÷ filament area × object E-rate × tool E-rate`

It uses relative extrusion (`M83`) and inserts numeric tool changes (`T0`, `T1`, etc.) when tool IDs are numeric. Printer-specific start/end G-code, temperature handling and machine-specific safeguards belong in Printer Profiles and are not yet applied automatically.

## Local printer mode

Pathloom is moving toward a local-first printer connection. The included `local-server.mjs` serves Pathloom and proxies requests to PrusaLink on the same LAN. The PrusaLink API key remains in a local file and is never served to browser JavaScript.

Requirements: Node.js 20 or newer, and a Prusa printer with PrusaLink enabled.

1. Clone the repository.
2. Copy `local-config.example.json` to `local-config.json`.
3. Set your printer's local PrusaLink URL/IP and API key in `local-config.json`.
4. Run:

```bash
npm start
```

5. Open:

```text
http://127.0.0.1:8000
```

`local-config.json` is ignored by Git so the API key is not committed.

The local bridge currently provides:

- `GET /api/prusalink/config` — local connection configuration without exposing the API key
- `GET /api/prusalink/status` — printer/job telemetry through PrusaLink
- `POST /api/prusalink/upload?filename=...&print=1` — upload G-code to USB storage and optionally start printing immediately

The next UI step is wiring Pathloom's generated G-code directly to this upload endpoint as **Send & Print**, so no intermediate file selection is required.

## Next stages

- Wire generated G-code directly to local PrusaLink `Send & Print`
- Grasshopper live bridge / localhost connector
- Printer Profiles with Start / End G-code
- Sequential-print collision and gantry-clearance checks
- Project save/load and persistent state

## Run locally without printer integration

Because the app uses ES modules, it can also be served with a basic HTTP server when printer integration is not needed.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Ukigara Clock sample

Use **Load sample · Ukigara Clock** in the Objects panel. The bundled
`samples/ukigara-clock.toolpath` contains model extrusion geometry converted
from the supplied `6hontai_clock.gcode`, centered in XY and retaining Z and tool IDs.
Start/end commands, nozzle wiping and purge moves are excluded. Original extrusion
amounts, speeds and temperatures are not retained. Generating G-code from this
sample uses the current Pathloom settings; it does not reproduce the original print file.

Three.js 0.170.0 and OrbitControls are bundled under `vendor/three/` from the
integrity-verified npm package, with its MIT license. The app requires no CDN
requests at runtime. The initial camera looks from the front-left above the XY
plate: X runs down-right, Y up-right into depth, and Z upward.
