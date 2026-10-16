const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

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
      const start = path.points[0];
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
      for (let index = 1; index < path.points.length; index++) {
        const length = distance(path.points[index - 1], path.points[index]);
        printDistance += length;
        printSeconds += length / path.speed;
      }
      previous = path.points.at(-1);
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
      let length = 0;
      for (let index = 1; index < path.points.length; index++) {
        length += distance(path.points[index - 1], path.points[index]);
      }
      const tool = String(path.tool);
      usage.set(tool, (usage.get(tool) ?? 0) + length * extrusionPerMm * multiplier);
    }
  }
  return usage;
}
