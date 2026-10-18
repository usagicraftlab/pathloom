export function durationText(seconds) {
  const total = Math.ceil(seconds);
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return `${h ? `${h}h ` : ''}${m}m ${s}s`;
}
export function thumbnailBlock(kind, width, height, base64) {
  return [`; ${kind} begin ${width}x${height} ${base64.length}`,
    ...base64.match(/.{1,78}/g).map(line => `; ${line}`), `; ${kind} end`].join('\n');
}
// Lossless QOI encoding using run, index, difference and luma opcodes.
export function encodeQoi(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<=0 || height<=0 || rgba.length!==width*height*4) throw new Error('Invalid QOI image');
  const bytes = new Uint8Array(14 + width * height * 5 + 8);
  bytes.set([113,111,105,102]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4,width);view.setUint32(8,height);bytes[12]=4;bytes[13]=0;
  const index=new Uint8Array(64*4);
  let offset=14,run=0,pr=0,pg=0,pb=0,pa=255;
  for(let i=0;i<rgba.length;i+=4){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2],a=rgba[i+3];
    if(r===pr&&g===pg&&b===pb&&a===pa){
      run++;
      if(run===62||i===rgba.length-4){bytes[offset++]=192|(run-1);run=0}
      continue;
    }
    if(run){bytes[offset++]=192|(run-1);run=0}
    const hash=(r*3+g*5+b*7+a*11)%64,j=hash*4;
    if(index[j]===r&&index[j+1]===g&&index[j+2]===b&&index[j+3]===a){bytes[offset++]=hash}
    else{
      index.set([r,g,b,a],j);
      if(a!==pa){bytes[offset++]=255;bytes.set([r,g,b,a],offset);offset+=4}
      else{
        const dr=r-pr,dg=g-pg,db=b-pb,drg=dr-dg,dbg=db-dg;
        if(dr>=-2&&dr<=1&&dg>=-2&&dg<=1&&db>=-2&&db<=1)bytes[offset++]=64|((dr+2)<<4)|((dg+2)<<2)|(db+2);
        else if(dg>=-32&&dg<=31&&drg>=-8&&drg<=7&&dbg>=-8&&dbg<=7){bytes[offset++]=128|(dg+32);bytes[offset++]=((drg+8)<<4)|(dbg+8)}
        else{bytes[offset++]=254;bytes.set([r,g,b],offset);offset+=3}
      }
    }
    pr=r;pg=g;pb=b;pa=a;
  }
  bytes.set([0,0,0,0,0,0,0,1],offset);
  return bytes.slice(0,offset+8);
}
export function progressCommand(elapsed, total) {
  return `M73 P${total ? Math.min(99,Math.floor(elapsed/total*100)) : 0} R${Math.ceil(Math.max(0,total-elapsed)/60)}`;
}
export function usageComments(usage, diameter) {
  const highest=Math.max(...[...usage.keys()].map(Number));
  const lengths=Array.from({length:highest+1},(_,tool)=>usage.get(String(tool))||0);
  const area=Math.PI*(diameter/2)**2;
  return [`; filament used [mm] = ${lengths.map(mm=>mm.toFixed(2)).join(', ')}`,
    `; filament used [cm3] = ${lengths.map(mm=>(mm*area/1000).toFixed(2)).join(', ')}`];
}

export function validatePauseLayers(layers,max=100000){if(layers===undefined)return[];if(!Array.isArray(layers)||layers.length>2000||new Set(layers).size!==layers.length||layers.some(layer=>!Number.isInteger(layer)||layer<1||layer>max))throw new Error('Invalid pause layers');return [...layers].sort((a,b)=>a-b)}
export function pauseGcode(layer,layers){return (layers||[]).includes(layer)?[';PAUSE_PRINT',`M601 ; Pause before layer ${layer}`]:[]}
