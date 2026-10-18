import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {QuickJSFFI} from '@jitl/quickjs-wasmfile-release-sync/ffi';
import loader from '../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs';
import binary from '../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm';
export const createEngine=()=>newQuickJSWASMModuleFromVariant({type:'sync',importFFI:async()=>QuickJSFFI,importModuleLoader:async()=>options=>loader({...options,wasmBinary:binary})});
