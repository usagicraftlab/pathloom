# Pathloom third-party software

Pathloom's new CAD interaction, document/history, command adapters and small
constraint solver are independently written for this project. No Rhino/Fusion
code, images, icons, help text or private APIs were used. Geometric algorithms
call the installed OCP/Open CASCADE runtime via its public bindings.

| Software | Version / source | License and retained text | Use |
| --- | --- | --- | --- |
| Three.js | bundled r170; github.com/mrdoob/three.js | MIT; vendor/three/LICENSE | Browser rendering |
| DXF parser | bundled artifact identified by `distribution/artifact-manifest.json`; github.com/gdsestimating/dxf-parser | MIT; vendor/dxf/LICENSE | Existing import |
| Clipper | bundled 6.4.2; github.com/junmer/clipper-lib | Boost 1.0; vendor/clipper/LICENSE.txt | Existing planar operations |
| QuickJS / quickjs-emscripten | npm lock 0.32.0; github.com/justjake/quickjs-emscripten | MIT; vendor/quickjs/LICENSE | Existing isolated Component code |
| occt-import-js | bundled 0.0.23, commit `c2148e54b456b571238d35cac037d304053d64b2`; github.com/kovacsv/occt-import-js | LGPL 2.1; vendor/occt/LICENSE.occt-import-js.txt | Existing browser STEP preview; replaceable JS/WASM pair |
| OCCT | browser reader: 7.6.1 commit `d2abb6d844231cb8f29be6894440874a4700e4a5`; OCP runtime reports 7.8.1.1 | LGPL 2.1 plus Open CASCADE exception; vendor/occt/LICENSE.occt.txt and vendor/occt/OCCT_LGPL_EXCEPTION.txt | Browser and exact native geometry |
| OCP / cadquery-ocp | hash-locked wheel 7.8.1.1.post1; github.com/CadQuery/OCP | Apache 2.0 wrapper; wheel LICENSE retained in vendor/notices/OCP-LICENSE | Python binding, separately provisioned runtime |
| VTK | installed 9.3.1; vtk.org | BSD-style; actual wheel text in vendor/notices/VTK-LICENSE | Existing OCP runtime dependency; no new VTK application API use |
| Tauri and plugins | Cargo.lock / package-lock.json; github.com/tauri-apps | MIT OR Apache-2.0 as applicable | Native application and dialogs |
| Playwright | package-lock.json; github.com/microsoft/playwright | Apache-2.0 | Development tests only |

The asset packager retains the vendor license files, this notice, the hash-locked
Python inventory and `distribution/SOURCE_AND_REBUILD.md`. Python/OCP is
provisioned separately; it is not embedded in the `.app`. The wrapper's Apache
license does not relicense OCCT or its binary dependencies. Exact JavaScript and
Rust transitive versions remain available in `package-lock.json` and
`src-tauri/Cargo.lock`; exact Python transitive versions and wheel hashes are in
`distribution/cad-runtime-requirements.lock`.

The engineering distribution audit for the artifacts Pathloom ships or
provisions is recorded in `distribution/artifact-manifest.json` and the source /
rebuild guide. This notice is not legal advice, a patent/design-right search, or
a certification for a future distributor's signing/notarization/channel terms.
No project-wide MIT license has been assigned by the agent.
