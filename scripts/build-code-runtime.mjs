import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['scripts/quickjs-entry.mjs'],outfile:'vendor/quickjs/runtime.js',bundle:true,format:'esm',platform:'browser',target:'es2020',loader:{'.wasm':'binary'},minify:true});
await copyFile('node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE','vendor/quickjs/LICENSE');
