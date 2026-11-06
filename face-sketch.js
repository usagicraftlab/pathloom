// Face-bound curve data stays in local 2D coordinates. Meshes are display data;
// bounds and normals keep the local frame stable across STEP retessellation.
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=value=>{const length=Math.hypot(...value);return length>1e-9?value.map(axis=>axis/length):null};
const faceCenter=face=>face.bounds[0].map((value,axis)=>(value+face.bounds[1][axis])/2);

export const FACE_POLYLINE_SPEC={
  label:'Polyline',group:'Curve',
  description:'Pick a planar STEP face, then place points directly on that face.',
  accepts:'surface',returns:'curve',params:{closed:'boolean',constraint:'number'},defaults:{closed:false,constraint:0},
  choices:{constraint:[{value:0,label:'Free'},{value:1,label:'Horizontal'},{value:2,label:'Vertical'}]},
};
export const FACE_SPLINE_SPEC={
  label:'Spline',group:'Curve',
  description:'Pick a planar STEP face, then place spline control points on that face.',
  accepts:'surface',returns:'curve',params:{closed:'boolean',constraint:'number',tension:'number',samples:'number'},
  defaults:{closed:false,constraint:0,tension:0,samples:96},
  choices:{constraint:[{value:0,label:'Free'},{value:1,label:'Horizontal'},{value:2,label:'Vertical'}]},
  constraints:{tension:{min:0,max:1},samples:{min:8,max:720,integer:true}},
};
export const isFaceSketchOperation=operation=>operation==='face-polyline'||operation==='face-spline';

export const surfaceFromInput=input=>input&&Object.assign([...input.meshes],{faces:input.faces});

export function surfaceFacePlane(surface,faceIndex){
  if(!Array.isArray(surface)||!Number.isInteger(faceIndex))return null;
  let triangle=null;
  for(const mesh of surface){
    const triangleIndex=mesh.triangleFaces?.findIndex(index=>index===faceIndex);
    if(triangleIndex<0)continue;
    const indices=mesh.indices.slice(triangleIndex*3,triangleIndex*3+3);
    const points=indices.map(index=>mesh.positions.slice(index*3,index*3+3));
    const normal=normalize(cross(subtract(points[1],points[0]),subtract(points[2],points[0])));
    if(normal){triangle={points,normal};break}
  }
  if(!triangle)return null;
  const descriptor=surface.faces?.[faceIndex];
  const center=descriptor?.bounds?.length===2?faceCenter(descriptor):triangle.points[0];
  let normal=triangle.normal;
  if(descriptor?.normal&&dot(normal,descriptor.normal)<0)normal=normal.map(value=>-value);
  const anchor=triangle.points[0];
  const origin=center.map((value,index)=>value-normal[index]*dot(subtract(center,anchor),normal));
  const guide=Math.abs(normal[2])<.9?[0,0,1]:[0,1,0];
  const u=normalize(cross(guide,normal)),v=normalize(cross(normal,u));
  return{origin,u,v,normal};
}

export function facePointToUv(point,plane){const delta=subtract(point,plane.origin);return[dot(delta,plane.u),dot(delta,plane.v)]}
export function faceUvToPoint(point,plane){return plane.origin.map((value,index)=>value+plane.u[index]*point[0]+plane.v[index]*point[1])}
export function constrainFacePoint(point,previous,mode=0){
  if(!previous)return[...point];
  if(mode===1)return[point[0],previous[1]];
  if(mode===2)return[previous[0],point[1]];
  return[...point];
}

export function executeFacePolyline(source,sketch,closed=false){
  const plane=surfaceFacePlane(source,sketch?.faceIndex);
  if(!plane)throw new Error('Polyline needs a valid planar STEP face');
  const points=sketch.points.map(point=>faceUvToPoint(point,plane));
  if(points.length<2)throw new Error('Polyline needs at least two points');
  if(closed&&points.length>2)points.push([...points[0]]);
  return[{points,faceIndex:sketch.faceIndex,inputId:sketch.inputId}];
}

function sampleSpline(points,{closed=false,tension=0,samples=96}={}){
  if(points.length<2)throw new Error('Spline needs at least two control points');
  if(closed&&points.length<3)throw new Error('Closed Spline needs at least three control points');
  const count=closed?points.length:points.length-1,perSegment=Math.max(2,Math.ceil(samples/count)),result=[];
  const at=index=>closed?points[(index+points.length)%points.length]:points[Math.max(0,Math.min(points.length-1,index))];
  for(let segment=0;segment<count;segment++){
    const p0=at(segment-1),p1=at(segment),p2=at(segment+1),p3=at(segment+2),scale=(1-tension)/2;
    for(let index=0;index<perSegment;index++){
      if(segment&&index===0)continue;
      const t=index/perSegment,t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
      result.push(p1.map((value,axis)=>h00*value+h10*(p2[axis]-p0[axis])*scale+h01*p2[axis]+h11*(p3[axis]-p1[axis])*scale));
    }
  }
  if(closed)result.push([...result[0]]);else result.push([...points.at(-1)]);
  return result;
}

export function executeFaceSketch(source,step,params={}){
  if(step.operation==='face-polyline')return executeFacePolyline(source,step.sketch,params.closed);
  const plane=surfaceFacePlane(source,step.sketch?.faceIndex);
  if(!plane)throw new Error('Spline needs a valid planar STEP face');
  const points=sampleSpline(step.sketch.points,params).map(point=>faceUvToPoint(point,plane));
  return[{points,faceIndex:step.sketch.faceIndex,inputId:step.sketch.inputId,controlPoints:step.sketch.points.length}];
}

export function validateFaceSketch(step,inputs,finite=Number.isFinite){
  const sketch=step.sketch,input=inputs.get(sketch?.inputId);
  return !!sketch&&typeof sketch==='object'&&typeof sketch.inputId==='string'&&
    step.source===`input:${sketch.inputId}`&&Number.isInteger(sketch.faceIndex)&&sketch.faceIndex>=0&&
    input?.faces?.[sketch.faceIndex]?.planar===true&&Array.isArray(sketch.points)&&sketch.points.length<=256&&
    sketch.points.every(point=>Array.isArray(point)&&point.length===2&&point.every(value=>finite(value)&&Math.abs(value)<=10000));
}

export function matchFaceIndex(old,faces,{offset=[0,0,0],moved=true}={}){
  const center=faceCenter(old).map((value,axis)=>value+(moved?offset[axis]:0));
  let best=null,score=Infinity;
  for(const face of faces){
    if(!face.planar)continue;
    const nextCenter=faceCenter(face);
    const distance=nextCenter.reduce((sum,value,axis)=>sum+(value-center[axis])**2,0);
    const area=Math.abs(Math.log(Math.max(face.area,1e-9)/Math.max(old.area,1e-9)));
    const normal=old.normal&&face.normal?1-Math.abs(dot(old.normal,face.normal)):0;
    const current=distance+area*area+normal*100;
    if(current<score){score=current;best=face.index}
  }
  return best;
}

export function remapFaceSketches(definition,input,result,{offset=[0,0,0],movedFaces=null}={}){
  for(const step of definition.steps){
    if(!isFaceSketchOperation(step.operation)||step.sketch?.inputId!==input.id)continue;
    const old=input.faces[step.sketch.faceIndex];if(!old)continue;
    const moved=!movedFaces||!movedFaces.size||movedFaces.has(old.index);
    const faceIndex=matchFaceIndex(old,result.faces,{offset,moved});
    if(faceIndex!==null)step.sketch.faceIndex=faceIndex;
  }
}
