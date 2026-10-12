const statusLabel = document.getElementById('desktopStatus');
const sendButton = document.getElementById('sendPrintBtn');
const toast = document.getElementById('toast');

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

async function initializeDesktopRuntime() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    setStatus('Desktop · browser preview', false);
    return;
  }

  try {
    const info = await invoke('runtime_info');
    setStatus(`${info.name} · local`, true);
  } catch (error) {
    console.error('Pathloom desktop runtime unavailable', error);
    setStatus('Desktop · runtime error', false);
    notify('Desktop runtime connection failed', 'error');
  }
}

sendButton?.addEventListener('click', () => {
  notify('Printer connection is being migrated into Pathloom Desktop.');
});

initializeDesktopRuntime();
