// Clipper's browser build also runs in Node-based geometry tests.
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
// Node 20 has no navigator; importing the browser build as ESM bypasses its
// CommonJS detection. Leave the browser and newer Node's native object alone.
if (typeof globalThis.navigator === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  globalThis.navigator = {userAgent: 'Node.js', appName: 'Netscape'};
}
