const distance = (a, b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
// Paths are immutable snapshots. Rotation/translation preserve extrusion length.
const lengths = new WeakMap();
export function pathLength(points) {
  if(lengths.has(points))return lengths.get(points);
  let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);
  lengths.set(points,length);return length;
}
function endpoint(point,placement){
  if(!placement)return point;
  const a=placement.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [point[0]*c-point[1]*s+placement.x,point[0]*s+point[1]*c+placement.y,point[2]];
}

// Instances and paths must already be in the same order as G-code output.
export function estimatePrintTime(instances, travelSpeed, maxHeight, initialTool = null) {
  if (!(Number.isFinite(travelSpeed) && travelSpeed > 0)) throw new Error('Check travel speed');
  let printDistance = 0, travelDistance = 0, printSeconds = 0, toolChanges = 0;
  let previous = null, currentTool = initialTool;
  for (const instance of instances) {
    let first = true;
    for (const path of instance.paths) {
      if (!path.points.length) continue;
      if (!(Number.isFinite(path.speed) && path.speed > 0)) throw new Error('Check print speed');
      const start = endpoint(path.points[0],path.placement);
      if (previous) {
        // G-code travels in Z first, then XY. Between objects it lifts 10 mm.
        const travelZ = first ? Math.min(maxHeight, instance.previousMaxZ + 10) : start[2];
        travelDistance += Math.abs(travelZ - previous[2])
          + Math.hypot(start[0] - previous[0], start[1] - previous[1])
          + Math.abs(start[2] - travelZ);
      }
      const tool = String(path.tool);
      if (currentTool !== null && currentTool !== tool) toolChanges++;
      currentTool = tool;
      const length=pathLength(path.points);printDistance+=length;printSeconds+=length/path.speed;
      previous = endpoint(path.points.at(-1),path.placement);
      first = false;
    }
  }
  const travelSeconds = travelDistance / travelSpeed;
  const toolChangeSeconds = toolChanges * 30;
  return { printDistance, travelDistance, printSeconds, travelSeconds, toolChanges, toolChangeSeconds,
    totalSeconds: printSeconds + travelSeconds + toolChangeSeconds };
}

export function estimateFilamentUsage(instances, width, height, diameter) {
  if (![width, height, diameter].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Check print width, height and filament diameter');
  }
  const extrusionPerMm = width * height / (Math.PI * (diameter / 2) ** 2);
  const usage = new Map();
  for (const instance of instances) {
    for (const path of instance.paths) {
      const multiplier = path.erate ?? 1;
      if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error('Check E-rate');
      const length = pathLength(path.points);
      const tool = String(path.tool);
      usage.set(tool, (usage.get(tool) ?? 0) + length * extrusionPerMm * multiplier);
    }
  }
  return usage;
}
