// Screen-sized XYZ handles. Preview touches only disposable display vertices;
// release commits one native B-rep edit, so graph undo records one operation.
export function initCadGizmo(api){
  const {canvas}=api.preview();let group=null,handles=[],target=null,drag=null,busy=false,observedControls=null;
  const axes=[[1,0,0],[0,1,0],[0,0,1]],colors=[0xe26362,0x67ac69,0x588fd3];
  const label=document.createElement('div');label.className='cad-gizmo-distance';label.hidden=true;document.body.append(label);
  const axisLabels=axes.map((_,axis)=>{const node=document.createElement('span');node.className='cad-gizmo-axis';node.dataset.axis='XYZ'[axis];node.textContent='XYZ'[axis];node.style.color='#'+colors[axis].toString(16);node.hidden=true;document.body.append(node);return node});
  function dispose(){axisLabels.forEach(n=>n.hidden=true);if(!group)return;group.parent?.remove(group);group.traverse(n=>{n.geometry?.dispose();n.material?.dispose()});group=null;handles=[]}
  function ray(event){const {THREE,camera}=api.preview(),r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),camera);return ray}
  function refresh(){
    const controls=api.preview().controls;if(controls&&controls!==observedControls){controls.addEventListener('change',refresh);observedControls=controls}
    if(drag||busy)return;dispose();target=api.selection();const {THREE,scene,camera,dirty}=api.preview();if(!target||!scene||!THREE)return;
    const box=new THREE.Box3();for(const mesh of target.objects){mesh.updateWorldMatrix(true,false);const position=mesh.geometry.attributes.position,indices=mesh.geometry.index.array,faces=mesh.userData.triangleFaces,selected=target.faceSets?.get(mesh.userData.inputId)||target.faces;for(let i=0;i<indices.length;i++){if(selected?.size&&!selected.has(faces?.[Math.floor(i/3)]))continue;box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,indices[i]).applyMatrix4(mesh.matrixWorld))}}
    if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),length=(camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:camera.position.distanceTo(center)*2*Math.tan((camera.fov||36)*Math.PI/360))*100/canvas.getBoundingClientRect().height;
    group=new THREE.Group();group.position.copy(center);group.name='CAD pivot';scene.add(group);
    for(let axis=0;axis<3;axis++){
      const direction=new THREE.Vector3(...axes[axis]),part=new THREE.Group();part.userData.axis=axis;
      const material=new THREE.MeshBasicMaterial({color:colors[axis],depthTest:false,depthWrite:false,fog:false});const shaft=new THREE.Mesh(new THREE.CylinderGeometry(length*.018,length*.018,length*.77,10),material);shaft.position.y=length*.43;const head=new THREE.Mesh(new THREE.ConeGeometry(length*.065,length*.22,14),material.clone());head.position.y=length*.9;
      part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);part.add(shaft,head);part.traverse(n=>n.renderOrder=100);group.add(part);handles.push(shaft,head);const rect=canvas.getBoundingClientRect(),screen=center.clone().addScaledVector(direction,length*.9).project(camera),label=axisLabels[axis];label.style.left=rect.left+(screen.x+1)*rect.width/2+'px';label.style.top=rect.top+(1-screen.y)*rect.height/2+'px';label.hidden=false;
    }
    const origin=new THREE.Mesh(new THREE.SphereGeometry(length*.035,12,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,fog:false}));origin.renderOrder=101;group.add(origin);group.updateMatrixWorld(true);dirty();
  }
  function restore(){if(!drag)return;for(const item of drag.buffers){item.attribute.array.set(item.original);item.attribute.needsUpdate=true;item.mesh.geometry.computeVertexNormals();item.mesh.geometry.computeBoundingSphere()}api.preview().dirty()}
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||busy||!group||(event.metaKey&&event.shiftKey))return;const hit=ray(event).intersectObjects(handles,false)[0];if(!hit)return;
    event.preventDefault();event.stopImmediatePropagation();const {THREE,camera,controls}=api.preview(),axis=hit.object.parent.userData.axis,direction=new THREE.Vector3(...axes[axis]),center=group.position.clone();
    const normal=camera.position.clone().sub(center);normal.addScaledVector(direction,-normal.dot(direction));if(normal.lengthSq()<1e-8)return;normal.normalize();const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center),point=ray(event).ray.intersectPlane(plane,new THREE.Vector3());if(!point)return;
    const buffers=target.objects.map(mesh=>{const attribute=mesh.geometry.attributes.position,indices=mesh.geometry.index.array,faces=mesh.userData.triangleFaces,selected=target.faceSets?.get(mesh.userData.inputId)||target.faces,vertices=new Set();for(let i=0;i<indices.length;i++)if(!selected?.size||selected.has(faces?.[Math.floor(i/3)]))vertices.add(indices[i]);return{mesh,attribute,original:attribute.array.slice(),vertices}});
    // The preview mesh duplicates CAD vertices between faces. Move coincident
    // boundary vertices together so neighboring previews do not tear apart.
    const shared=new Map(),key=(a,index)=>`${a[index*3].toFixed(6)},${a[index*3+1].toFixed(6)},${a[index*3+2].toFixed(6)}`;
    for(const item of buffers){const id=item.mesh.userData.inputId||item.mesh.userData.shapeId||'';if(!shared.has(id))shared.set(id,new Set());for(const index of item.vertices)shared.get(id).add(key(item.original,index))}
    for(const item of buffers){const points=shared.get(item.mesh.userData.inputId||item.mesh.userData.shapeId||'');for(let index=0;index<item.attribute.count;index++)if(points.has(key(item.original,index)))item.vertices.add(index)}
    drag={pointer:event.pointerId,start:point.dot(direction),axis,direction,plane,buffers,target,center,offset:[0,0,0],controlsEnabled:controls?.enabled};if(controls)controls.enabled=false;canvas.setPointerCapture(event.pointerId);label.hidden=false;
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(!drag){if(group&&!busy)canvas.style.cursor=ray(event).intersectObjects(handles,false).length?'grab':'';return}
    event.preventDefault();event.stopImmediatePropagation();const {THREE,dirty}=api.preview(),point=ray(event).ray.intersectPlane(drag.plane,new THREE.Vector3());if(!point)return;
    let distance=point.dot(drag.direction)-drag.start;if(event.shiftKey)distance=Math.round(distance*10)/10;distance=Math.max(-1000,Math.min(1000,distance));const world=drag.direction.clone().multiplyScalar(distance);drag.offset=world.toArray();group.position.copy(drag.center).add(world);
    for(const item of drag.buffers){const local=world.clone().transformDirection(item.mesh.matrixWorld.clone().invert()).multiplyScalar(Math.abs(distance));if(distance===0)local.set(0,0,0);item.attribute.array.set(item.original);for(const index of item.vertices)for(let axis=0;axis<3;axis++)item.attribute.array[index*3+axis]+=local.getComponent(axis);item.attribute.needsUpdate=true;item.mesh.geometry.computeVertexNormals();item.mesh.geometry.computeBoundingSphere()}
    axisLabels.forEach(n=>n.hidden=true);label.textContent=`${'XYZ'[drag.axis]} ${distance.toFixed(2)} mm`;label.style.left=event.clientX+14+'px';label.style.top=event.clientY+14+'px';dirty();
  },true);
  async function finish(event,cancel=false){
    if(!drag)return;event.preventDefault();event.stopImmediatePropagation();const ended=drag;restore();drag=null;label.hidden=true;canvas.style.cursor='';if(canvas.hasPointerCapture(ended.pointer))canvas.releasePointerCapture(ended.pointer);const {controls}=api.preview();if(controls)controls.enabled=ended.controlsEnabled;
    if(cancel||Math.hypot(...ended.offset)<.001){refresh();return}busy=true;dispose();try{await api.commit(ended.target,ended.offset)}catch(error){api.error(error.message)}finally{busy=false;refresh()}
  }
  canvas.addEventListener('pointerup',event=>finish(event),true);canvas.addEventListener('pointercancel',event=>finish(event,true),true);canvas.addEventListener('lostpointercapture',event=>{if(drag)finish(event,true)},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();finish(event,true)}},true);
  window.addEventListener('resize',refresh);document.addEventListener('pathloom:camera-changed',refresh);
  return{refresh,isDragging:()=>!!drag,isBusy:()=>busy};
}
