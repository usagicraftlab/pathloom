import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';

const palette = [
  { name: 'Navy', hex: '#223B59' },
  { name: 'Blue', hex: '#2F89C5' },
  { name: 'Turquoise', hex: '#36B6B0' },
  { name: 'Yellow', hex: '#F2D64B' },
  { name: 'Red', hex: '#B54A3A' },
  { name: 'Ivory', hex: '#D8D1C7' },
  { name: 'Gray', hex: '#7F8790' },
  { name: 'White', hex: '#F5F5F2' },
  { name: 'Black', hex: '#17191C' },
  { name: 'Clear', hex: '#D7EEF2' }
];

const sourceState = new Map();
const instanceState = new Map();
let sourceCounter = 0;
let selectedInstance = null;
let activeTool = null;

const $ = sel => document.querySelector(sel);
const canvas = $('#threeCanvas');
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d10, 280, 520);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
camera.position.set(220, -245, 220);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 10, 16);
controls.maxPolarAngle = Math.PI / 2.03;
controls.minDistance = 90;
controls.maxDistance = 520;
scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1d21, 1.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(80, -120, 180);
scene.add(keyLight);

const plate = new THREE.Mesh(
  new THREE.BoxGeometry(250, 210, 3),
  new THREE.MeshStandardMaterial({ color: 0x171c22, metalness: 0.18, roughness: 0.82 })
);
plate.position.z = -1.8;
scene.add(plate);
const grid = new THREE.GridHelper(250, 25, 0x47515d, 0x252c34);
grid.rotation.x = Math.PI / 2;
grid.scale.y = 210 / 250;
grid.position.z = 0.1;
scene.add(grid);
const toolpathGroup = new THREE.Group();
scene.add(toolpathGroup);
const renderedInstances = new Map();

function showToast(message, kind = '') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.hidden = true, 2800);
}

function sanitizeToolpath(raw, filename = 'Untitled.toolpath') {
  if (!raw || !Array.isArray(raw.paths)) throw new Error('Missing paths[]');
  const paths = raw.paths.map((path, index) => {
    if (!Array.isArray(path.points) || path.points.length < 2) throw new Error(`Path ${index} needs at least 2 points`);
    const points = path.points.map(p => {
      if (!Array.isArray(p) || p.length < 3 || p.slice(0,3).some(v => !Number.isFinite(Number(v)))) throw new Error(`Invalid XYZ point in path ${index}`);
      return p.slice(0,3).map(Number);
    });
    return { order: Number.isFinite(Number(path.order)) ? Number(path.order) : index, tool: String(path.tool ?? 0), points };
  }).sort((a,b) => a.order - b.order);

  const zValues = [...new Set(paths.map(p => Number(p.points[0][2].toFixed(4))))].sort((a,b) => a-b);
  paths.forEach(p => {
    const z = Number(p.points[0][2].toFixed(4));
    p.layer = zValues.indexOf(z) + 1;
  });

  return { filename, paths, maxLayer: Math.max(1, zValues.length) };
}

function defaultToolColor(index) { return palette[index % palette.length]; }

function addSource(toolpath, options = {}) {
  sourceCounter += 1;
  const id = options.id || `S${sourceCounter}`;
  const label = options.label || toolpath.filename.replace(/\.toolpath$|\.json$/i, '') || id;
  const toolIds = [...new Set(toolpath.paths.map(p => p.tool))];
  const tools = new Map();
  toolIds.forEach((toolId, index) => {
    const c = defaultToolColor(index);
    tools.set(String(toolId), { color: c.hex, name: c.name, speedOverride: null, erate: 1 });
  });
  sourceState.set(id, {
    id, label, filename: toolpath.filename, paths: toolpath.paths, maxLayer: toolpath.maxLayer,
    speed: Number($('#printSpeed').value) || 35, erate: 1, tools
  });
  const next = nextInstanceNumber(id);
  addInstance(id, `${id}-${next}`, { x: 0, y: 0, rotation: 0 });
  autoArrange(false);
  renderAllUI();
  buildInstances();
  return id;
}

function nextInstanceNumber(sourceId) {
  let max = 0;
  for (const [id, inst] of instanceState) if (inst.source === sourceId) {
    const n = Number(id.split('-').pop());
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

function addInstance(sourceId, id = `${sourceId}-${nextInstanceNumber(sourceId)}`, transform = {}) {
  const maxOrder = Math.max(0, ...[...instanceState.values()].map(v => v.order || 0));
  instanceState.set(id, { source: sourceId, x: transform.x ?? 0, y: transform.y ?? 0, rotation: transform.rotation ?? 0, order: maxOrder + 1 });
  selectedInstance = id;
  return id;
}

function removeSource(sourceId) {
  sourceState.delete(sourceId);
  for (const [id, inst] of [...instanceState]) if (inst.source === sourceId) instanceState.delete(id);
  selectedInstance = [...instanceState.keys()][0] || null;
  normalizeOrder();
  renderAllUI();
  buildInstances();
}

function normalizeOrder() {
  [...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order).forEach(([id, data], i) => data.order = i + 1);
}

function toolEffectiveSpeed(source, tool) {
  return tool.speedOverride ?? source.speed ?? (Number($('#printSpeed').value) || 35);
}

function createInstanceGroup(instanceId, data) {
  const source = sourceState.get(data.source);
  const group = new THREE.Group();
  group.userData.instanceId = instanceId;
  source.paths.forEach((path, pathIndex) => {
    const points = path.points.map(([x,y,z]) => new THREE.Vector3(x,y,z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const tool = source.tools.get(path.tool);
    const mat = new THREE.LineBasicMaterial({ color: tool?.color || '#ffffff', transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    line.userData = { sourceId: source.id, toolId: path.tool, layer: path.layer, pathIndex, order: path.order };
    group.add(line);
  });
  group.position.set(data.x, data.y, 0);
  group.rotation.z = THREE.MathUtils.degToRad(data.rotation);
  return group;
}

function buildInstances() {
  toolpathGroup.clear();
  renderedInstances.clear();
  for (const [id, data] of instanceState) {
    if (!sourceState.has(data.source)) continue;
    const group = createInstanceGroup(id, data);
    toolpathGroup.add(group);
    renderedInstances.set(id, group);
  }
  updateLayerRange();
  refreshVisibility();
  $('#emptyState').hidden = sourceState.size > 0;
}

function updateLayerRange() {
  const max = Math.max(1, ...[...sourceState.values()].map(s => s.maxLayer));
  const slider = $('#layerSlider');
  slider.max = max;
  if (Number(slider.value) > max || Number(slider.value) === 1) slider.value = max;
  $('#layerValue').textContent = slider.value;
}

function refreshVisibility() {
  const maxLayer = Number($('#layerSlider').value);
  const progress = Number($('#pathSlider').value) / 100;
  const mode = $('#viewMode').value;
  const groups = [...renderedInstances.entries()].sort((a,b) => instanceState.get(a[0]).order - instanceState.get(b[0]).order);
  const visible = [];
  groups.forEach(([id, group]) => {
    group.children.forEach(line => {
      line.visible = line.userData.layer <= maxLayer;
      if (line.visible) visible.push({ id, line });
    });
  });
  const visibleCount = Math.ceil(visible.length * progress);
  visible.forEach((entry, i) => entry.line.visible = i < visibleCount);

  const orderColors = ['#68A0FF','#B98CFF','#FF9E67','#62D8B5','#F2D64B','#E47A91'];
  groups.forEach(([id, group], groupIndex) => group.traverse(child => {
    if (!child.isLine) return;
    const source = sourceState.get(child.userData.sourceId);
    const tool = source.tools.get(child.userData.toolId);
    if (mode === 'tool') child.material.color.set(tool?.color || '#fff');
    if (mode === 'order') child.material.color.set(orderColors[groupIndex % orderColors.length]);
    if (mode === 'speed') {
      const speed = toolEffectiveSpeed(source, tool);
      const t = Math.max(0, Math.min(1, (speed - 15) / 55));
      child.material.color.setHSL((1 - t) * 0.6, 0.75, 0.56);
    }
  }));
}

function renderObjectUI() {
  const host = $('#objectList');
  host.innerHTML = '';
  for (const source of sourceState.values()) {
    const count = [...instanceState.values()].filter(i => i.source === source.id).length;
    const card = document.createElement('div');
    card.className = 'object-card';
    card.dataset.source = source.id;
    const swatches = [...source.tools.values()].map(t => `<i style="--c:${t.color}"></i>`).join('');
    card.innerHTML = `
      <button class="object-header">
        <span><strong>${escapeHtml(source.label)}</strong><small>${count} instance${count===1?'':'s'}</small></span>
        <span class="mini-swatches">${swatches}</span><span class="chevron">⌄</span>
      </button>
      <div class="object-body">
        <div class="object-defaults">
          <div class="object-default-title"><span>Object settings</span><button class="remove-source" title="Remove object">×</button></div>
          <label><span>Print speed</span><input class="object-speed" type="number" min="1" value="${source.speed}"><em>mm/s</em></label>
          <label><span>E-rate</span><input class="object-erate" type="number" step="0.01" min="0" value="${source.erate.toFixed(2)}"><em>×</em></label>
        </div>
        <div class="tools-label">TOOLS</div>
        <div class="tools-host"></div>
        <button class="duplicate-source-instance">＋ Duplicate instance</button>
      </div>`;
    host.appendChild(card);
    const toolsHost = card.querySelector('.tools-host');
    for (const [toolId, tool] of source.tools) {
      const row = document.createElement('div');
      row.className = 'tool-row';
      row.dataset.source = source.id;
      row.dataset.tool = toolId;
      row.innerHTML = `
        <button class="color-chip" style="--tool-color:${tool.color}" aria-label="Change tool color"></button>
        <button class="tool-toggle"><span>T${escapeHtml(toolId)}</span><span class="tool-name">${escapeHtml(tool.name)}</span><span>⌄</span></button>
        <div class="tool-detail">
          <label><span>Print speed</span><input class="tool-speed" type="number" min="1" value="${tool.speedOverride ?? ''}" placeholder="${source.speed}"><em>mm/s</em></label>
          <label><span>E-rate</span><input class="tool-erate" type="number" step="0.01" min="0" value="${tool.erate.toFixed(2)}"><em>×</em></label>
          <div class="inherit-note">Leave speed blank to use object speed.</div>
        </div>`;
      toolsHost.appendChild(row);
    }
  }
  bindObjectUI();
}

function bindObjectUI() {
  document.querySelectorAll('.object-header').forEach(btn => btn.addEventListener('click', () => btn.closest('.object-card').classList.toggle('collapsed')));
  document.querySelectorAll('.tool-toggle').forEach(btn => btn.addEventListener('click', () => btn.closest('.tool-row').classList.toggle('expanded')));
  document.querySelectorAll('.object-card').forEach(card => {
    const source = sourceState.get(card.dataset.source);
    card.querySelector('.object-speed').addEventListener('input', e => { source.speed = Number(e.target.value) || 1; refreshVisibility(); });
    card.querySelector('.object-erate').addEventListener('input', e => source.erate = Number(e.target.value) || 0);
    card.querySelector('.remove-source').addEventListener('click', e => { e.stopPropagation(); removeSource(source.id); });
    card.querySelector('.duplicate-source-instance').addEventListener('click', () => {
      const n = nextInstanceNumber(source.id);
      addInstance(source.id, `${source.id}-${n}`, { x: n * 10, y: n * 10, rotation: 0 });
      autoArrange(false); renderAllUI(); buildInstances();
    });
  });
  document.querySelectorAll('.tool-row').forEach(row => {
    const source = sourceState.get(row.dataset.source);
    const tool = source.tools.get(row.dataset.tool);
    row.querySelector('.tool-speed').addEventListener('input', e => { tool.speedOverride = e.target.value === '' ? null : Number(e.target.value); refreshVisibility(); });
    row.querySelector('.tool-erate').addEventListener('input', e => tool.erate = Number(e.target.value) || 0);
    row.querySelector('.color-chip').addEventListener('click', e => {
      e.stopPropagation();
      activeTool = { sourceId: source.id, toolId: row.dataset.tool };
      openPalette(e.currentTarget);
    });
  });
}

function renderOrderUI() {
  const host = $('#orderList');
  host.innerHTML = '';
  [...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order).forEach(([id, data], i) => {
    const item = document.createElement('div');
    item.className = 'order-item'; item.draggable = true; item.dataset.id = id;
    item.innerHTML = `<span class="handle">⠿</span><strong>${escapeHtml(instanceDisplayName(id, data))}</strong><span>${String(i+1).padStart(2,'0')}</span>`;
    host.appendChild(item);
  });
  bindOrderDrag();
}

function bindOrderDrag() {
  const host = $('#orderList');
  let dragged = null;
  host.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragged = item; item.classList.add('dragging'); });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      [...host.children].forEach((el, i) => instanceState.get(el.dataset.id).order = i + 1);
      renderOrderUI(); refreshVisibility();
    });
    item.addEventListener('dragover', e => {
      e.preventDefault(); if (!dragged || dragged === item) return;
      const r = item.getBoundingClientRect();
      host.insertBefore(dragged, e.clientY < r.top + r.height/2 ? item : item.nextSibling);
    });
  });
}

function instanceDisplayName(id, data) {
  const source = sourceState.get(data.source);
  const n = id.split('-').pop();
  return `${source?.label || data.source}-${n}`;
}

function renderArrangeUI() {
  const host = $('#instanceGrid');
  host.innerHTML = '';
  [...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order).forEach(([id, data]) => {
    const b = document.createElement('button');
    b.className = `instance-card${selectedInstance===id?' active':''}`;
    b.dataset.instance = id;
    b.innerHTML = `${escapeHtml(instanceDisplayName(id,data))}<small>X ${round1(data.x)} · Y ${round1(data.y)}</small>`;
    b.addEventListener('click', () => { selectedInstance = id; renderArrangeUI(); syncInstanceEditor(); });
    host.appendChild(b);
  });
  syncInstanceEditor();
}

function syncInstanceEditor() {
  const editor = $('#instanceEditor');
  const data = selectedInstance ? instanceState.get(selectedInstance) : null;
  editor.hidden = !data;
  if (!data) return;
  $('#instanceX').value = round1(data.x);
  $('#instanceY').value = round1(data.y);
  $('#instanceRotation').value = round1(data.rotation);
}

function renderAllUI() { renderObjectUI(); renderOrderUI(); renderArrangeUI(); }

function autoArrange(render = true) {
  const spacing = Number($('#spacing').value) || 18;
  const entries = [...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order);
  if (!entries.length) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length * 250/210)));
  const cellX = Math.min(75, 48 + spacing);
  const cellY = Math.min(75, 48 + spacing);
  const rows = Math.ceil(entries.length / cols);
  entries.forEach(([id, data], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    data.x = (col - (cols-1)/2) * cellX;
    data.y = (row - (rows-1)/2) * cellY;
  });
  if (render) { renderArrangeUI(); buildInstances(); }
}

function openPalette(chip) {
  const popover = $('#colorPopover');
  const chipRect = chip.getBoundingClientRect();
  const viewRect = viewport.getBoundingClientRect();
  popover.hidden = false;
  popover.style.left = '18px';
  popover.style.top = `${Math.max(14, Math.min(viewRect.height - 280, chipRect.top - viewRect.top))}px`;
  const source = sourceState.get(activeTool.sourceId);
  const tool = source.tools.get(activeTool.toolId);
  $('#paletteGrid').querySelectorAll('.palette-swatch').forEach((b, i) => b.classList.toggle('active', palette[i].hex.toLowerCase() === tool.color.toLowerCase()));
}

function setupPalette() {
  const grid = $('#paletteGrid');
  palette.forEach(c => {
    const b = document.createElement('button');
    b.className = 'palette-swatch'; b.style.setProperty('--swatch', c.hex); b.title = c.name;
    b.addEventListener('click', () => {
      if (!activeTool) return;
      const source = sourceState.get(activeTool.sourceId);
      const tool = source?.tools.get(activeTool.toolId);
      if (!tool) return;
      tool.color = c.hex; tool.name = c.name;
      renderObjectUI(); refreshVisibility();
      grid.querySelectorAll('.palette-swatch').forEach(x => x.classList.toggle('active', x === b));
    });
    grid.appendChild(b);
  });
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function round1(n) { return Math.round(n * 10) / 10; }

async function importFiles(files) {
  for (const file of files) {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const parsed = sanitizeToolpath(raw, file.name);
      addSource(parsed);
      showToast(`${file.name} added`);
    } catch (err) {
      console.error(err);
      showToast(`${file.name}: ${err.message}`, 'error');
    }
  }
}

function transformedPoints(path, instance) {
  const a = THREE.MathUtils.degToRad(instance.rotation || 0);
  const cos = Math.cos(a), sin = Math.sin(a);
  return path.points.map(([x,y,z]) => [x*cos - y*sin + instance.x, x*sin + y*cos + instance.y, z]);
}

function generateGcode() {
  if (!instanceState.size) throw new Error('Add a .toolpath file first');
  const width = Number($('#printWidth').value);
  const height = Number($('#printHeight').value);
  const filamentD = Number($('#filamentDiameter').value);
  const travel = Number($('#travelSpeed').value);
  if (![width,height,filamentD,travel].every(v => Number.isFinite(v) && v > 0)) throw new Error('Check Basic Settings');
  const filamentArea = Math.PI * Math.pow(filamentD/2, 2);
  const ePerMmBase = width * height / filamentArea;
  const lines = [
    '; Generated by Pathloom',
    `; width=${width} height=${height} filament=${filamentD}`,
    'G90 ; absolute XYZ',
    'M83 ; relative extrusion'
  ];
  let currentTool = null;
  const ordered = [...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order);
  ordered.forEach(([instanceId, inst]) => {
    const source = sourceState.get(inst.source);
    lines.push(`\n; INSTANCE ${instanceDisplayName(instanceId,inst)}`);
    source.paths.forEach(path => {
      const tool = source.tools.get(path.tool);
      const numericTool = Number(path.tool);
      if (currentTool !== path.tool) {
        if (Number.isInteger(numericTool) && numericTool >= 0) lines.push(`T${numericTool}`);
        else lines.push(`; TOOL ${path.tool}`);
        currentTool = path.tool;
      }
      const pts = transformedPoints(path, inst);
      const [sx,sy,sz] = pts[0];
      lines.push(`G0 X${sx.toFixed(3)} Y${sy.toFixed(3)} Z${sz.toFixed(3)} F${Math.round(travel*60)}`);
      const speed = toolEffectiveSpeed(source, tool);
      const multiplier = (source.erate || 1) * (tool?.erate || 1);
      for (let i=1; i<pts.length; i++) {
        const [x,y,z] = pts[i], [px,py,pz] = pts[i-1];
        const len = Math.hypot(x-px, y-py, z-pz);
        const e = len * ePerMmBase * multiplier;
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} E${e.toFixed(5)} F${Math.round(speed*60)}`);
      }
    });
  });
  lines.push('\n; End of Pathloom output');
  return lines.join('\n');
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
function animate() { controls.update(); renderer.render(scene,camera); requestAnimationFrame(animate); }

// Tabs
[...document.querySelectorAll('.tab')].forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  $(`#tab-${tab.dataset.tab}`).classList.add('active');
}));

$('#addToolpath').addEventListener('click', () => $('#toolpathInput').click());
$('#toolpathInput').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });
$('#layerSlider').addEventListener('input', e => { $('#layerValue').textContent = e.target.value; refreshVisibility(); });
$('#pathSlider').addEventListener('input', refreshVisibility);
$('#viewMode').addEventListener('change', refreshVisibility);
$('#printSpeed').addEventListener('input', refreshVisibility);
$('#autoArrange').addEventListener('click', () => autoArrange(true));
$('#closePalette').addEventListener('click', () => $('#colorPopover').hidden = true);
viewport.addEventListener('pointerdown', e => { const p=$('#colorPopover'); if (!p.hidden && !p.contains(e.target)) p.hidden=true; });
$('#colorPopover').addEventListener('pointerdown', e => e.stopPropagation());

['instanceX','instanceY','instanceRotation'].forEach(id => $(`#${id}`).addEventListener('input', () => {
  const data = instanceState.get(selectedInstance); if (!data) return;
  data.x = Number($('#instanceX').value) || 0; data.y = Number($('#instanceY').value) || 0; data.rotation = Number($('#instanceRotation').value) || 0;
  renderArrangeUI(); buildInstances();
}));
$('#duplicateInstance').addEventListener('click', () => {
  const data = instanceState.get(selectedInstance); if (!data) return;
  const id = `${data.source}-${nextInstanceNumber(data.source)}`;
  addInstance(data.source, id, { x:data.x+12, y:data.y+12, rotation:data.rotation });
  normalizeOrder(); renderAllUI(); buildInstances();
});
$('#deleteInstance').addEventListener('click', () => {
  if (!selectedInstance) return;
  instanceState.delete(selectedInstance); selectedInstance = [...instanceState.keys()][0] || null;
  normalizeOrder(); renderAllUI(); buildInstances();
});
$('#generateBtn').addEventListener('click', () => {
  try { downloadText('pathloom-output.gcode', generateGcode()); showToast('G-code generated'); }
  catch (err) { showToast(err.message, 'error'); }
});

setupPalette();
renderAllUI();
buildInstances();
resize();
animate();
