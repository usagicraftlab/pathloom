export const DEFAULT_PRINT_INTRO=Object.freeze({enabled:false,gap:2.5,length:10,angle:0});
export function printIntroSettings(output){const intro={...DEFAULT_PRINT_INTRO,...output?.intro};if(typeof intro.enabled!=='boolean'||!Number.isFinite(intro.gap)||intro.gap<.1||intro.gap>200||!Number.isFinite(intro.length)||intro.length<.1||intro.length>200||!Number.isFinite(intro.angle)||intro.angle< -360||intro.angle>360)throw new Error('Invalid Print output intro line settings');return intro}
// Geometry is already ordered and assigned tools. Insert exactly one open path
// per object, at the same Z/tool as its first actual print path.
export function addPrintIntro(paths,output){
  const intro=printIntroSettings(output);if(!intro.enabled||!paths.length)return paths;
  const first=paths[0],start=first.points[0],radians=intro.angle*Math.PI/180,direction=[Math.cos(radians),Math.sin(radians)];
  const at=distance=>[Number((start[0]+direction[0]*distance).toFixed(6)),Number((start[1]+direction[1]*distance).toFixed(6)),start[2]];
  return [{tool:first.tool,order:0,points:[at(intro.gap+intro.length),at(intro.gap)]},...paths.map((path,index)=>({...path,order:index+1}))];
}
