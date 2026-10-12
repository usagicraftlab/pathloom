# Pathloom

Preview, color, arrange, and prepare custom 3D printing toolpaths.

Pathloom is now being developed primarily as a **local macOS desktop application**. GitHub remains the source/history repository, but the intended runtime is Pathloom Desktop rather than a hosted web app.

## Current workflow

- `＋ Add .toolpath` import with validation
- One `.toolpath` file = one source object
- Dynamic Three.js toolpath preview
- Tool color / Print order / Speed view modes
- Object → Tool print-setting hierarchy
- Instance duplication, placement and sequential print order
- Filament Library and Printer Profiles stored locally
- Generic G-code generation
- Tauri v2 desktop shell foundation
- macOS `.app` / `.dmg` bundle configuration

## Desktop architecture

```text
Grasshopper for Mac
    ↓ localhost / WebSocket (next stage)
Pathloom.app
├─ Toolpath preview / editing
├─ G-code generation
├─ Local file access
├─ Printer integration
└─ Local settings / credentials
    ↓
Prusa printer
```

The previous `Pathloom Web + Bridge` experiment remains in Git history, but it is no longer the primary architecture. `bridge-server.mjs`, `bridge-client.js`, `local-server.mjs`, and `prusalink-client.js` are currently retained only as migration references while their useful functionality is moved into the Tauri runtime.

## Run Pathloom on macOS

Requirements:

- macOS 12 or newer
- Node.js 20+
- Xcode Command Line Tools
- Rust stable toolchain

Install Apple's command line tools once:

```bash
xcode-select --install
```

Install Rust if needed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Clone the repository, then install JavaScript dependencies once:

```bash
npm install
```

Start the desktop development app:

```bash
npm start
```

or:

```bash
npm run mac:dev
```

Build Pathloom.app and a DMG installer:

```bash
npm run mac:build
```

Build only the DMG:

```bash
npm run mac:dmg
```

Tauri uses `scripts/desktop-dev-server.mjs` during development and `scripts/prepare-desktop.mjs` to create packaged frontend assets in `desktop-dist/` during builds. Build outputs and `desktop-dist/` are ignored by Git.

The current macOS bundle target is `.app` + `.dmg`, with `com.usagicraftlab.pathloom` as the bundle identifier. The runtime reports whether it is running on Apple Silicon or Intel Mac.

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

Each file represents one object. Multiple copies are project instances rather than duplicated path data inside the file.

## G-code note

The current generator outputs generic motion/extrusion G-code using:

`E = path length × print width × print height ÷ filament area × object E-rate × tool E-rate`

It uses relative extrusion (`M83`) and inserts numeric tool changes (`T0`, `T1`, etc.) when tool IDs are numeric.

**This is not yet printer-ready production G-code.** Printer-specific start/end G-code, temperatures, retraction, safe travel, collision/gantry clearance and other safeguards are still to be implemented in Printer Profiles / the desktop printer layer.

## Next desktop stages

1. Add Grasshopper for Mac live connection over localhost/WebSocket.
2. Move printer communication from the legacy local server/Bridge into Tauri native commands.
3. Move sensitive printer credentials into OS-protected local storage instead of browser storage or repository files.
4. Add printer status and Send to Printer workflow.
5. Add project save/load and persistent local state.
6. Add sequential-print collision and gantry-clearance checks.

## Ukigara Clock sample

Use **Load sample · Ukigara Clock** in the Objects panel. The bundled `samples/ukigara-clock.toolpath` contains model extrusion geometry converted from the supplied source G-code, centered in XY and retaining Z and tool IDs. Original extrusion amounts, speeds, temperatures, start/end commands, wiping and purge moves are not retained.

Three.js 0.170.0 and OrbitControls are bundled under `vendor/three/` from the integrity-verified npm package, with its MIT license.
