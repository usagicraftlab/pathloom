const pos=(positions,index)=>[positions[index*3],positions[index*3+1],positions[index*3+2]];
function intersectionsForTriangle(points,z){
  const hits=[];for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3];if((a[2]<=z&&b[2]>z)||(b[2]<=z&&a[2]>z)){const t=(z-a[2])/(b[2]-a[2]);hits.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])}}
  if(hits.length!==2||Math.hypot(hits[0][0]-hits[1][0],hits[0][1]-hits[1][1])<1e-8)return null;return hits;
}
function stitchSegments(segments,z,epsilon){
  const nodes=new Map(),edges=[],keyOf=point=>`${Math.round(point[0]/epsilon)},${Math.round(point[1]/epsilon)}`;
  const getNode=point=>{const key=keyOf(point);let node=nodes.get(key);if(!node){node={key,point:[point[0],point[1]],edges:[]};nodes.set(key,node)}return node};
  for(const segment of segments){const a=getNode(segment[0]),b=getNode(segment[1]);if(a===b)continue;const id=edges.length;edges.push({a:a.key,b:b.key,used:false});a.edges.push(id);b.edges.push(id)}
  const paths=[];
  const walk=(first,start)=>{
    const points=[nodes.get(start).point];let current=start,edge=first,guard=edges.length+1,closed=false;
    while(edge&&guard-->0){edge.used=true;current=edge.a===current?edge.b:edge.a;points.push(nodes.get(current).point);if(current===start){closed=true;break}
      const candidates=nodes.get(current).edges.map(id=>edges[id]).filter(next=>!next.used);if(!candidates.length)break;
      let next=candidates[0];if(candidates.length>1){const incoming=[points.at(-1)[0]-points.at(-2)[0],points.at(-1)[1]-points.at(-2)[1]];let best=Infinity;for(const candidate of candidates){const target=candidate.a===current?candidate.b:candidate.a,p=nodes.get(target).point,out=[p[0]-points.at(-1)[0],p[1]-points.at(-1)[1]],angle=Math.abs(Math.atan2(incoming[0]*out[1]-incoming[1]*out[0],incoming[0]*out[0]+incoming[1]*out[1]));if(angle<best){best=angle;next=candidate}}}edge=next;
    }
    if(points.length>=2){const path=points.map(([x,y])=>[x,y,z]);if(closed)path[path.length-1]=[...path[0]];paths.push(path)}
  };
  // Open surface intersections end at odd-degree nodes. Start there first so
  // each open chain is emitted once, then consume any remaining closed loops.
  for(const node of nodes.values())if(node.edges.length!==2)for(const id of node.edges){if(!edges[id].used)walk(edges[id],node.key)}
  for(const edge of edges)if(!edge.used)walk(edge,edge.a);
  return paths;
}
export function sliceMeshesToPaths(meshes,layerHeight,{preserveHeight=false}={}){
  if(!Number.isFinite(layerHeight)||layerHeight<.05||layerHeight>10)throw new Error('Layer height must be between 0.05 and 10 mm');
  let minZ=Infinity,maxZ=-Infinity,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,triangleCount=0;
  for(const mesh of meshes){triangleCount+=mesh.indices.length/3;for(let i=0;i<mesh.positions.length;i+=3){minX=Math.min(minX,mesh.positions[i]);maxX=Math.max(maxX,mesh.positions[i]);minY=Math.min(minY,mesh.positions[i+1]);maxY=Math.max(maxY,mesh.positions[i+1]);minZ=Math.min(minZ,mesh.positions[i+2]);maxZ=Math.max(maxZ,mesh.positions[i+2])}}
  if(!triangleCount||!Number.isFinite(minZ)||maxZ-minZ<layerHeight*.5)throw new Error('STEP model is too thin to slice at this layer height');
  const firstZ=minZ+layerHeight/2,layerCount=Math.floor((maxZ-firstZ)/layerHeight)+1;if(layerCount>2000)throw new Error('Slicing would create more than 2,000 layers');
  const byLayer=Array.from({length:layerCount},()=>[]);let segmentCount=0;
  for(const mesh of meshes)for(let t=0;t<mesh.indices.length/3;t++){
    const points=[pos(mesh.positions,mesh.indices[t*3]),pos(mesh.positions,mesh.indices[t*3+1]),pos(mesh.positions,mesh.indices[t*3+2])],low=Math.min(...points.map(p=>p[2])),high=Math.max(...points.map(p=>p[2]));if(high-low<1e-10)continue;
    const from=Math.max(0,Math.ceil((low-firstZ)/layerHeight-1e-10)),to=Math.min(layerCount-1,Math.floor((high-firstZ)/layerHeight+1e-10));
    for(let layer=from;layer<=to;layer++){const segment=intersectionsForTriangle(points,firstZ+layer*layerHeight);if(segment){byLayer[layer].push(segment);if(++segmentCount>500000)throw new Error('STEP slice exceeds 500,000 contour segments; use a coarser layer height or simpler mesh')}}
  }
  const paths=[],epsilon=Math.max(1e-6,Math.hypot(maxX-minX,maxY-minY)*1e-7);
  for(let layer=0;layer<byLayer.length;layer++){const z=firstZ+layer*layerHeight;for(const points of stitchSegments(byLayer[layer],preserveHeight?z:z-minZ,epsilon))paths.push({order:paths.length,tool:0,points})}
  if(!paths.length)throw new Error('No slice lines were found at the chosen layer height');
  if(paths.reduce((sum,path)=>sum+path.points.length,0)>1000000)throw new Error('STEP slice exceeds 1,000,000 output points');
  return paths;
}
