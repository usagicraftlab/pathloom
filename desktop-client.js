import {createBrepInbox} from './gh-brep-live.js';
import {moveStepFaces} from './step-import.js';
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

const brepInbox=createBrepInbox({ready:()=>!!window.PathloomCad?.upsertRhinoBrep,context:()=>window.PathloomCad?.liveContext?.(),convert:payload=>window.__TAURI__.core.invoke('import_live_step',{step:payload.step,name:payload.label||payload.source}),apply:(payload,shape)=>{window.PathloomCad.upsertRhinoBrep(payload,shape);setGrasshopperStatus(`Grasshopper · B-rep live · ${payload.label||payload.source}`)},error:(error,payload)=>notify(`Rhino B-rep · ${payload.source}: ${error.message||error}`,'error')});

document.addEventListener('pathloom:rhino-bindings-restored',async()=>{try{for(const payload of await window.__TAURI__.core.invoke('grasshopper_brep_snapshots')||[])brepInbox.enqueue(payload)}catch(error){console.error('Unable to restore Rhino bindings',error)}});

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

  await listen('grasshopper-brep-update',event=>brepInbox.enqueue(event.payload));
  try{for(const payload of await invoke('grasshopper_brep_snapshots')||[])brepInbox.enqueue(payload)}catch(error){console.error('Unable to restore live B-rep snapshots',error)}

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

let movingStepFaces = false;
document.addEventListener('pathloom:move-step-faces', async event => {
  if (movingStepFaces) return;
  const detail = event.detail || {};
  movingStepFaces = true;
  try {
    const result = detail.brep ? await moveStepFaces({brep:detail.brep,...window.Pathloom.getImportedStep(detail.shapeId)},detail.faceIndices,[detail.dx,detail.dy,detail.dz||0]) : await window.__TAURI__.core.invoke('move_step_brep_faces', {
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

// Printer settings never include a returned plaintext credential.
{
  const el=id=>document.getElementById(id),form=el('printerConnectionForm'),dialog=el('printerSendDialog');
  let baseline=null,loading=false,uploading=false,generate=null,finish=null,uploadId=null;
  const invoke=(command,args={})=>{if(!window.__TAURI__?.core?.invoke)return Promise.reject(new Error('Printer connection requires Pathloom Desktop.'));return window.__TAURI__.core.invoke(command,args)};
  const message=e=>e?.message||String(e||'Printer connection failed');
  function status(id,text,bad=false){el(id).textContent=text;el(id).classList.toggle('is-error',bad)}
  function fields(){return{baseUrl:el('printerAddress').value.trim(),authMode:el('printerAuthMode').value,username:el('printerUsername').value.trim(),storage:el('printerStorage').value.trim()}}
  function auth(){const key=el('printerAuthMode').value==='apiKey';el('printerUsernameRow').hidden=key;el('printerUsername').required=!key;el('printerSecretLabel').textContent=key?'API key':'Password';const f=fields(),same=baseline&&['baseUrl','authMode','username'].every(k=>f[k]===baseline[k]);el('printerSecret').placeholder=same&&baseline.hasCredentials?'Saved · leave blank to keep':'Enter authentication details'}
  function setFields(meta){baseline=meta;for(const[id,key]of [['printerAddress','baseUrl'],['printerAuthMode','authMode'],['printerUsername','username'],['printerStorage','storage']])el(id).value=meta[key];el('printerSecret').value='';auth()}
  function busy(on){loading=on;for(const field of form.querySelectorAll('input,select,button'))field.disabled=on}
  async function load(){if(loading)return;busy(true);status('printerConnectionStatus','Loading…');try{setFields(await invoke('printer_connection_get'));status('printerConnectionStatus',baseline.hasCredentials?'Connection saved':'Enter authentication details to connect.')}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}}
  document.addEventListener('pathloom:open-printer-settings-tab',load);
  for(const id of ['printerAddress','printerAuthMode','printerUsername'])el(id).addEventListener('input',auth);
  form.addEventListener('submit',async event=>{event.preventDefault();if(loading||!form.reportValidity())return;const settings=fields(),secret=el('printerSecret').value||null;busy(true);status('printerConnectionStatus','Saving…');try{setFields(await invoke('printer_connection_save',{settings,secret}));status('printerConnectionStatus','Connection saved')}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}});
  el('testPrinterConnection').addEventListener('click',async()=>{if(loading||!form.reportValidity())return;const settings=fields(),secret=el('printerSecret').value||null;busy(true);status('printerConnectionStatus','Connecting…');try{const result=await invoke('printer_connection_test',{settings,secret});el('printerStorageOptions').replaceChildren();for(const storage of result.storages||[]){const option=document.createElement('option');option.value=storage.path.replace(/^\/+|\/+$/g,'');option.label=storage.name||storage.type;el('printerStorageOptions').append(option)}status('printerConnectionStatus',`Connected · ${result.state} · ${result.storage}`)}catch(e){status('printerConnectionStatus',message(e),true)}finally{busy(false)}});
  const end=()=>{generate=null;uploadId=null;finish?.();finish=null};
  dialog.addEventListener('close',end);dialog.addEventListener('cancel',event=>{if(uploading)event.preventDefault()});
  for(const id of ['closePrinterSend','cancelPrinterSend'])el(id).addEventListener('click',()=>{if(!uploading)dialog.close()});
  el('printerSendForm').addEventListener('submit',async event=>{
    event.preventDefault();if(uploading||!generate||!event.target.reportValidity())return;
    uploading=true;for(const field of dialog.querySelectorAll('input,select,button'))field.disabled=true;el('printerSendProgress').hidden=false;el('printerSendProgress').value=0;status('printerSendStatus','Preparing G-code…');
    try{const content=generate(),printAfterUpload=event.submitter?.value==='print';uploadId=crypto.randomUUID();status('printerSendStatus','Connecting to printer…');
      const result=await invoke('printer_upload_gcode',{content,filename:el('printerSendFilename').value.trim(),printAfterUpload,uploadId});el('printerSendProgress').value=100;status('printerSendStatus',result.printAfterUpload?'File transferred · print start requested':'File transferred');notify(result.printAfterUpload?'File transferred · print start requested':'G-code transferred');
      uploading=false;dialog.close();
    }catch(e){status('printerSendStatus',message(e),true)}finally{uploading=false;for(const field of dialog.querySelectorAll('input,select,button'))field.disabled=false}
  });
  window.__TAURI__?.event?.listen('printer-upload-progress',event=>{const p=event.payload;if(!uploading||p.uploadId!==uploadId)return;const percent=Math.min(100,Math.floor(p.sent*100/Math.max(1,p.total)));el('printerSendProgress').value=percent;status('printerSendStatus',percent===100?'Waiting for printer response…':`Transferring · ${percent}%`)}).then(unlisten=>window.addEventListener('pagehide',unlisten,{once:true})).catch(()=>{});
  let opening=false;
  window.PathloomPrinter={async send(options){if(opening||dialog.open)return;opening=true;try{const meta=await invoke('printer_connection_get');if(!meta.hasCredentials){document.dispatchEvent(new Event('pathloom:open-printer-settings'));notify('Set up Printer Connection first.');return}generate=options.generate;el('printerSendFilename').value=options.filename;el('printerSendAddress').textContent=`${meta.baseUrl} · ${meta.storage}`;el('printerSendProgress').hidden=true;status('printerSendStatus','');dialog.showModal();await new Promise(resolve=>finish=resolve)}catch(e){notify(message(e),'error')}finally{opening=false}}};
}
