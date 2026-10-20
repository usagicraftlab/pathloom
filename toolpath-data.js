// Shared file/project/output contracts. Logical tool IDs remain independent of
// physical output tools, whose assignment is intentionally shared by the UI.
export const BASIC_FIELDS = ['printWidth', 'printHeight', 'printSpeed', 'travelSpeed', 'nozzleTemperature', 'bedTemperature', 'fanSpeed'];
export const MAX_PROJECT_POINTS = 2_000_000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validatePrintSettings(settings) {
  for (const key of BASIC_FIELDS) {
    const value = settings?.[key];
    if (!finite(value) || value < 0 || (['printWidth', 'printHeight', 'printSpeed', 'travelSpeed'].includes(key) && value === 0)) throw new Error(`Check ${key}: enter ${key.includes('Temperature') || key === 'fanSpeed' ? 'a nonnegative' : 'a positive'} finite number`);
  }
  if (settings.fanSpeed > 100) throw new Error('Fan speed must be between 0 and 100%');
  return settings;
}

export function validateToolSettings(tool) {
  if (!tool || !/^#[0-9a-f]{6}$/i.test(tool.color) || typeof tool.name !== 'string' || !finite(tool.erate) || tool.erate < 0 || (tool.speedOverride !== null && (!finite(tool.speedOverride) || tool.speedOverride <= 0))) throw new Error('Invalid tool values');
  if (tool.outputTool !== undefined) validateOutputTool(tool.outputTool);
  return tool;
}

export function validateOutputTool(value) {
  if (!/^(0|[1-9]\d{0,2})$/.test(String(value)) || Number(value) > 255) throw new Error(`Output tool “${String(value).slice(0,40)}” is invalid. Choose a physical tool between T0 and T255.`);
  return String(value);
}

export function normalizeToolpath(raw, filename = 'Untitled.toolpath', {allowEmpty = false} = {}) {
  if (!raw || !Array.isArray(raw.paths)) throw new Error('Missing paths[]');
  if (!allowEmpty && !raw.paths.length) throw new Error('Toolpath contains no paths');
  let count = 0;
  const paths = raw.paths.map((path, index) => {
    if (!path || !Array.isArray(path.points) || path.points.length < 2) throw new Error(`Path ${index + 1} needs at least 2 points`);
    count += path.points.length;
    if (count > MAX_PROJECT_POINTS) throw new Error('Toolpath exceeds 2,000,000 points');
    const points = path.points.map(p => {
      if (!Array.isArray(p) || p.length < 3 || p.slice(0, 3).some(v => !(finite(v) || typeof v === 'string' && v.trim() && Number.isFinite(Number(v))))) throw new Error(`Invalid XYZ point in path ${index + 1}`);
      return p.slice(0, 3).map(Number);
    });
    const tool = String(path.tool ?? 0);
    if (!tool || tool.length > 120 || /[\x00-\x1f\x7f]/.test(tool)) throw new Error(`Invalid tool ID in path ${index + 1}`);
    return {order: Number.isFinite(Number(path.order)) ? Number(path.order) : index, tool, points};
  }).sort((a, b) => a.order - b.order);
  if(new Set(paths.map(path=>path.tool)).size>256)throw new Error('Toolpath exceeds 256 logical tools');
  const zs = [...new Set(paths.map(p => Number(p.points[0][2].toFixed(4))))].sort((a, b) => a - b);
  const layers = new Map(zs.map((z, i) => [z, i + 1]));
  for (const path of paths) path.layer = layers.get(Number(path.points[0][2].toFixed(4)));
  return {filename, paths, maxLayer: Math.max(1, zs.length)};
}

// Sparse or externally assigned IDs must not create millions of empty UI rows.
export function toolSlots(tools) {
  const numeric = [...tools.keys()].filter(id => /^\d+$/.test(id)).map(Number);
  const maximum = numeric.reduce((max,id)=>Math.max(max,id),-1);
  if (maximum > 15) return [...tools];
  return [...Array.from({length: maximum + 1}, (_, id) => [String(id), tools.get(String(id))]), ...[...tools].filter(([id]) => !/^\d+$/.test(id))];
}

export function outputToolOptions(value) {
  const ids = ['0', '1', '2', '3', '4'];
  if (!ids.includes(String(value))) ids.push(String(value));
  return ids;
}

export function printableBounds(orderedInstances, sources, volume) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0, count = 0;
  if (!['bedWidth', 'bedDepth', 'maxHeight'].every(k => finite(volume[k]) && volume[k] > 0)) throw new Error('Check printer build volume');
  for (const [, instance] of orderedInstances) {
    const source = sources.get(instance.source);
    if (!source) throw new Error('A placed object references a missing source');
    if (![instance.x, instance.y, instance.rotation].every(finite)) throw new Error(`${source.label}: invalid placement`);
    const a = instance.rotation * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (const path of source.paths) {
      if (!Array.isArray(path.points) || path.points.length < 2) throw new Error(`${source.label}: a path needs at least two points`);
      const tool = source.tools.get(String(path.tool));
      validateToolSettings(tool); validateOutputTool(tool.outputTool ?? path.tool);
      for (const point of path.points) {
        if (!Array.isArray(point) || point.length !== 3 || !point.every(finite)) throw new Error(`${source.label}: invalid XYZ coordinates`);
        const [x, y, z] = point;
        if (z < 0) throw new Error(`${source.label}: path is below the bed (Z ${z} mm). Move it to Z ≥ 0 before exporting.`);
        const px = x * cos - y * sin + instance.x + volume.bedWidth / 2;
        const py = x * sin + y * cos + instance.y + volume.bedDepth / 2;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); maxZ = Math.max(maxZ, z); count++;
      }
    }
  }
  if (!count) throw new Error('Connect printable geometry to Print output before exporting');
  if (minX < -1e-7 || minY < -1e-7 || maxX > volume.bedWidth + 1e-7 || maxY > volume.bedDepth + 1e-7 || maxZ > volume.maxHeight + 1e-7) throw new Error('Objects extend outside the configured build volume');
  return {minX, maxX, minY, maxY, maxZ};
}
