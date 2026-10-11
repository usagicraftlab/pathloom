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

const toolState = {
  'A-T0': { color: '#223B59', name: 'Navy', speed: 35, erate: 1.00 },
  'A-T1': { color: '#F2D64B', name: 'Yellow', speed: 32, erate: 0.98 },
  'B-T0': { color: '#2F89C5', name: 'Blue', speed: 35, erate: 1.00 }
};

const instanceState = {
  'A-1': { source: 'A', x: -55, y: 0, rotation: 0, order: 1 },
  'A-2': { source: 'A', x: 55, y: 0, rotation: 0, order: 2 },
  'B-1': { source: 'B', x: 0, y: 58, rotation: 0, order: 3 }
};

const canvas = document.getElementById('threeCanvas');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d10, 280, 520);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
camera.position.set(220, -245, 220);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 10, 16);
controls.maxPolarAngle = Math.PI / 2.03;
controls.minDistance = 110;
controls.maxDistance = 520;

scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1d21, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(80, -120, 180);
scene.add(key);

const plateGroup = new THREE.Group();
scene.add(plateGroup);

const plate = new THREE.Mesh(
  new THREE.BoxGeometry(250, 210, 3),
  new THREE.MeshStandardMaterial({ color: 0x171c22, metalness: 0.18, roughness: 0.82 })
);
plate.position.z = -1.8;
plateGroup.add(plate);

const grid = new THREE.GridHelper(250, 25, 0x47515d, 0x252c34);
grid.rotation.x = Math.PI / 2;
grid.scale.y = 210 / 250;
grid.position.z = 0.1;
plateGroup.add(grid);

const toolpathGroup = new THREE.Group();
scene.add(toolpathGroup);

function createRoundedRectPath(w, h, r, z, turns = 1) {
  const points = [];
  const steps = 100;
  for (let t = 0; t < turns; t++) {
    const inset = t * 1.6;
    const rw = w - inset * 2;
    const rh = h - inset * 2;
    const rr = Math.max(2, r - inset * 0.2);
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const perimeter = 2 * (rw + rh - 4 * rr) + 2 * Math.PI * rr;
      let d = p * perimeter;
      const segs = [rw - 2 * rr, Math.PI * rr / 2, rh - 2 * rr, Math.PI * rr / 2, rw - 2 * rr, Math.PI * rr / 2, rh - 2 * rr, Math.PI * rr / 2];
      let x = -rw / 2 + rr, y = -rh / 2;
      let seg = 0;
      while (d > segs[seg] && seg < segs.length - 1) { d -= segs[seg]; seg++; }
      switch (seg) {
        case 0: x += d; break;
        case 1: { const a = -Math.PI/2 + d/rr; x = rw/2-rr + rr*Math.cos(a); y = -rh/2+rr + rr*Math.sin(a); break; }
        case 2: x = rw/2; y = -rh/2+rr + d; break;
        case 3: { const a = d/rr; x = rw/2-rr + rr*Math.cos(a); y = rh/2-rr + rr*Math.sin(a); break; }
        case 4: x = rw/2-rr-d; y = rh/2; break;
        case 5: { const a = Math.PI/2 + d/rr; x = -rw/2+rr + rr*Math.cos(a); y = rh/2-rr + rr*Math.sin(a); break; }
        case 6: x = -rw/2; y = rh/2-rr-d; break;
        case 7: { const a = Math.PI + d/rr; x = -rw/2+rr + rr*Math.cos(a); y = -rh/2+rr + rr*Math.sin(a); break; }
      }
      points.push(new THREE.Vector3(x, y, z + t * 0.03));
    }
  }
  return points;
}

function createObjectA() {
  const group = new THREE.Group();
  group.userData.source = 'A';
  for (let layer = 0; layer < 48; layer++) {
    const z = 0.9 + layer * 0.72;
    const toolKey = layer % 6 < 4 ? 'A-T0' : 'A-T1';
    const points = createRoundedRectPath(54, 38, 7, z, 2);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: toolState[toolKey].color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    line.userData = { toolKey, layer: layer + 1, order: layer };
    group.add(line);
  }
  return group;
}

function createObjectB() {
  const group = new THREE.Group();
  group.userData.source = 'B';
  for (let layer = 0; layer < 34; layer++) {
    const z = 0.9 + layer * 0.82;
    const size = 36 + Math.sin(layer * 0.24) * 8;
    const points = [];
    const segs = 92;
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI * 2;
      const wobble = 1 + 0.08 * Math.sin(5 * a + layer * 0.2);
      points.push(new THREE.Vector3(Math.cos(a) * size * 0.5 * wobble, Math.sin(a) * size * 0.5 * wobble, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: toolState['B-T0'].color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    line.userData = { toolKey: 'B-T0', layer: layer + 1, order: layer };
    group.add(line);
  }
  return group;
}

const sourceFactory = { A: createObjectA, B: createObjectB };
const renderedInstances = new Map();

function buildInstances() {
  toolpathGroup.clear();
  renderedInstances.clear();
  Object.entries(instanceState).forEach(([id, data]) => {
    const group = sourceFactory[data.source]();
    group.position.set(data.x, data.y, 0);
    group.rotation.z = THREE.MathUtils.degToRad(data.rotation);
    group.userData.instanceId = id;
    toolpathGroup.add(group);
    renderedInstances.set(id, group);
  });
  refreshVisibility();
}

function refreshToolColors() {
  renderedInstances.forEach(group => {
    group.traverse(child => {
      if (child.isLine && child.userData.toolKey) child.material.color.set(toolState[child.userData.toolKey].color);
    });
  });
}

function refreshVisibility() {
  const maxLayer = Number(document.getElementById('layerSlider').value);
  const progress = Number(document.getElementById('pathSlider').value) / 100;
  const mode = document.getElementById('viewMode').value;
  const groups = [...renderedInstances.entries()].sort((a,b) => instanceState[a[0]].order - instanceState[b[0]].order);
  let allLines = [];
  groups.forEach(([id, group]) => {
    group.children.forEach((line, index) => {
      line.visible = line.userData.layer <= maxLayer;
      if (line.visible) allLines.push({ line, id, index, group });
    });
  });
  const visibleCount = Math.floor(allLines.length * progress);
  allLines.forEach((entry, i) => entry.line.visible = entry.line.visible && i < visibleCount);

  if (mode === 'tool') {
    refreshToolColors();
  } else if (mode === 'order') {
    const colors = ['#68A0FF', '#B98CFF', '#FF9E67', '#62D8B5'];
    groups.forEach(([id, group], idx) => group.traverse(child => { if (child.isLine) child.material.color.set(colors[idx % colors.length]); }));
  } else {
    groups.forEach(([id, group]) => group.traverse(child => {
      if (!child.isLine) return;
      const speed = toolState[child.userData.toolKey].speed;
      const t = Math.max(0, Math.min(1, (speed - 20) / 40));
      child.material.color.setHSL((1 - t) * 0.6, 0.75, 0.56);
    }));
  }
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

buildInstances();
resize();
animate();

// Tabs
const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
}));

// Object + tool accordions
document.querySelectorAll('.object-header').forEach(btn => btn.addEventListener('click', () => btn.closest('.object-card').classList.toggle('collapsed')));
document.querySelectorAll('.tool-toggle').forEach(btn => btn.addEventListener('click', () => btn.closest('.tool-row').classList.toggle('expanded')));

// Tool values
document.querySelectorAll('.tool-row').forEach(row => {
  const key = row.dataset.tool;
  row.querySelector('.tool-speed').addEventListener('input', e => { toolState[key].speed = Number(e.target.value); refreshVisibility(); });
  row.querySelector('.tool-erate').addEventListener('input', e => { toolState[key].erate = Number(e.target.value); });
});

// Palette: stays open after selection.
const popover = document.getElementById('colorPopover');
const paletteGrid = document.getElementById('paletteGrid');
let activeTool = null;
palette.forEach(c => {
  const b = document.createElement('button');
  b.className = 'palette-swatch';
  b.style.setProperty('--swatch', c.hex);
  b.title = c.name;
  b.addEventListener('click', () => {
    if (!activeTool) return;
    toolState[activeTool].color = c.hex;
    toolState[activeTool].name = c.name;
    const row = document.querySelector(`[data-tool="${activeTool}"]`);
    row.querySelector('.color-chip').style.setProperty('--tool-color', c.hex);
    row.querySelector('.tool-name').textContent = c.name;
    paletteGrid.querySelectorAll('.palette-swatch').forEach(x => x.classList.toggle('active', x === b));
    refreshToolColors();
  });
  paletteGrid.appendChild(b);
});

document.querySelectorAll('.color-chip').forEach(chip => chip.addEventListener('click', e => {
  e.stopPropagation();
  const row = chip.closest('.tool-row');
  activeTool = row.dataset.tool;
  const chipRect = chip.getBoundingClientRect();
  const viewRect = viewport.getBoundingClientRect();
  popover.hidden = false;
  popover.style.left = `${Math.max(14, Math.min(viewRect.width - 278, 18))}px`;
  popover.style.top = `${Math.max(14, Math.min(viewRect.height - 280, chipRect.top - viewRect.top))}px`;
  paletteGrid.querySelectorAll('.palette-swatch').forEach((x, i) => x.classList.toggle('active', palette[i].hex.toLowerCase() === toolState[activeTool].color.toLowerCase()));
}));
document.getElementById('closePalette').addEventListener('click', () => popover.hidden = true);
viewport.addEventListener('pointerdown', e => {
  if (!popover.hidden && !popover.contains(e.target) && !e.target.classList.contains('color-chip')) popover.hidden = true;
});
popover.addEventListener('pointerdown', e => e.stopPropagation());

// Sliders + view
document.getElementById('layerSlider').addEventListener('input', e => {
  document.getElementById('layerValue').textContent = e.target.value;
  refreshVisibility();
});
document.getElementById('pathSlider').addEventListener('input', refreshVisibility);
document.getElementById('viewMode').addEventListener('change', refreshVisibility);

// Print order drag
const orderList = document.getElementById('orderList');
let dragged = null;
orderList.querySelectorAll('.order-item').forEach(item => {
  item.addEventListener('dragstart', () => { dragged = item; item.classList.add('dragging'); });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    [...orderList.children].forEach((el, i) => {
      el.querySelector('span:last-child').textContent = String(i + 1).padStart(2, '0');
      instanceState[el.dataset.id].order = i + 1;
    });
    refreshVisibility();
  });
  item.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragged || dragged === item) return;
    const rect = item.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    orderList.insertBefore(dragged, before ? item : item.nextSibling);
  });
});

// Arrange prototype
function autoArrange() {
  const spacing = Number(document.getElementById('spacing').value);
  instanceState['A-1'].x = -45 - spacing * 0.25;
  instanceState['A-1'].y = -18;
  instanceState['A-2'].x = 45 + spacing * 0.25;
  instanceState['A-2'].y = -18;
  instanceState['B-1'].x = 0;
  instanceState['B-1'].y = 58 + spacing * 0.2;
  buildInstances();
}
document.getElementById('autoArrange').addEventListener('click', autoArrange);

// Generate prototype output
function buildGcodePreview() {
  const width = Number(document.getElementById('printWidth').value);
  const height = Number(document.getElementById('printHeight').value);
  const speed = Number(document.getElementById('printSpeed').value);
  const lines = [
    '; PATHLOOM prototype',
    `; print_width=${width}`,
    `; print_height=${height}`,
    `; base_print_speed=${speed}`,
    `; order=${Object.keys(instanceState).sort((a,b)=>instanceState[a].order-instanceState[b].order).join(' > ')}`,
    '; Toolpath-to-G-code generation is the next implementation stage.'
  ];
  return lines.join('\n');
}

document.getElementById('generateBtn').addEventListener('click', () => {
  const text = buildGcodePreview();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pathloom-preview.gcode';
  a.click();
  URL.revokeObjectURL(url);
});
