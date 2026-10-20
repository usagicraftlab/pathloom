const sendButton = document.getElementById('sendPrintBtn');
const statusLabel = document.getElementById('prusaStatus');
const toast = document.getElementById('toast');

let localReady = false;
let lastPrinterState = null;

function notify(message, kind = '') {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function normalizeState(payload) {
  const printer = payload?.printer?.printer || payload?.printer || {};
  return String(printer.state || printer.status || printer.state_text || '').trim();
}

function setConnection(ok, state = '') {
  localReady = ok;
  lastPrinterState = state || null;
  if (sendButton) {
    sendButton.disabled = !ok;
    sendButton.title = ok
      ? `PrusaLink connected${state ? ` · ${state}` : ''}`
      : 'Run Pathloom locally with npm start and configure local-config.json';
  }
  if (statusLabel) {
    statusLabel.textContent = ok
      ? `PrusaLink · ${state || 'connected'}`
      : 'PrusaLink · local mode unavailable';
  }
}

async function checkPrusaLink() {
  try {
    const configResponse = await fetch('./api/prusalink/config', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error(`config ${configResponse.status}`);
    const config = await configResponse.json();
    if (!config?.ok || !config?.apiKeyConfigured) throw new Error('not configured');

    const statusResponse = await fetch('./api/prusalink/status', { cache: 'no-store' });
    const status = await statusResponse.json().catch(() => null);
    if (!statusResponse.ok || !status?.ok) throw new Error(status?.error || `status ${statusResponse.status}`);
    setConnection(true, normalizeState(status));
  } catch {
    setConnection(false);
  }
}

async function sendAndPrint() {
  if (!localReady) {
    notify('PrusaLink is not connected', 'error');
    return;
  }

  if (!window.Pathloom?.generateGcode) {
    notify('Pathloom generator is not ready', 'error');
    return;
  }

  const stateText = lastPrinterState ? `\nPrinter state: ${lastPrinterState}` : '';
  if (!window.confirm(`Send Pathloom G-code to PrusaLink and start printing?${stateText}`)) return;

  const previousText = sendButton.textContent;
  sendButton.disabled = true;
  sendButton.textContent = 'Preparing…';

  try {
    const gcode = window.Pathloom.generateGcode();
    if (!gcode?.trim()) throw new Error('Generated G-code is empty');

    sendButton.textContent = 'Sending…';
    const response = await fetch('./api/prusalink/upload?filename=pathloom-output.gcode&print=1&overwrite=1', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: gcode
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const detail = result?.error || result?.response || `HTTP ${response.status}`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }

    notify('G-code sent. Print start requested.');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await checkPrusaLink();
  } catch (error) {
    console.error('Send & Print failed', error);
    notify(`Send & Print failed: ${error.message}`, 'error');
  } finally {
    sendButton.textContent = previousText;
    sendButton.disabled = !localReady;
  }
}

sendButton?.addEventListener('click', sendAndPrint);
checkPrusaLink();
const pollTimer = setInterval(checkPrusaLink, 10000);
window.addEventListener('beforeunload', () => clearInterval(pollTimer));
