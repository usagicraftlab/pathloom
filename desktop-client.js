const statusLabel = document.getElementById('desktopStatus');
const grasshopperLabel = document.getElementById('connectionStatus');
const sendButton = document.getElementById('sendPrintBtn');
const toast = document.getElementById('toast');

let ghEndpoint = null;
let ghClients = 0;
let latestLiveToolpath = null;

function notify(message, kind = '') {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function setStatus(text, ok = false) {
  if (statusLabel) statusLabel.textContent = text;
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.title = ok
      ? 'Printer integration will be moved into the Pathloom desktop runtime next.'
      : 'Open Pathloom through the desktop app to enable local integrations.';
  }
}

function setGrasshopperStatus(text) {
  if (grasshopperLabel) grasshopperLabel.textContent = text;
}

function platformLabel(info) {
  if (info?.platform === 'macos') {
    if (info.arch === 'aarch64') return 'macOS · Apple Silicon';
    if (info.arch === 'x86_64') return 'macOS · Intel';
    return 'macOS';
  }
  return info?.platform || 'desktop';
}

function refreshGrasshopperLabel() {
  if (!ghEndpoint) {
    setGrasshopperStatus('Grasshopper · unavailable');
    return;
  }
  if (ghClients > 0) {
    setGrasshopperStatus(`Grasshopper · live · ${ghClients} connected`);
  } else {
    setGrasshopperStatus('Grasshopper · waiting');
  }
}

function deliverLiveToolpath(payload) {
  latestLiveToolpath = payload;
  window.PathloomLive = {
    latest: latestLiveToolpath,
    endpoint: ghEndpoint,
    connectedClients: ghClients
  };

  if (window.Pathloom?.upsertLiveToolpath) {
    try {
      window.Pathloom.upsertLiveToolpath(payload);
    } catch (error) {
      console.error('Unable to apply Grasshopper toolpath', error);
      notify(`Grasshopper update failed: ${error.message}`, 'error');
    }
  }
}

async function initializeGrasshopperEvents() {
  const listen = window.__TAURI__?.event?.listen;
  const invoke = window.__TAURI__?.core?.invoke;
  if (!listen || !invoke) return;

  await listen('grasshopper-bridge-listening', event => {
    ghEndpoint = event.payload;
    refreshGrasshopperLabel();
  });

  await listen('grasshopper-client-count', event => {
    ghClients = Number(event.payload) || 0;
    refreshGrasshopperLabel();
  });

  await listen('grasshopper-toolpath-update', event => {
    deliverLiveToolpath(event.payload);
    const source = event.payload?.source || 'Grasshopper';
    setGrasshopperStatus(`Grasshopper · live · ${source}`);
  });

  await listen('grasshopper-message-error', event => {
    console.error('Invalid Grasshopper message', event.payload);
    notify(`Grasshopper data rejected: ${event.payload}`, 'error');
  });

  await listen('grasshopper-bridge-error', event => {
    console.error('Grasshopper bridge error', event.payload);
    setGrasshopperStatus('Grasshopper · connection error');
  });

  try {
    const status = await invoke('grasshopper_bridge_status');
    ghEndpoint = status.endpoint || ghEndpoint;
    ghClients = Number(status.connectedClients) || 0;
    refreshGrasshopperLabel();
  } catch (error) {
    console.error('Unable to read Grasshopper bridge status', error);
  }
}

async function initializeDesktopRuntime() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    setStatus('Desktop · browser preview', false);
    setGrasshopperStatus('Grasshopper · desktop app required');
    return;
  }

  try {
    const info = await invoke('runtime_info');
    ghEndpoint = info.grasshopperEndpoint || null;
    setStatus(`${info.name} · ${platformLabel(info)} · local`, true);
    refreshGrasshopperLabel();
    await initializeGrasshopperEvents();
  } catch (error) {
    console.error('Pathloom desktop runtime unavailable', error);
    setStatus('Desktop · runtime error', false);
    setGrasshopperStatus('Grasshopper · unavailable');
    notify('Desktop runtime connection failed', 'error');
  }
}

sendButton?.addEventListener('click', () => {
  notify('Printer connection is being migrated into Pathloom Desktop.');
});

initializeDesktopRuntime();
