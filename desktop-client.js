const statusLabel = document.getElementById('desktopStatus');
const grasshopperLabel = document.getElementById('connectionStatus');
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

  await listen('load-ukigara-clock', () => {
    window.Pathloom?.loadUkigaraSample?.();
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

document.addEventListener('pathloom:send-to-printer', () => {
  notify('Printer connection is being migrated into Pathloom Desktop.');
});

initializeDesktopRuntime();

const liveFileStatus = document.getElementById('liveToolpathStatus');
const liveFileSessions = new Map();
let choosingLiveFiles = false;

function refreshLiveFileStatus() {
  if (!liveFileSessions.size) {
    liveFileStatus.textContent = '';
    liveFileStatus.hidden = true;
    return;
  }
  liveFileStatus.hidden = false;
  const errors = [...liveFileSessions.values()].filter(session => session.error);
  liveFileStatus.textContent = errors.length
    ? `Live · ${liveFileSessions.size} files · ${errors.map(session => `${session.name}: ${session.error}`).join(' · ')}`
    : `Live · ${liveFileSessions.size} files · reloads saved changes every second`;
}

function stopLiveFile(source) {
  const session = liveFileSessions.get(source);
  if (session) clearTimeout(session.timer);
  liveFileSessions.delete(source);
  refreshLiveFileStatus();
}

async function pollLiveFile(session) {
  try {
    const text = await window.__TAURI__.core.invoke('read_live_toolpath', { path: session.path });
    if (liveFileSessions.get(session.source) !== session) return;
    if (text !== session.lastText) {
      const raw = JSON.parse(text);
      if (!window.Pathloom?.upsertLiveToolpath) throw new Error('Preview is still loading');
      window.Pathloom.upsertLiveToolpath({paths: raw.paths, source: session.source,
        label: session.name.replace(/\.(toolpath|json)$/i, ''), origin: 'live file'});
      session.lastText = text;
    }
    session.error = null;
  } catch (error) {
    if (liveFileSessions.get(session.source) !== session) return;
    session.error = error.message || String(error);
  }
  refreshLiveFileStatus();
  if (liveFileSessions.get(session.source) === session) {
    session.timer = setTimeout(() => pollLiveFile(session), 1000);
  }
}

document.addEventListener('pathloom:add-live-files', async () => {
  if (choosingLiveFiles) return;
  choosingLiveFiles = true;
  const button = document.getElementById('addToolpath');
  button.disabled = true;
  try {
    const paths = await window.__TAURI__.core.invoke('choose_live_toolpath');
    for (const path of paths || []) {
      const source = `file:${path}`;
      if (liveFileSessions.has(source)) continue;
      const session = {path, source, name: path.split(/[\\/]/).pop(), lastText: null, timer: null};
      liveFileSessions.set(source, session);
      pollLiveFile(session);
    }
  } catch (error) {
    notify(`Unable to choose files: ${error.message || error}`, 'error');
  } finally {
    choosingLiveFiles = false;
    button.disabled = false;
    refreshLiveFileStatus();
  }
});

let importingStepBrep = false;
document.addEventListener('pathloom:import-step-brep', async () => {
  if (importingStepBrep) return;
  importingStepBrep = true;
  const button = document.getElementById('importStep');
  button.disabled = true;
  try {
    const result = await window.__TAURI__.core.invoke('choose_and_inspect_step_brep');
    if (!result) return;
    if (!window.Pathloom?.addImportedBrepInspection) throw new Error('3D view is still loading');
    window.Pathloom.addImportedBrepInspection(result);
    const faceCount = (result.breps || []).reduce((sum, brep) => sum + (brep.faces?.length || 0), 0);
    notify(`STEP imported as CAD B-rep · ${faceCount} faces`);
  } catch (error) {
    console.error('Native STEP B-rep import failed', error);
    notify(`STEP import failed: ${error.message || error}`, 'error');
  } finally {
    importingStepBrep = false;
    button.disabled = false;
  }
});

let movingStepFaces = false;
document.addEventListener('pathloom:move-step-faces', async event => {
  if (movingStepFaces) return;
  const detail = event.detail || {};
  movingStepFaces = true;
  try {
    const result = await window.__TAURI__.core.invoke('move_step_brep_faces', {
      assetId: detail.assetId,
      brepIndex: detail.brepIndex,
      faceIndices: detail.faceIndices,
      dx: detail.dx,
      dy: detail.dy
    });
    window.Pathloom.applyImportedBrepEdit(detail.shapeId, result);
    notify(`Moved ${detail.faceIndices.length} CAD face(s) · ${detail.dx} × ${detail.dy} mm`);
  } catch (error) {
    console.error('CAD face movement failed', error);
    notify(`Face movement failed: ${error.message || error}`, 'error');
  } finally {
    movingStepFaces = false;
  }
});

document.addEventListener('pathloom:source-removed', event => stopLiveFile(event.detail?.liveSource));
window.addEventListener('pagehide', () => {
  for (const source of [...liveFileSessions.keys()]) stopLiveFile(source);
});

document.addEventListener('pathloom:stop-live-files',()=>{for(const source of [...liveFileSessions.keys()])stopLiveFile(source)});
