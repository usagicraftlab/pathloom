import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const CONFIG_PATH = path.join(__dirname, 'local-config.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.toolpath': 'application/json; charset=utf-8',
  '.gcode': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

async function loadConfig() {
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const baseUrl = String(raw.prusalink?.baseUrl || '').replace(/\/$/, '');
    const apiKey = String(raw.prusalink?.apiKey || '');
    const storage = String(raw.prusalink?.storage || 'usb').replace(/[^a-z0-9_-]/gi, '') || 'usb';
    if (!baseUrl || !apiKey) throw new Error('Missing prusalink.baseUrl or prusalink.apiKey');
    return { baseUrl, apiKey, storage };
  } catch (error) {
    throw new Error(`local-config.json is not ready: ${error.message}`);
  }
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

async function readBody(req, maxBytes = 100 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function prusaFetch(config, pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Api-Key', config.apiKey);
  return fetch(`${config.baseUrl}${pathname}`, { ...options, headers });
}

async function handleApi(req, res, url) {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    return json(res, 503, { ok: false, error: error.message });
  }

  if (req.method === 'GET' && url.pathname === '/api/prusalink/config') {
    return json(res, 200, {
      ok: true,
      mode: 'local-prusalink',
      baseUrl: config.baseUrl,
      storage: config.storage,
      apiKeyConfigured: Boolean(config.apiKey)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/prusalink/status') {
    try {
      const upstream = await prusaFetch(config, '/api/v1/status');
      const text = await upstream.text();
      let payload;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
      return json(res, upstream.status, { ok: upstream.ok, status: upstream.status, printer: payload });
    } catch (error) {
      return json(res, 502, { ok: false, error: `Could not reach PrusaLink: ${error.message}` });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/prusalink/upload') {
    try {
      const filenameRaw = url.searchParams.get('filename') || 'pathloom-output.gcode';
      const filename = path.basename(filenameRaw).replace(/[^a-zA-Z0-9._-]/g, '_');
      const printAfterUpload = url.searchParams.get('print') === '1';
      const overwrite = url.searchParams.get('overwrite') !== '0';
      const body = await readBody(req);
      if (!body.length) return json(res, 400, { ok: false, error: 'G-code body is empty' });

      const remotePath = `/api/v1/files/${encodeURIComponent(config.storage)}/${encodeURIComponent(filename)}`;
      const upstream = await prusaFetch(config, remotePath, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/x.gcode',
          'Content-Length': String(body.length),
          'Print-After-Upload': printAfterUpload ? '?1' : '?0',
          'Overwrite': overwrite ? '?1' : '?0'
        },
        body
      });
      const text = await upstream.text();
      return json(res, upstream.status, {
        ok: upstream.ok,
        status: upstream.status,
        filename,
        printAfterUpload,
        response: text || null
      });
    } catch (error) {
      return json(res, 502, { ok: false, error: `Upload failed: ${error.message}` });
    }
  }

  return json(res, 404, { ok: false, error: 'Unknown local API endpoint' });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const relative = pathname.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, relative);
  if (!filePath.startsWith(path.resolve(__dirname) + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (path.basename(filePath) === 'local-config.json') {
    res.writeHead(403); return res.end('Forbidden');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/prusalink/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { ok: false, error: error.message });
    else res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pathloom local: http://127.0.0.1:${PORT}`);
  console.log('PrusaLink credentials stay in local-config.json and are never served to the browser.');
});
