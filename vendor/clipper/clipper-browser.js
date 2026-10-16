if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
await import('./clipper.js');
const ClipperLib=globalThis.ClipperLib;
export default ClipperLib;
