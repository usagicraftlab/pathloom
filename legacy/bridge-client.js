const BRIDGE_BASE = 'http://127.0.0.1:8787';
const statusLabel = document.getElementById('bridgeStatus');
const pairButton = document.getElementById('bridgePairBtn');
const sendButton = document.getElementById('sendPrintBtn');
const toast = document.getElementById('toast');

let bridgeOnline = false;
let bridgeToken = sessionStorage.getItem('pathloom.bridgeToken') || '';
let bridgeCapabilities = null;

function notify(message, kind = '') {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function bridgeHeaders() {
  return bridgeToken ? { 'X-Pathloom-Bridge-Token': bridgeToken } : {};
}

function updateUi() {
  const connect = bridgeCapabilities?.prusaConnect;
  if (statusLabel) {
    if (!bridgeOnline) statusLabel.textContent = 'Bridge · not connected';
    else if (!connect?.configured) statusLabel.textContent = 'Bridge · connected · Prusa Connect setup required';
    else if (connect?.sendGcode) statusLabel.textContent = 'Bridge · connected · Prusa Connect ready';
    else statusLabel.textContent = 'Bridge · connected · Prusa Connect linked';
  }

  if (pairButton) {
    pairButton.hidden = !bridgeOnline || Boolean(bridgeToken);
  }

  if (sendButton) {
    const ready = Boolean(bridgeOnline && bridgeToken && connect?.sendGcode);
    sendButton.disabled = !ready;
    sendButton.title = ready
      ? 'Send generated G-code to Prusa Connect through Pathloom Bridge'
      : !bridgeOnline
        ? 'Start Pathloom Bridge to enable local integrations'
        : !bridgeToken
          ? 'Pair Pathloom Web with Pathloom Bridge first'
          : !connect?.configured
            ? 'Configure Prusa Connect credentials in Pathloom Bridge'
            : 'Prusa Connect upload support is not enabled yet';
  }
}

async function checkBridge() {
  try {
    const response = await fetch(`${BRIDGE_BASE}/api/bridge/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    bridgeOnline = Boolean(data?.ok);
    bridgeCapabilities = data?.capabilities || null;
  } catch {
    bridgeOnline = false;
    bridgeCapabilities = null;
  }
  updateUi();
}

async function pairBridge() {
  if (!bridgeOnline) {
    notify('Pathloom Bridge is not running', 'error');
    return;
  }
  const code = window.prompt('Enter the 6-digit pairing code shown by Pathloom Bridge.');
  if (!code) return;

  try {
    const response = await fetch(`${BRIDGE_BASE}/api/bridge/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.token) throw new Error(result?.error || `HTTP ${response.status}`);
    bridgeToken = result.token;
    sessionStorage.setItem('pathloom.bridgeToken', bridgeToken);
    notify('Pathloom Bridge paired');
    updateUi();
    await verifyPrusaConnect();
  } catch (error) {
    notify(`Bridge pairing failed: ${error.message}`, 'error');
  }
}

async function verifyPrusaConnect() {
  if (!bridgeToken || !bridgeCapabilities?.prusaConnect?.configured) return;
  try {
    const response = await fetch(`${BRIDGE_BASE}/api/bridge/prusa-connect/printers`, {
      headers: bridgeHeaders(),
      cache: 'no-store'
    });
    if (response.status === 401) {
      bridgeToken = '';
      sessionStorage.removeItem('pathloom.bridgeToken');
      updateUi();
      return;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
    notify('Prusa Connect connection verified');
  } catch (error) {
    notify(`Prusa Connect check failed: ${error.message}`, 'error');
  }
}

async function sendToConnect() {
  if (!window.Pathloom?.generateGcode) {
    notify('Pathloom generator is not ready', 'error');
    return;
  }
  if (!bridgeCapabilities?.prusaConnect?.sendGcode) {
    notify('Prusa Connect upload is not enabled in Bridge yet', 'error');
    return;
  }

  const previous = sendButton.textContent;
  sendButton.disabled = true;
  sendButton.textContent = 'Sending…';
  try {
    const gcode = window.Pathloom.generateGcode();
    const response = await fetch(`${BRIDGE_BASE}/api/bridge/prusa-connect/send`, {
      method: 'POST',
      headers: {
        ...bridgeHeaders(),
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: gcode
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
    notify('G-code sent to Prusa Connect');
  } catch (error) {
    notify(`Send failed: ${error.message}`, 'error');
  } finally {
    sendButton.textContent = previous;
    updateUi();
  }
}

pairButton?.addEventListener('click', pairBridge);
sendButton?.addEventListener('click', sendToConnect);

checkBridge().then(() => {
  if (bridgeOnline && bridgeToken && bridgeCapabilities?.prusaConnect?.configured) verifyPrusaConnect();
});
const timer = setInterval(checkBridge, 10000);
window.addEventListener('beforeunload', () => clearInterval(timer));
