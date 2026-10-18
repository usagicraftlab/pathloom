const flattenTriplets=value=>Array.isArray(value?.[0])?value.flat(Infinity):Array.from(value||[]);
export function normalizeStepResult(result,filename){
  if(!result?.success||!Array.isArray(result.meshes))throw new Error(result?.error||'STEP file could not be read');
  const meshes=result.meshes.map(mesh=>{
    const positions=flattenTriplets(mesh.attributes?.position?.array),indices=flattenTriplets(mesh.index?.array);
    if(!positions.length||positions.length%3||!positions.every(Number.isFinite))return null;
    const vertexCount=positions.length/3;if(vertexCount>500000)throw new Error('STEP model exceeds 500,000 vertices');
    const normals=flattenTriplets(mesh.attributes?.normal?.array);
    const indexArray=indices.length?indices:Array.from({length:vertexCount},(_,i)=>i);
    const brepFaces=Array.isArray(mesh.brep_faces)?mesh.brep_faces.filter(face=>Number.isInteger(face.first)&&Number.isInteger(face.last)&&face.first>=0&&face.last>=face.first&&face.last<indexArray.length/3).map(face=>({first:face.first,last:face.last})):[];
    return {name:String(mesh.name||filename).slice(0,120),positions,normals:normals.length===positions.length?normals:[],indices:indexArray,color:Array.isArray(mesh.color)?mesh.color.slice(0,3).map(v=>Math.max(0,Math.min(1,Number(v)||0))):[.72,.76,.81],brepFaces};
  }).filter(Boolean);
  validateStepMeshes(meshes);
  if(!meshes.length)throw new Error('STEP file contains no displayable solid geometry');
  const total=meshes.reduce((sum,mesh)=>sum+mesh.positions.length/3,0);if(total>1000000)throw new Error('STEP model exceeds 1,000,000 vertices');
  return {id:`shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name:filename,visible:true,meshes};
}

export function parseStepBuffer(buffer, filename){
  if(!buffer.byteLength||buffer.byteLength>100*1024*1024)return Promise.reject(new Error('Choose a STEP file smaller than 100 MB'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./vendor/occt/occt-import-js-worker.js',import.meta.url));
    const finish=(error,result)=>{clearTimeout(timer);worker.terminate();if(error)reject(error);else resolve(result)};
    const timer=setTimeout(()=>finish(new Error('STEP import timed out; try a simpler model')),180000);
    worker.onerror=event=>finish(new Error(event.message||'STEP importer failed'));
    worker.onmessage=event=>{try{finish(null,normalizeStepResult(event.data,filename))}catch(error){finish(error)}};
    worker.postMessage({buffer},[buffer]);
  });
}
export async function chooseStepShape(){
  let name,buffer;
  if(window.__TAURI__?.core?.invoke){const shape=await window.__TAURI__.core.invoke('choose_editable_step');if(!shape)return null;validateEditableShape(shape);return {...shape,id:crypto.randomUUID()}}
  else {const file=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.step,.stp';input.hidden=true;document.body.append(input);input.addEventListener('change',()=>{resolve(input.files[0]||null);input.remove()},{once:true});input.addEventListener('cancel',()=>{resolve(null);input.remove()},{once:true});input.click()});if(!file)return null;name=file.name;buffer=await file.arrayBuffer()}
  return parseStepBuffer(buffer,name);
}
export function validateStepMeshes(meshes){
  if(!Array.isArray(meshes)||meshes.length>1024)throw new Error('Invalid STEP meshes');
  let vertices=0,triangles=0;
  for(const mesh of meshes){if(!Array.isArray(mesh.positions)||!mesh.positions.length||mesh.positions.length%3||mesh.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>1000000)||!Array.isArray(mesh.indices)||!mesh.indices.length||mesh.indices.length%3||mesh.indices.some(v=>!Number.isInteger(v)||v<0||v>=mesh.positions.length/3))throw new Error('Invalid STEP mesh coordinates or indices');vertices+=mesh.positions.length/3;triangles+=mesh.indices.length/3}
  if(vertices>1000000||triangles>2000000)throw new Error('STEP display mesh exceeds supported limits');return meshes;
}

export function validateBrep(brep){
  if(brep===undefined)return;
  if(!brep||brep.format!=='occt-brep'||brep.version!==1||typeof brep.data!=='string'||!brep.data.includes('CASCADE Topology')||brep.data.length>100*1024*1024||typeof brep.original!=='string'||brep.original.length>100*1024*1024||!Array.isArray(brep.history)||brep.history.length>256||brep.history.some(edit=>!['move-faces','translate'].includes(edit.operation)||!Array.isArray(edit.faceIndices)||(edit.operation==='move-faces'&&!edit.faceIndices.length)||edit.faceIndices.some(i=>!Number.isInteger(i)||i<0)||!Array.isArray(edit.offset)||edit.offset.length!==3||edit.offset.some(v=>!Number.isFinite(v)||Math.abs(v)>1000)))throw new Error('Invalid editable B-rep data');
}
export function validateEditableShape(shape){
  validateStepMeshes(shape?.meshes);validateBrep(shape?.brep);
  if(!shape?.brep||!Array.isArray(shape.faces)||!shape.faces.length||shape.faces.length>200000||shape.faces.some((face,index)=>face.index!==index||typeof face.planar!=='boolean'||!Number.isFinite(face.area)||!Array.isArray(face.bounds)||face.bounds.length!==2||face.bounds.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))))throw new Error('Invalid editable CAD face data');
  for(const mesh of shape.meshes)if(!Array.isArray(mesh.triangleFaces)||mesh.triangleFaces.length!==mesh.indices.length/3||mesh.triangleFaces.some(i=>!Number.isInteger(i)||i<0||i>=shape.faces.length))throw new Error('Invalid CAD face mapping');
  return shape;
}
export async function moveStepFaces(shape,faceIndices,offset,whole=false){
  if(!window.__TAURI__?.core?.invoke)throw new Error('Editable B-rep operations require Pathloom Desktop');
  validateEditableShape(shape);
  const result=await window.__TAURI__.core.invoke('edit_step_faces',{brep:shape.brep,faceIndices,offset,whole,name:shape.filename||shape.name});
  return validateEditableShape(result);
}
