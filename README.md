# Pathloom

Preview, color, arrange, and prepare custom 3D printing toolpaths.

## Current prototype

This first implementation focuses on the browser UI and interaction model:

- Project-level basic print settings
- Object → Tool hierarchy
- Fast tool-color preview with a persistent color palette
- Per-tool Print speed and E-rate multiplier accordions
- Object Settings / Print Order / Arrange tabs
- Sequential print order drag-and-drop
- Auto-arrange prototype
- Three.js 3D toolpath preview
- Layer and path scrubbers
- View modes for Tool color / Print order / Speed

The current `Generate G-code` button exports a small prototype metadata file only. Full Toolpath import, Grasshopper live connection, collision checks, printer profiles, and real G-code generation are planned next.

## Run locally

Because the app uses ES modules, serve the folder over HTTP rather than opening `index.html` directly.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
