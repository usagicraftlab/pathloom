const flattenTriplets=value=>Array.isArray(value?.[0])?value.flat(Infinity):Array.from(value||[]);
export function normalizeStepResult(result,filename){
  if(!result?.success||!Array.isArray(result.meshes))throw new Error('STEP file could not be read');
  const meshes=result.meshes.map(mesh=>{
    const positions=flattenTriplets(mesh.attributes?.position?.array),indices=flattenTriplets(mesh.index?.array);
    if(!positions.length||positions.length%3||!positions.every(Number.isFinite))return null;
    const vertexCount=positions.length/3;if(vertexCount>500000)throw new Error('STEP model exceeds 500,000 vertices');
    const normals=flattenTriplets(mesh.attributes?.normal?.array);
    const indexArray=indices.length?indices:Array.from({length:vertexCount},(_,i)=>i);
    const brepFaces=Array.isArray(mesh.brep_faces)?mesh.brep_faces.filter(face=>Number.isInteger(face.first)&&Number.isInteger(face.last)&&face.first>=0&&face.last>=face.first&&face.last<indexArray.length/3).map(face=>({first:face.first,last:face.last})):[];
    return {name:String(mesh.name||filename).slice(0,120),positions,normals:normals.length===positions.length?normals:[],indices:indexArray,color:Array.isArray(mesh.color)?mesh.color.slice(0,3).map(v=>Math.max(0,Math.min(1,Number(v)||0))):[.72,.76,.81],brepFaces};
  }).filter(Boolean);
  if(!meshes.length)throw new Error('STEP file contains no displayable solid geometry');
  const total=meshes.reduce((sum,mesh)=>sum+mesh.positions.length/3,0);if(total>1000000)throw new Error('STEP model exceeds 1,000,000 vertices');
  return {id:`shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name:filename,visible:true,meshes};
}
