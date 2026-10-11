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

## Next stages

- Grasshopper live bridge / localhost connector
- Printer Profiles with Start / End G-code
- Filament Library persistence
- Sequential-print collision and gantry-clearance checks
- Project save/load and persistent state

## Run locally

Because the app uses ES modules, serve the folder over HTTP rather than opening `index.html` directly.

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
