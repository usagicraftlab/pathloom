# Pathloom distribution, source and rebuild guide

This directory is copied into `desktop-dist` and therefore into the Tauri app
resources. `THIRD_PARTY_NOTICES.md` is the human-readable notice; the JSON and
lock files here are the machine-readable inventory. This is an engineering
inventory, not legal advice or a patent/design-right clearance.

## CAD runtime deployment

Pathloom does not embed CPython, OCP or VTK in the `.app`. Run `npm run
cad:setup` from the source tree to provision the ignored
`.pathloom-runtime/python` environment. The installer uses Python 3.12, syncs
the hash-locked packages in `cad-runtime-requirements.lock`, and runs
`scripts/verify-cad-runtime.py`. Set `PATHLOOM_BREP_PYTHON` to move the runtime
outside the source tree. Runtime discovery order is recorded in
`runtime-manifest.json`; it matches the Rust supervisor and bridge.

To reproduce the lock after intentionally changing `cad-runtime-requirements.in`:

```sh
uv pip compile --python-version 3.12 --generate-hashes \
  distribution/cad-runtime-requirements.in \
  -o distribution/cad-runtime-requirements.lock
npm run distribution:verify
```

The lock includes OCP/VTK's Python transitive dependencies for every supported
wheel platform. The actual runtime must report cadquery-ocp 7.8.1.1.post1, OCP
7.8.1.1 and VTK 9.3.1 and complete a real box B-rep probe.

## Browser STEP reader source and replacement

The separately loaded files in `vendor/occt` are identified by SHA-256 in
`artifact-manifest.json`. The JS/WASM pair corresponds to upstream
`occt-import-js` 0.0.23 at commit
`c2148e54b456b571238d35cac037d304053d64b2`; that source pins OCCT 7.6.1 at
commit `d2abb6d844231cb8f29be6894440874a4700e4a5`. Upstream builds it with
Emscripten 3.1.69. Obtain complete corresponding source with submodules:

```sh
git clone https://github.com/kovacsv/occt-import-js.git
cd occt-import-js
git checkout c2148e54b456b571238d35cac037d304053d64b2
git submodule update --init --recursive
test "$(git -C occt rev-parse HEAD)" = d2abb6d844231cb8f29be6894440874a4700e4a5
```

On Windows, follow the pinned upstream scripts:

```bat
tools\setup_emscripten_win.bat
tools\build_wasm_win_release.bat
```

They install Emscripten 3.1.69 and produce `occt-import-js.js` and
`occt-import-js.wasm`. A rebuild is not expected to be byte-identical. Replace
the two files together, update their hashes and source commits in
`artifact-manifest.json`, then run `npm run distribution:verify`, the complete
JS/native/browser suites, and CI. The pair is loaded as replaceable files rather
than statically merged into Pathloom JavaScript.

## Application source rebuild

Install the Node version required by `package.json`, run `npm ci`, provision the
CAD runtime, verify the inventory, and build Tauri:

```sh
npm ci
npm run cad:setup
npm run distribution:verify
npm test
npm run test:cad-native
npm run test:browser
npm run mac:build
```

JavaScript dependency versions are fixed by `package-lock.json`; Rust dependency
versions and checksums are fixed by `src-tauri/Cargo.lock`. `mac:build` requires
the Rust and Apple toolchains. Actual Finder launch, native dialogs and app/DMG
acceptance remain the separately tracked Issue #37.
