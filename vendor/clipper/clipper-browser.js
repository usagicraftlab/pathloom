// Keep shared geometry dependencies synchronous. Older WKWebView versions can
// stall when both application entry points share a top-level dynamic import.
import './clipper-env.js';
import './clipper.js';
const ClipperLib = globalThis.ClipperLib;
export default ClipperLib;
