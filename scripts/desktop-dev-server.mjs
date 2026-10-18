import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = 1420;
const allowedRootFiles = new Set(['index.html', 'app.js', 'print-time.js', 'print-intro.js', 'gcode-metadata.js', 'cad-kernel.js', 'cad-pipeline.js', 'cad-components.js', 'cad-library.js', 'cad-input-ui.js', 'cad-graph.js', 'cad-node-editor.js', 'cad-worker.js', 'cad-ui.js', 'cad-gizmo.js', 'cad-face-selection.js', 'cad-chat.js', 'pathloom-project.js', 'dxf-import.js', 'step-import.js', 'gh-brep-live.js', 'cad-ai-context.js', 'cad-code-runtime.js', 'cad-worker-client.js', 'step-geometry.js', 'step-slice-worker.js', 'style.css', 'desktop-client.js']);
const allowedDirs = ['samples', 'vendor'];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.toolpath': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function resolveAllowed(urlPath) {
  const clean = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath).replace(/^\/+/, '');
  if (allowedRootFiles.has(clean)) return path.join(root, clean);
  if (allowedDirs.some(dir => clean === dir || clean.startsWith(`${dir}/`))) return path.join(root, clean);
  return null;
}

function transformDesktopModule(filePath, body) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, '/');
  if (relative === 'vendor/three/OrbitControls.js') {
    return Buffer.from(body.toString('utf8').replace("from 'three';", "from './three.module.js';"));
  }
  return body;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const filePath = resolveAllowed(url.pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    const rawBody = await readFile(filePath);
    const body = transformDesktopModule(filePath, rawBody);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, host, () => {
  console.log(`Pathloom desktop dev UI: http://${host}:${port}`);
});
