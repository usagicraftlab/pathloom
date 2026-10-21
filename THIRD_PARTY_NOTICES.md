# Pathloom third-party software

Pathloom's new CAD interaction, document/history, command adapters and small
constraint solver are independently written for this project. No Rhino/Fusion
code, images, icons, help text or private APIs were used. Geometric algorithms
call the installed OCP/Open CASCADE runtime via its public bindings.

| Software | Version / source | License and retained text | Use |
| --- | --- | --- | --- |
| Three.js | bundled r170; github.com/mrdoob/three.js | MIT; vendor/three/LICENSE | Browser rendering |
| DXF parser | bundled source; github.com/gdsestimating/dxf-parser | MIT; vendor/dxf/LICENSE | Existing import |
| Clipper | bundled JS header; github.com/junmer/clipper-lib | Boost 1.0; vendor/clipper/LICENSE.txt | Existing planar operations |
| QuickJS / quickjs-emscripten | npm lock 0.32.0; github.com/justjake/quickjs-emscripten | MIT; vendor/quickjs/LICENSE | Existing isolated Component code |
| occt-import-js | bundled source; github.com/kovacsv/occt-import-js | LGPL 2.1 text; vendor/occt/LICENSE.occt-import-js.txt | Existing browser STEP preview |
| OCCT | OCP distribution 7.8.1.1 (exact OCCT version not exposed by binding); dev.opencascade.org | LGPL 2.1 with upstream exception; vendor/occt/LICENSE.occt.txt currently holds LGPL text | Exact native geometry, existing WASM geometry |
| OCP / cadquery-ocp | installed wheel 7.8.1.1; github.com/CadQuery/OCP | Apache 2.0 wrapper; actual wheel LICENSE retained in vendor/notices/OCP-LICENSE | Python binding, separately provisioned runtime |
| VTK | installed 9.3.1; vtk.org | BSD-style; actual wheel text in vendor/notices/VTK-LICENSE | Existing OCP runtime dependency; no new VTK application API use |
| Tauri and plugins | Cargo.lock / package-lock.json; github.com/tauri-apps | MIT OR Apache-2.0 as applicable | Native application and dialogs |
| Playwright | package-lock.json; github.com/microsoft/playwright | Apache-2.0 | Development tests only |

The asset packager retains the vendor license files and this notice. Python/OCP
is provisioned separately; it is not embedded in the .app by this change.
The wrapper's Apache license does not relicense OCCT or its binary dependencies.

Distribution audit remains open: reconcile exact OCCT/WASM source revisions,
obtain matching exception/notice texts, document source access and replacement /
rebuild instructions for LGPL artifacts, and inventory Cargo/Python transitive
binaries. This notice is not a completed redistribution clearance or a patent /
design-right search. No project-wide MIT license has been assigned by the agent.
