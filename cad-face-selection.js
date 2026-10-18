export function triangleIntersectsRectangle(points,rect){
  if(Math.max(...points.map(p=>p.x))<rect.left||Math.min(...points.map(p=>p.x))>rect.right||Math.max(...points.map(p=>p.y))<rect.top||Math.min(...points.map(p=>p.y))>rect.bottom)return false;
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const inside=p=>{const signs=points.map((a,i)=>cross(a,points[(i+1)%3],p));return signs.every(v=>v>=-1e-8)||signs.every(v=>v<=1e-8)};
  const corners=[{x:rect.left,y:rect.top},{x:rect.right,y:rect.top},{x:rect.right,y:rect.bottom},{x:rect.left,y:rect.bottom}];
  if(points.some(p=>p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom)||corners.some(inside))return true;
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){const a=points[i],b=points[(i+1)%3],c=corners[j],d=corners[(j+1)%4];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true}return false;
}
export function initFaceRangeSelection(api){
  const {canvas}=api.preview();const box=document.createElement('div');box.className='cad-face-range';box.hidden=true;document.body.append(box);let gesture=null;
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!event.metaKey||!event.shiftKey||!api.enabled())return;event.preventDefault();event.stopImmediatePropagation();gesture={id:event.pointerId,x:event.clientX,y:event.clientY,controls:api.preview().controls?.enabled};if(api.preview().controls)api.preview().controls.enabled=false;canvas.setPointerCapture(event.pointerId)},true);
  canvas.addEventListener('pointermove',event=>{if(!gesture)return;event.preventDefault();event.stopImmediatePropagation();box.hidden=false;Object.assign(box.style,{left:Math.min(gesture.x,event.clientX)+'px',top:Math.min(gesture.y,event.clientY)+'px',width:Math.abs(event.clientX-gesture.x)+'px',height:Math.abs(event.clientY-gesture.y)+'px'})},true);
  function finish(event,cancel=false){if(!gesture)return;event.preventDefault();event.stopImmediatePropagation();const start=gesture;gesture=null;box.hidden=true;if(canvas.hasPointerCapture(start.id))canvas.releasePointerCapture(start.id);if(api.preview().controls)api.preview().controls.enabled=start.controls;if(cancel)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<4){api.click(event);return}
    const rect={left:Math.min(start.x,event.clientX),right:Math.max(start.x,event.clientX),top:Math.min(start.y,event.clientY),bottom:Math.max(start.y,event.clientY)},screen=canvas.getBoundingClientRect(),{THREE,camera}=api.preview(),selected=new Map();
    for(const mesh of api.objects()){mesh.updateWorldMatrix(true,false);const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index.array,faces=mesh.userData.triangleFaces,id=mesh.userData.inputId;if(!faces)continue;for(let t=0;t<indices.length/3;t++){if(selected.get(id)?.has(faces[t]))continue;const points=[0,1,2].map(c=>{const p=new THREE.Vector3().fromBufferAttribute(positions,indices[t*3+c]).applyMatrix4(mesh.matrixWorld).project(camera);return{x:screen.left+(p.x+1)*screen.width/2,y:screen.top+(1-p.y)*screen.height/2,z:p.z}});if(points.every(p=>p.z<-1)||points.every(p=>p.z>1))continue;if(triangleIntersectsRectangle(points,rect)){if(!selected.has(id))selected.set(id,new Set());selected.get(id).add(faces[t])}}}
    api.select(selected);
  }
  canvas.addEventListener('pointerup',event=>finish(event),true);canvas.addEventListener('pointercancel',event=>finish(event,true),true);canvas.addEventListener('lostpointercapture',event=>{if(gesture)finish(event,true)},true);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture)finish(event,true)},true);
}
