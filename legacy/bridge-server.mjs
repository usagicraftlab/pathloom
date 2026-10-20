import http from 'node:http';
import crypto from 'node:crypto';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PATHLOOM_BRIDGE_PORT || 8787);
const CONNECT_API = process.env.PATHLOOM_PRUSA_CONNECT_API || 'https://connect-mobile-api.prusa3d.com';
const CONNECT_TOKEN = process.env.PATHLOOM_PRUSA_CONNECT_TOKEN || '';
const CONNECT_PRINTER_UUID = process.env.PATHLOOM_PRUSA_CONNECT_PRINTER_UUID || '';

const pairingCode = String(Math.floor(100000 + Math.random() * 900000));
const bridgeTokens = new Set();

function corsHeaders(req) {
  const origin = req.headers.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Pathloom-Bridge-Token',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function sendJson(req, res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

async function readJson(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isAuthorized(req) {
  const token = req.headers['x-pathloom-bridge-token'];
  return typeof token === 'string' && bridgeTokens.has(token);
}

async function connectFetch(pathname, options = {}) {
  if (!CONNECT_TOKEN) throw new Error('Prusa Connect is not configured in Bridge');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${CONNECT_TOKEN}`);
  headers.set('Accept', 'application/json');
  return fetch(`${CONNECT_API.replace(/\/$/, '')}${pathname}`, { ...options, headers });
}

async function parseUpstream(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/bridge/status') {
      return sendJson(req, res, 200, {
        ok: true,
        bridge: {
          name: 'Pathloom Bridge',
          version: 1,
          paired: false
        },
        capabilities: {
          grasshopper: { available: false },
          prusaConnect: {
            available: true,
            configured: Boolean(CONNECT_TOKEN),
            printerConfigured: Boolean(CONNECT_PRINTER_UUID),
            listPrinters: Boolean(CONNECT_TOKEN),
            sendGcode: false,
            note: 'Prusa Connect upload is intentionally disabled until a stable supported upload/auth flow is available.'
          }
        }
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/bridge/pair') {
      const body = await readJson(req);
      if (String(body.code || '') !== pairingCode) {
        return sendJson(req, res, 401, { ok: false, error: 'Incorrect pairing code' });
      }
      const token = crypto.randomBytes(24).toString('base64url');
      bridgeTokens.add(token);
      return sendJson(req, res, 200, { ok: true, token });
    }

    if (url.pathname.startsWith('/api/bridge/') && !isAuthorized(req)) {
      return sendJson(req, res, 401, { ok: false, error: 'Bridge pairing required' });
    }

    if (req.method === 'GET' && url.pathname === '/api/bridge/prusa-connect/printers') {
      if (!CONNECT_TOKEN) return sendJson(req, res, 503, { ok: false, error: 'Prusa Connect is not configured in Bridge' });
      const upstream = await connectFetch('/api/v1/printers');
      const payload = await parseUpstream(upstream);
      return sendJson(req, res, upstream.status, { ok: upstream.ok, data: payload });
    }

    if (req.method === 'GET' && url.pathname === '/api/bridge/prusa-connect/printer') {
      if (!CONNECT_PRINTER_UUID) return sendJson(req, res, 503, { ok: false, error: 'PATHLOOM_PRUSA_CONNECT_PRINTER_UUID is not configured' });
      const upstream = await connectFetch(`/api/v1/printers/${encodeURIComponent(CONNECT_PRINTER_UUID)}/detail`);
      const payload = await parseUpstream(upstream);
      return sendJson(req, res, upstream.status, { ok: upstream.ok, data: payload });
    }

    if (req.method === 'POST' && url.pathname === '/api/bridge/prusa-connect/send') {
      return sendJson(req, res, 501, {
        ok: false,
        error: 'Prusa Connect G-code upload is not enabled yet. Pathloom Web never receives or stores Prusa credentials.'
      });
    }

    return sendJson(req, res, 404, { ok: false, error: 'Unknown Bridge endpoint' });
  } catch (error) {
    console.error(error);
    return sendJson(req, res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('Pathloom Bridge');
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log(`  Pairing code: ${pairingCode}`);
  console.log(`  Prusa Connect: ${CONNECT_TOKEN ? 'configured' : 'not configured'}`);
  console.log('');
  console.log('Prusa credentials remain inside this local Bridge process and are never returned to Pathloom Web.');
});
