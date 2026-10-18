let cadHiddenGroups=[],cadProposalGroup=null;
import {numberParameters,pipelineLayerHeight,migrateDefinition} from './cad-pipeline.js';
import { initCad } from './cad-ui.js';
import { BASIC_FIELDS, validateProject } from './pathloom-project.js';
import { durationText, thumbnailBlock, encodeQoi, progressCommand, usageComments } from './gcode-metadata.js';
import { estimatePrintTime, estimateFilamentUsage } from './print-time.js';
import { normalizeStepResult } from './step-import.js';

const LIBRARY_KEY = 'pathloom.filamentLibrary.v1';
const sourceState = new Map();
const printLinks={};
const instanceState = new Map();
let sourceCounter = 0;
let selectedInstance = null;
let previewInstance = null;
let activeTool = null;
let filamentLibrary = loadFilamentLibrary();

const $ = sel => document.querySelector(sel);
const canvas = $('#threeCanvas');
const viewport = $('#viewport');
let THREE,renderer,scene,camera,controls,toolpathGroup,importedShapeGroup,buildVolumeGroup,previewPointMarker;
let importedShapes=[];
const selectedBrepFaces=new Map();
const configuredBuildVolume={bedWidth:250,bedDepth:210,maxHeight:220};
const renderedInstances=new Map();
const previewGeometryCache=new Map();
let previewDirty=true;
let inspectingLayerPaths=false;
async function initializePreview(){
  const modules=await Promise.all([
    import('./vendor/three/three.module.js'),
    import('./vendor/three/OrbitControls.js')
  ]);
  THREE=modules[0];
  const {OrbitControls}=modules[1];
renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0x000000,0);
scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe9edf2,600,1000);
camera = new THREE.PerspectiveCamera(36,1,.1,1200); camera.position.set(180,-320,340);
camera.up.set(0,0,1);
controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping=false; controls.mouseButtons.LEFT=null; controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN; controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE; controls.addEventListener('change',()=>{previewDirty=true}); controls.target.set(0,0,16); controls.maxPolarAngle=Math.PI/2.03; controls.minDistance=90; controls.maxDistance=520;
scene.add(new THREE.HemisphereLight(0xffffff,0x9aa5b1,1.65)); const keyLight=new THREE.DirectionalLight(0xffffff,1.35); keyLight.position.set(80,-120,180); scene.add(keyLight);
updateBuildVolumePreview();
toolpathGroup=new THREE.Group(); scene.add(toolpathGroup);
importedShapeGroup=new THREE.Group();scene.add(importedShapeGroup);
previewPointMarker=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3)),new THREE.PointsMaterial({color:0xffffff,size:7,sizeAttenuation:false,depthTest:false}));previewPointMarker.renderOrder=10;previewPointMarker.visible=false;scene.add(previewPointMarker);
  buildInstances();renderImportedShapes();resize();animate();window.PathloomCad?.refreshInputs?.();
}

function renderImportedShapes(){
  const host=$('#importedShapeList');
  if(host){
    host.replaceChildren();
    for(const shape of importedShapes){
      const card=document.createElement('div');card.className='imported-shape-card';
      const row=document.createElement('div');row.className='imported-shape-row';
      const name=document.createElement('span');name.textContent=shape.faces?.length?`${shape.name} · ${shape.faces.length} CAD faces`:shape.name;name.title=shape.faces?.length?`${shape.name} · NVIDIA usd-brep`:`${shape.name} · STEP reference`;
      const visible=document.createElement('input');visible.type='checkbox';visible.checked=shape.visible!==false;visible.setAttribute('aria-label',`Show ${shape.name}`);visible.addEventListener('change',()=>{shape.visible=visible.checked;renderImportedShapes()});
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${shape.name}`);remove.addEventListener('click',()=>{importedShapes=importedShapes.filter(item=>item.id!==shape.id);renderImportedShapes()});
      row.append(name,visible,remove);card.append(row);
      if(shape.faces?.length){const selected=selectedBrepFaces.get(shape.id)?.size||0;const faceHint=document.createElement('div');faceHint.className='step-face-hint';faceHint.textContent=`CAD face selection · ${selected} selected · Shift-click to add/remove`;card.append(faceHint)}
      if(shape.assetId&&shape.faces?.length){const editor=document.createElement('div');editor.className='step-face-editor';const title=document.createElement('strong');title.textContent='Move selected CAD face(s)';const fields=document.createElement('div');fields.className='step-face-move-fields';const makeOffset=axis=>{const label=document.createElement('label');label.textContent=`${axis} · mm`;const input=document.createElement('input');input.type='number';input.step='.1';input.min='-1000';input.max='1000';input.value='0';input.setAttribute('aria-label',`Move selected faces ${axis}`);label.append(input);fields.append(label);return input};const xOffset=makeOffset('X'),yOffset=makeOffset('Y');const move=document.createElement('button');move.type='button';move.textContent='Apply face movement';move.disabled=!selectedBrepFaces.get(shape.id)?.size;move.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('pathloom:move-step-faces',{detail:{shapeId:shape.id,assetId:shape.assetId,brepIndex:shape.brepIndex,faceIndices:[...(selectedBrepFaces.get(shape.id)||[])],dx:Number(xOffset.value),dy:Number(yOffset.value)}})));editor.append(title,fields,move);card.append(editor)}
      const tools=document.createElement('details');tools.className='step-shape-tools';const summary=document.createElement('summary');summary.textContent='STEP Slice · lines';tools.append(summary);
      const heightLabel=document.createElement('label');heightLabel.className='field-row';const heightName=document.createElement('span');heightName.textContent='Layer height';const heightWrap=document.createElement('div');heightWrap.className='number-wrap';const height=document.createElement('input');height.type='number';height.min='.05';height.max='10';height.step='.05';height.value=String(shape.sliceLayerHeight??.2);height.addEventListener('change',()=>{shape.sliceLayerHeight=Number(height.value)});height.setAttribute('aria-label',`${shape.name} layer height`);const unit=document.createElement('span');unit.textContent='mm';heightWrap.append(height,unit);heightLabel.append(heightName,heightWrap);
      const slice=document.createElement('button');slice.type='button';slice.className='step-slice-button';slice.textContent='Generate line toolpaths';slice.addEventListener('click',()=>sliceStepShape(shape,Number(height.value)));
      tools.append(heightLabel,slice);card.append(tools);host.append(card);
    }
  }
  const empty=$('#emptyState');if(empty)empty.hidden=sourceState.size>0||importedShapes.length>0;
  if(!THREE||!importedShapeGroup)return;
  importedShapeGroup.traverse(node=>{node.geometry?.dispose();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material?.dispose()});importedShapeGroup.clear();
  for(const shape of importedShapes){
    const group=new THREE.Group();group.visible=shape.visible!==false;
    shape.meshes.forEach((mesh,meshIndex)=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));if(mesh.normals?.length===mesh.positions.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(mesh.normals,3));else geometry.computeVertexNormals();geometry.setIndex(mesh.indices);
      const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:new THREE.Color(...mesh.color),metalness:.12,roughness:.72,side:THREE.DoubleSide}));object.userData={shapeId:shape.id,meshIndex,triangleFaces:Array.isArray(mesh.triangleFaces)?mesh.triangleFaces:null};group.add(object);
      const chosen=selectedBrepFaces.get(shape.id);if(chosen?.size&&Array.isArray(mesh.triangleFaces)){const positions=[];for(let triangle=0;triangle<mesh.triangleFaces.length;triangle++){if(!chosen.has(mesh.triangleFaces[triangle]))continue;for(let corner=0;corner<3;corner++){const vertex=mesh.indices[triangle*3+corner]*3;positions.push(mesh.positions[vertex],mesh.positions[vertex+1],mesh.positions[vertex+2])}}if(positions.length){const selectedGeometry=new THREE.BufferGeometry();selectedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));selectedGeometry.computeVertexNormals();const highlight=new THREE.Mesh(selectedGeometry,new THREE.MeshStandardMaterial({color:0xff553d,emissive:0x6a1008,metalness:0,roughness:.5,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));highlight.userData.faceSelectionOverlay=true;group.add(highlight)}}
    });
    importedShapeGroup.add(group);
  }
  previewDirty=true;
}

async function sliceStepShape(shape,layerHeight){
  if(!Number.isFinite(layerHeight)||layerHeight<.05||layerHeight>10){showToast('Layer height must be between 0.05 and 10 mm','error');return}shape.sliceLayerHeight=layerHeight;shape.sliceJobRevision=(shape.sliceJobRevision||0)+1;const revision=shape.sliceJobRevision;
  const worker=new Worker('./step-slice-worker.js',{type:'module'});
  try{const result=await new Promise((resolve,reject)=>{worker.onmessage=event=>event.data?.ok?resolve(event.data.paths):reject(new Error(event.data?.error||'STEP slicing failed'));worker.onerror=event=>reject(new Error(event.message||'STEP slicing worker failed'));worker.postMessage({meshes:shape.meshes,layerHeight})});if(shape.sliceJobRevision!==revision)return;const filename=`${shape.name.replace(/\.(step|stp)$/i,'')}-${layerHeight}mm.toolpath`,toolpath=sanitizeToolpath({paths:result},filename),source=[...sourceState.values()].find(item=>item.stepSliceSource===shape.id);if(source){source.filename=toolpath.filename;source.label=filename.replace(/\.toolpath$/i,'');source.paths=toolpath.paths;source.maxLayer=toolpath.maxLayer;source.stepSliceHeight=layerHeight;previewGeometryCache.delete(source.id);renderAllUI();buildInstances();showToast(`${result.length} STEP contours updated`)}else{const sourceId=addSource(toolpath),created=sourceState.get(sourceId);created.stepSliceSource=shape.id;created.stepSliceHeight=layerHeight;showToast(`${result.length} sliced contours added as toolpaths`)}}catch(error){if(shape.sliceJobRevision===revision)showToast(error.message,'error')}finally{worker.terminate()}
}

function addImportedBrepInspection(result){
  if(!result?.success||!Array.isArray(result.breps)||!result.breps.length)throw new Error(result?.error||'Native B-rep import returned no shapes');
  for(const brep of result.breps){
    const mesh=brep.mesh;if(!mesh||!Array.isArray(mesh.positions)||!Array.isArray(mesh.indices)||mesh.positions.length%3||mesh.indices.length%3)throw new Error('Native B-rep import returned an invalid display mesh');
    if(mesh.positions.length/3>500000||mesh.indices.length/3>2000000||mesh.indices.some(index=>!Number.isInteger(index)||index<0||index>=mesh.positions.length/3))throw new Error('Native B-rep mesh exceeds Pathloom limits');
    const shapeName=result.breps.length===1?result.name:`${result.name} · ${brep.name}`;
    if(!Array.isArray(brep.faces)||!Array.isArray(mesh.triangleFaces)||mesh.triangleFaces.length!==mesh.indices.length/3||mesh.triangleFaces.some(index=>!Number.isInteger(index)||index<0||index>=brep.faces.length))throw new Error('Native B-rep import returned an invalid triangle-to-face map');
    importedShapes.push({id:`brep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name:shapeName,visible:true,assetId:result.assetId,brepIndex:result.assetId?result.breps.indexOf(brep):undefined,faces:brep.faces,meshes:[{name:brep.name,positions:mesh.positions,normals:mesh.normals,indices:mesh.indices,color:[.72,.76,.81],triangleFaces:mesh.triangleFaces}]});
  }
  renderImportedShapes();
}

function applyImportedBrepEdit(shapeId,result){
  const shape=importedShapes.find(item=>item.id===shapeId),brep=shape&&result?.breps?.[shape.brepIndex];if(!shape||!brep?.mesh)throw new Error('Edited CAD shape was not returned');
  if(!Array.isArray(brep.mesh.triangleFaces)||brep.mesh.triangleFaces.length!==brep.mesh.indices.length/3||brep.mesh.triangleFaces.some(index=>!Number.isInteger(index)||index<0||index>=brep.faces.length))throw new Error('Edited CAD face mapping is invalid');
  shape.faces=brep.faces;shape.meshes=[{name:brep.name,positions:brep.mesh.positions,normals:brep.mesh.normals,indices:brep.mesh.indices,color:[.72,.76,.81],triangleFaces:brep.mesh.triangleFaces}];selectedBrepFaces.delete(shapeId);renderImportedShapes();
}

function selectImportedFace(event){
  if(event.button!==0||!THREE||!camera||!importedShapeGroup)return;
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObject(importedShapeGroup,true).find(item=>item.object.visible&&!item.object.userData.faceSelectionOverlay&&item.object.userData.triangleFaces);
  if(!hit)return;
  const shapeId=hit.object.userData.shapeId,faceIndex=hit.object.userData.triangleFaces[hit.faceIndex];if(!Number.isInteger(faceIndex))return;
  if(!event.shiftKey)selectedBrepFaces.clear();
  let selected=selectedBrepFaces.get(shapeId);if(!selected){selected=new Set();selectedBrepFaces.set(shapeId,selected)}
  if(event.shiftKey&&selected.has(faceIndex))selected.delete(faceIndex);else selected.add(faceIndex);
  if(!selected.size)selectedBrepFaces.delete(shapeId);
  renderImportedShapes();
}
let facePickStart=null;
canvas.addEventListener('pointerdown',event=>{facePickStart=event.button===0?[event.clientX,event.clientY]:null});
canvas.addEventListener('pointerup',event=>{if(!facePickStart)return;const distance=Math.hypot(event.clientX-facePickStart[0],event.clientY-facePickStart[1]);facePickStart=null;if(distance<4)selectImportedFace(event)});

function updateBuildVolumePreview(){
  const {bedWidth:width,bedDepth:depth,maxHeight:height}=configuredBuildVolume;
  $('#buildVolumeLabel').textContent=`BUILD PLATE · ${width} × ${depth} mm · MAX HEIGHT ${height} mm`;
  if(!scene)return;
  if(buildVolumeGroup){scene.remove(buildVolumeGroup);buildVolumeGroup.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());else child.material?.dispose()})}
  buildVolumeGroup=new THREE.Group();
  const plate=new THREE.Mesh(new THREE.BoxGeometry(width,depth,3),new THREE.MeshStandardMaterial({color:0xc9d0d8,metalness:.08,roughness:.88}));plate.position.z=-1.8;buildVolumeGroup.add(plate);
  const gridLines={minor:[],major:[]},addGridLine=(group,x1,y1,x2,y2)=>gridLines[group].push(x1,y1,.1,x2,y2,.1),gridStep=10;
  for(let index=Math.ceil(-width/2/gridStep);index<=Math.floor(width/2/gridStep);index++){const x=index*gridStep;addGridLine(index%5===0?'major':'minor',x,-depth/2,x,depth/2)}
  for(let index=Math.ceil(-depth/2/gridStep);index<=Math.floor(depth/2/gridStep);index++){const y=index*gridStep;addGridLine(index%5===0?'major':'minor',-width/2,y,width/2,y)}
  addGridLine('major',-width/2,-depth/2,width/2,-depth/2);addGridLine('major',width/2,-depth/2,width/2,depth/2);addGridLine('major',width/2,depth/2,-width/2,depth/2);addGridLine('major',-width/2,depth/2,-width/2,-depth/2);
  for(const[group,color,opacity]of [['minor',0x8995a2,.42],['major',0x4f5d6c,.68]]){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(gridLines[group],3));buildVolumeGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity})))}
  const box=new THREE.BoxGeometry(width,depth,height),edges=new THREE.EdgesGeometry(box);box.dispose();
  const outline=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x596574,transparent:true,opacity:.35}));outline.position.z=height/2;buildVolumeGroup.add(outline);
  const origin=new THREE.Vector3(-width/2,-depth/2,.5);
  for(const[direction,color]of [[new THREE.Vector3(1,0,0),0xff4545],[new THREE.Vector3(0,1,0),0x4bd665],[new THREE.Vector3(0,0,1),0x5588ff]])buildVolumeGroup.add(new THREE.ArrowHelper(direction,origin,28,color,5,2));
  scene.add(buildVolumeGroup);
  const size=Math.max(width,depth,height),aspect=camera.aspect||1,distance=size/Math.sin(camera.fov*Math.PI/360)/Math.min(1,aspect);
  controls.target.set(0,0,height/2);camera.position.set(0,-distance*.8,height/2+distance*.6);controls.maxDistance=Math.max(520,distance*2);camera.far=Math.max(1200,distance*4);camera.updateProjectionMatrix();controls.update();previewDirty=true;
}
function showToast(message,kind=''){const t=$('#toast');t.textContent=message;t.className=`toast ${kind}`;t.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.hidden=true,2600)}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function round1(n){return Math.round(n*10)/10}
function normalizeHex(value){const v=String(value||'').trim().toUpperCase();return /^#[0-9A-F]{6}$/.test(v)?v:null}
function uid(){return `fil-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
function loadFilamentLibrary(){try{const raw=JSON.parse(localStorage.getItem(LIBRARY_KEY)||'[]');return Array.isArray(raw)?raw.filter(x=>x&&x.id&&normalizeHex(x.color)).map(x=>({...x,color:normalizeHex(x.color),diameter:Number(x.diameter)||1.75})):[]}catch{return[]}}
function saveFilamentLibrary(){localStorage.setItem(LIBRARY_KEY,JSON.stringify(filamentLibrary))}
function paletteEntries(){return filamentLibrary.map(f=>({name:f.name,hex:f.color,filamentId:f.id,brand:f.brand||'',material:f.material||''}))}
function defaultToolColor(index){const entries=paletteEntries();return entries.length?entries[index%entries.length]:{name:'Unassigned',hex:'#7F8790',filamentId:null}}
function sharedToolAppearance(toolId,index){for(const source of sourceState.values()){const tool=source.tools.get(String(toolId));if(tool)return{color:tool.color,name:tool.name,filamentId:tool.filamentId||null,outputTool:toolOutputId(toolId,tool)}}const fallback=defaultToolColor(index);return{color:fallback.hex,name:fallback.name,filamentId:fallback.filamentId||null,outputTool:String(toolId)}}
function toolOutputId(toolId,tool){return String(tool?.outputTool??toolId)}
function physicalToolAppearance(outputId){for(const source of sourceState.values()){const exact=source.tools.get(String(outputId));if(exact)return exact}for(const source of sourceState.values())for(const[id,tool]of source.tools)if(toolOutputId(id,tool)===String(outputId))return tool;return null}
function toolOutputAppearance(source,toolId){const tool=source?.tools.get(String(toolId)),outputId=toolOutputId(toolId,tool);return physicalToolAppearance(outputId)||tool}
function toolPreviewColor(source,toolId){return toolOutputAppearance(source,toolId)?.color||'#fff'}
function sanitizeToolpath(raw,filename='Untitled.toolpath'){if(!raw||!Array.isArray(raw.paths))throw new Error('Missing paths[]');const paths=raw.paths.map((path,index)=>{if(!Array.isArray(path.points)||path.points.length<2)throw new Error(`Path ${index} needs at least 2 points`);const points=path.points.map(p=>{if(!Array.isArray(p)||p.length<3||p.slice(0,3).some(v=>!Number.isFinite(Number(v))))throw new Error(`Invalid XYZ point in path ${index}`);return p.slice(0,3).map(Number)});return{order:Number.isFinite(Number(path.order))?Number(path.order):index,tool:String(path.tool??0),points}}).sort((a,b)=>a.order-b.order);const zValues=[...new Set(paths.map(p=>Number(p.points[0][2].toFixed(4))))].sort((a,b)=>a-b);paths.forEach(p=>{const z=Number(p.points[0][2].toFixed(4));p.layer=zValues.indexOf(z)+1});return{filename,paths,maxLayer:Math.max(1,zValues.length)}}
function sourceXYCenter(source){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const path of source?.paths||[])for(const[x,y]of path.points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}return Number.isFinite(minX)?[(minX+maxX)/2,(minY+maxY)/2]:[0,0]}
function addSource(toolpath,options={}){sourceCounter++;const id=options.id||`S${sourceCounter}`;const label=options.label||toolpath.filename.replace(/\.toolpath$|\.json$/i,'')||id;const tools=new Map();[...new Set(toolpath.paths.map(p=>p.tool))].forEach((toolId,index)=>{const appearance=sharedToolAppearance(toolId,index);tools.set(String(toolId),{...appearance,speedOverride:null,erate:1})});const source={id,label,filename:toolpath.filename,paths:toolpath.paths,maxLayer:toolpath.maxLayer,tools};sourceState.set(id,source);const[centerX,centerY]=sourceXYCenter(source);addInstance(id,`${id}-${nextInstanceNumber(id)}`,{x:-centerX,y:-centerY,rotation:0});autoArrange(false);renderAllUI();buildInstances();return id}
function upsertLiveToolpath(payload){if(!payload||!Array.isArray(payload.paths))throw new Error('Grasshopper payload needs paths[]');const liveSource=String(payload.source||'').trim();if(!liveSource)throw new Error('Grasshopper source is required');const label=String(payload.label||liveSource||'Grasshopper Live').trim()||'Grasshopper Live';const toolpath=sanitizeToolpath({paths:payload.paths},`${label}.toolpath`);let source=[...sourceState.values()].find(item=>item.liveSource===liveSource);if(!source){const sourceId=addSource(toolpath,{label});source=sourceState.get(sourceId);source.liveSource=liveSource;showToast(`${label} connected from ${payload.origin||'Grasshopper'}`);return{sourceId,created:true}}const previousTools=source.tools;const nextTools=new Map();[...new Set(toolpath.paths.map(path=>String(path.tool)))].forEach((toolId,index)=>{const existing=previousTools.get(toolId);if(existing){nextTools.set(toolId,existing)}else{const appearance=sharedToolAppearance(toolId,index);nextTools.set(toolId,{...appearance,speedOverride:null,erate:1})}});source.label=label;source.filename=toolpath.filename;source.paths=toolpath.paths;source.maxLayer=toolpath.maxLayer;source.tools=nextTools;previewGeometryCache.delete(source.id);renderAllUI();buildInstances();return{sourceId:source.id,created:false}}
function nextInstanceNumber(sourceId){let max=0;for(const[id,inst]of instanceState)if(inst.source===sourceId){const n=Number(id.split('-').pop());if(Number.isFinite(n))max=Math.max(max,n)}return max+1}
function addInstance(sourceId,id=`${sourceId}-${nextInstanceNumber(sourceId)}`,transform={}){const maxOrder=Math.max(0,...[...instanceState.values()].map(v=>v.order||0));instanceState.set(id,{source:sourceId,x:transform.x??0,y:transform.y??0,rotation:transform.rotation??0,order:maxOrder+1});selectedInstance=id;return id}
function removeSource(sourceId){document.dispatchEvent(new CustomEvent('pathloom:source-removed',{detail:{liveSource:sourceState.get(sourceId)?.liveSource}}));sourceState.delete(sourceId);syncPrintLinks();for(const[id,inst]of[...instanceState])if(inst.source===sourceId)instanceState.delete(id);selectedInstance=[...instanceState.keys()][0]||null;normalizeOrder();renderAllUI();buildInstances()}
function normalizeOrder(){[...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order).forEach(([,data],i)=>data.order=i+1)}
function toolEffectiveSpeed(tool){return tool?.speedOverride??(Number($('#printSpeed').value)||35)}
function createPathLineMaterial(color){
  const material=new THREE.ShaderMaterial({
    uniforms:{lineColor:{value:new THREE.Color(color)},lineOpacity:{value:1},resolution:{value:new THREE.Vector2(viewport.clientWidth||1,viewport.clientHeight||1)},lineWidth:{value:2.5}},
    vertexShader:`attribute vec3 segmentStart;attribute vec3 segmentEnd;attribute float endpoint;attribute float side;uniform vec2 resolution;uniform float lineWidth;
      void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(segmentStart,1.0);vec4 b=projectionMatrix*modelViewMatrix*vec4(segmentEnd,1.0);
        vec2 delta=(b.xy/b.w-a.xy/a.w)*resolution;vec2 direction=delta/max(length(delta),0.0001);vec2 normal=vec2(-direction.y,direction.x);
        vec4 clip=mix(a,b,endpoint);clip.xy+=normal*side*lineWidth/resolution*clip.w;gl_Position=clip;}`,
    fragmentShader:`uniform vec3 lineColor;uniform float lineOpacity;void main(){gl_FragColor=vec4(lineColor,lineOpacity);}`,
    transparent:true,
    depthTest:true,
    depthWrite:true,
    polygonOffset:true,
    polygonOffsetFactor:-1,
    polygonOffsetUnits:-1,
    side:THREE.DoubleSide
  });material.color=material.uniforms.lineColor.value;return material;
}
function createInstanceGroup(instanceId,data){
  const source=sourceState.get(data.source),group=new THREE.Group();group.userData.instanceId=instanceId;
  let cached=previewGeometryCache.get(data.source);
  if(!cached){
    const batches=new Map();
    source.paths.forEach((path,pathIndex)=>{
      const key=JSON.stringify([path.tool,path.layer]);if(!batches.has(key))batches.set(key,{toolId:path.tool,layer:path.layer,positions:[],starts:[],ends:[],endpoints:[],sides:[],ranges:[]});
      const batch=batches.get(key);
      for(let i=1;i<path.points.length;i++)for(const[endpoint,side]of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]){
        batch.positions.push(...path.points[i-1+endpoint]);batch.starts.push(...path.points[i-1]);batch.ends.push(...path.points[i]);batch.endpoints.push(endpoint);batch.sides.push(side);
      }
      batch.ranges.push({pathIndex,end:batch.positions.length/3});
    });
    for(const batch of batches.values()){
      const geometry=new THREE.BufferGeometry();
      for(const[name,values,size]of [['position',batch.positions,3],['segmentStart',batch.starts,3],['segmentEnd',batch.ends,3],['endpoint',batch.endpoints,1],['side',batch.sides,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
      batch.geometry=geometry;for(const key of ['positions','starts','ends','endpoints','sides'])delete batch[key];
    }
    cached={batches};previewGeometryCache.set(data.source,cached);
  }
  for(const batch of cached.batches.values()){
    const geometry=new THREE.BufferGeometry();for(const[name,attribute]of Object.entries(batch.geometry.attributes))geometry.setAttribute(name,attribute);
    const line=new THREE.Mesh(geometry,createPathLineMaterial(toolPreviewColor(source,batch.toolId)));
    line.userData={sourceId:source.id,toolId:batch.toolId,layer:batch.layer,ranges:batch.ranges};group.add(line);
  }
  group.position.set(data.x,data.y,0);group.rotation.z=THREE.MathUtils.degToRad(data.rotation);return group;
}
function buildInstances(){schedulePrintEstimate();requestAnimationFrame(()=>window.PathloomCad?.refreshInputs?.());updateLayerRange();$('#emptyState').hidden=sourceState.size>0||importedShapes.length>0;if(!toolpathGroup)return;toolpathGroup.traverse(child=>{if(child.isMesh||child.isLine){child.geometry.dispose();child.material.dispose()}});toolpathGroup.clear();renderedInstances.clear();for(const id of previewGeometryCache.keys())if(!sourceState.has(id))previewGeometryCache.delete(id);for(const[id,data]of instanceState){if(!sourceState.has(data.source))continue;const group=createInstanceGroup(id,data);toolpathGroup.add(group);renderedInstances.set(id,group)}refreshVisibility()}
function previewInstances(){return [...instanceState.entries()].filter(([,data])=>sourceState.has(data.source)).sort((a,b)=>a[1].order-b[1].order)}
function updatePrintOrderMarkers(){
  const layoutIsland=$('#layoutIsland'),active=layoutIsland&&!layoutIsland.classList.contains('collapsed')&&!layoutIsland.classList.contains('disabled')&&$('#showPrintOrder').checked;const host=$('#printOrderMarkers');host.innerHTML='';if(!active||!THREE||!camera)return;
  for(const[id,data]of previewInstances()){
    const source=sourceState.get(data.source);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const path of source.paths)for(const[x,y,z]of path.points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z)}if(!Number.isFinite(maxZ))continue;
    const center=transformedPoints({points:[[(minX+maxX)/2,(minY+maxY)/2,maxZ+4]]},data)[0],screen=new THREE.Vector3(...center).project(camera);if(screen.z<-1||screen.z>1)continue;
    const marker=document.createElement('span');marker.className='print-order-marker';marker.textContent=data.order;marker.style.left=`${(screen.x+1)*viewport.clientWidth/2}px`;marker.style.top=`${(1-screen.y)*viewport.clientHeight/2}px`;host.appendChild(marker);
  }
}
function showAllObjects(){previewInstance='ALL';inspectingLayerPaths=false;updateLayerRange();refreshVisibility()}
function switchPreviewObject(direction){const entries=previewInstances();if(!entries.length)return;const ids=['ALL',...entries.map(([id])=>id)],index=ids.indexOf(previewInstance);previewInstance=ids[(Math.max(0,index)+direction+ids.length)%ids.length];$('#pathSlider').value=$('#pathSlider').max;inspectingLayerPaths=false;updateLayerRange(true);refreshVisibility();const instance=instanceState.get(previewInstance);if(instance)document.dispatchEvent(new CustomEvent('pathloom:select-source',{detail:{sourceId:instance.source}}))}
function updateLayerRange(reset=false){
  const entries=previewInstances();if(previewInstance!=='ALL'&&!entries.some(([id])=>id===previewInstance)){previewInstance=entries[0]?.[0]||null;reset=true}
  document.querySelector('.preview-object-control').hidden=entries.length<2;
  const data=instanceState.get(previewInstance),source=sourceState.get(data?.source),max=source?.maxLayer||1,slider=$('#layerSlider');
  if(reset)inspectingLayerPaths=false;
  slider.max=max;slider.value=reset?max:Math.max(1,Math.min(max,Number(slider.value)));slider.disabled=!source||max===1;
  $('#layerValue').textContent=`${slider.value} / ${max}`;$('#pathSlider').disabled=!source;$('#previousPath').disabled=!source;$('#nextPath').disabled=!source;
  $('#previewObjectName').textContent=previewInstance==='ALL'?'ALL':data?instanceDisplayName(previewInstance,data):'No objects';
  $('#previousObject').disabled=!entries.length;$('#nextObject').disabled=!entries.length;
}
function stepPreviewLayer(direction){const slider=$('#layerSlider');if(slider.disabled)return;const next=Math.max(Number(slider.min),Math.min(Number(slider.max),Number(slider.value)+direction));if(next===Number(slider.value))return;slider.value=next;$('#layerValue').textContent=`${next} / ${slider.max}`;$('#pathSlider').value=$('#pathSlider').max;inspectingLayerPaths=false;refreshVisibility()}
function stepLayerPoint(direction){const slider=$('#pathSlider');if(slider.disabled)return;slider.value=Math.max(0,Math.min(Number(slider.max),Number(slider.value)+direction));inspectingLayerPaths=true;refreshVisibility()}
function applyCadPreviewVisibility(){
  for(const group of cadHiddenGroups)group.visible=false;
  const cad=window.PathloomCad?.snapshot?.();
  if(cadProposalGroup&&cad?.sourceId)for(const[id,group]of renderedInstances)if(instanceState.get(id)?.source===cad.sourceId){group.visible=false;if(!cadHiddenGroups.includes(group))cadHiddenGroups.push(group)}
}
function refreshVisibility(){
  const processing=window.PathloomCad?.isProcessing?.();if(processing){$('#layerSlider').value=$('#layerSlider').max;$('#pathSlider').value=$('#pathSlider').max;inspectingLayerPaths=false;$('#layerValue').textContent=`${$('#layerSlider').max} / ${$('#layerSlider').max}`}
  previewDirty=true;
  if(previewInstance==='ALL'){if(previewPointMarker)previewPointMarker.visible=false;$('#pathValue').textContent='ALL';for(const[id,group]of renderedInstances){group.visible=true;const source=sourceState.get(instanceState.get(id)?.source);for(const line of group.children){line.visible=true;line.geometry.setDrawRange(0,Infinity);line.material.color.set(toolPreviewColor(source,line.userData.toolId));line.material.uniforms.lineOpacity.value=1}}applyCadPreviewVisibility();updatePrintOrderMarkers();return}
  const layer=Number($('#layerSlider').value);
  const data=instanceState.get(previewInstance),source=sourceState.get(data?.source);
  const eligible=source?source.paths.map((path,index)=>({path,index})).filter(item=>item.path.layer===layer):[];
  const totalPoints=eligible.reduce((total,item)=>total+item.path.points.length,0),slider=$('#pathSlider');
  if(processing||Number(slider.max)!==totalPoints){slider.max=totalPoints;slider.value=totalPoints}
  const complete=Math.min(totalPoints,Math.floor(Number(slider.value))),visiblePoints=new Map();let remaining=complete,currentPoint=null;
  for(const item of eligible){const count=Math.min(remaining,item.path.points.length);visiblePoints.set(item.index,count);remaining-=count;if(count)currentPoint=item.path.points[count-1]}
  $('#pathValue').textContent=`${complete} / ${totalPoints}`;$('#previousPath').disabled=!source||complete===0;$('#nextPath').disabled=!source||complete===totalPoints;
  if(previewPointMarker){previewPointMarker.visible=inspectingLayerPaths&&!!currentPoint;if(previewPointMarker.visible){const point=transformedPoints({points:[currentPoint]},data)[0],attribute=previewPointMarker.geometry.getAttribute('position');attribute.setXYZ(0,...point);attribute.needsUpdate=true;previewPointMarker.geometry.computeBoundingSphere()}}
  for(const[id,group]of renderedInstances){
    group.visible=true;const selected=id===previewInstance,groupSource=sourceState.get(instanceState.get(id)?.source);
    if(!selected){for(const line of group.children){line.visible=true;line.geometry.setDrawRange(0,Infinity);line.material.color.set(toolPreviewColor(groupSource,line.userData.toolId));line.material.uniforms.lineOpacity.value=.06}continue}
    for(const line of group.children){
      let end=0;
      if(line.userData.layer<layer)end=line.userData.ranges.at(-1)?.end||0;
      if(line.userData.layer===layer)for(const range of line.userData.ranges){
        const count=visiblePoints.get(range.pathIndex)||0,previousEnd=end;
        if(!count)break;
        const vertices=Math.max(0,count-1)*6;end=previousEnd+vertices;
        if(end<range.end)break;
      }
      line.visible=end>0;line.geometry.setDrawRange(0,end);
      line.material.color.set(toolPreviewColor(source,line.userData.toolId));
      line.material.uniforms.lineOpacity.value=1;
      if(inspectingLayerPaths&&line.userData.layer<layer)line.material.color.set('#7F8790');
    }
  }
  updatePrintOrderMarkers();
applyCadPreviewVisibility();
}
function objectToolSlots(tools){const numeric=[...tools.keys()].filter(id=>/^\d+$/.test(id)).map(Number),max=Math.max(-1,...numeric);const slots=[];for(let id=0;id<=max;id++)slots.push([String(id),tools.get(String(id))]);for(const[id,tool]of tools)if(!/^\d+$/.test(id))slots.push([id,tool]);return slots}
let pendingSourceRemoval=null;
function requestSourceRemoval(source){pendingSourceRemoval=source.id;$('#removeObjectMessage').textContent=`Delete “${source.label}” and all its instances?`;$('#removeObjectDialog').showModal()}
function renderObjectUI(){
  const host=$('#objectList'),collapsedSources=new Set([...host.querySelectorAll('.object-card.collapsed')].map(card=>card.dataset.source)),expandedTools=new Set([...host.querySelectorAll('.tool-row.expanded')].map(row=>`${row.dataset.source}:${row.dataset.tool}`));host.innerHTML='';
  for(const source of sourceState.values()){
    const count=[...instanceState.values()].filter(instance=>instance.source===source.id).length,card=document.createElement('div'),collapsed=collapsedSources.has(source.id);card.className=`object-card${collapsed?' collapsed':''}`;card.dataset.source=source.id;
    const swatches=objectToolSlots(source.tools).map(([id,tool])=>{const appearance=tool&&toolOutputAppearance(source,id),outputId=tool&&toolOutputId(id,tool);return tool?`<i style="--c:${appearance?.color||tool.color}" title="T${escapeHtml(id)} → T${escapeHtml(outputId)} · ${escapeHtml(appearance?.name||tool.name)}" aria-label="T${escapeHtml(id)} → T${escapeHtml(outputId)} · ${escapeHtml(appearance?.name||tool.name)}"></i>`:`<i class="missing-tool" title="T${escapeHtml(id)} · unused" aria-label="T${escapeHtml(id)} · unused"></i>`}).join('');
    card.innerHTML=`<button class="object-header" aria-expanded="${!collapsed}"><span class="chevron">⌄</span><span class="object-heading"><span class="object-name"><strong>${escapeHtml(source.label)}</strong></span><span class="mini-swatches">${swatches}</span></span></button><div class="instance-stepper" aria-label="Instances of ${escapeHtml(source.label)}"><button class="remove-source-instance" aria-label="Remove one instance" ${count<=1?'disabled':''}>−</button><span>${count}</span><button class="add-source-instance" aria-label="Add one instance">＋</button></div><button class="remove-source" title="Delete object" aria-label="Delete ${escapeHtml(source.label)}">×</button><div class="object-body"><div class="tools-host"></div></div>`;
    host.appendChild(card);const toolsHost=card.querySelector('.tools-host');
    for(const[toolId,tool]of source.tools){
      const appearance=toolOutputAppearance(source,toolId),outputId=toolOutputId(toolId,tool),expanded=expandedTools.has(`${source.id}:${toolId}`),row=document.createElement('div');row.className=`tool-row${expanded?' expanded':''}`;row.dataset.source=source.id;row.dataset.tool=toolId;
      const highestOutput=Math.max(4,Number.isInteger(Number(outputId))?Number(outputId):0),outputOptions=Array.from({length:highestOutput+1},(_,id)=>`<option value="${id}"${String(id)===outputId?' selected':''}>T${id}</option>`).join('');
      const toolAssignment=outputId===String(toolId)?`T${escapeHtml(toolId)}`:`<s>T${escapeHtml(toolId)}</s><span class="tool-arrow">→</span>T${escapeHtml(outputId)}`;
      row.innerHTML=`<button class="tool-toggle" aria-label="Toggle T${escapeHtml(toolId)} settings" aria-expanded="${expanded}"><span class="chevron">⌄</span></button><button class="color-chip" style="--tool-color:${appearance?.color||tool.color}" aria-label="Change assigned filament color"></button><button class="tool-label"><span class="tool-assignment">${toolAssignment}</span><span class="tool-name">${escapeHtml(appearance?.name||tool.name)}</span></button><div class="tool-detail"><label><span>Output tool</span><select class="tool-output">${outputOptions}</select><em></em></label><label><span>Print speed</span><input class="tool-speed" type="number" min="1" value="${tool.speedOverride??''}" placeholder="${Number($('#printSpeed').value)||35}"><em>mm/s</em></label><label><span>E-rate</span><input class="tool-erate" type="number" step="1" min="0" value="${Math.round(tool.erate*100)}"><em>%</em></label></div>`;
      toolsHost.appendChild(row);
    }
  }
  bindObjectUI();
}
function syncToolSpeedPlaceholders(){document.querySelectorAll('.tool-speed').forEach(input=>input.placeholder=Number($('#printSpeed').value)||35)}
function bindObjectUI(){document.querySelectorAll('.object-header').forEach(btn=>btn.addEventListener('click',()=>{const collapsed=btn.closest('.object-card').classList.toggle('collapsed');btn.setAttribute('aria-expanded',String(!collapsed))}));document.querySelectorAll('.tool-row').forEach(row=>{const toggle=()=>{const expanded=row.classList.toggle('expanded');row.querySelector('.tool-toggle').setAttribute('aria-expanded',String(expanded))};row.querySelector('.tool-toggle').addEventListener('click',toggle);row.querySelector('.tool-label').addEventListener('click',toggle)});document.querySelectorAll('.object-card').forEach(card=>{const source=sourceState.get(card.dataset.source);card.querySelector('.remove-source').addEventListener('click',e=>{e.stopPropagation();requestSourceRemoval(source)});card.querySelector('.add-source-instance').addEventListener('click',()=>{const n=nextInstanceNumber(source.id),[centerX,centerY]=sourceXYCenter(source);addInstance(source.id,`${source.id}-${n}`,{x:-centerX,y:-centerY,rotation:0});autoArrange(false);renderAllUI();buildInstances()});card.querySelector('.remove-source-instance').addEventListener('click',()=>{const instances=[...instanceState.entries()].filter(([,data])=>data.source===source.id).sort((a,b)=>b[1].order-a[1].order);if(instances.length<=1)return;instanceState.delete(instances[0][0]);if(selectedInstance===instances[0][0])selectedInstance=[...instanceState.keys()][0]||null;normalizeOrder();autoArrange(false);renderAllUI();buildInstances()})});document.querySelectorAll('.tool-row').forEach(row=>{const source=sourceState.get(row.dataset.source),tool=source.tools.get(row.dataset.tool);row.querySelector('.tool-output').addEventListener('change',e=>{for(const candidate of sourceState.values()){const matching=candidate.tools.get(row.dataset.tool);if(matching)matching.outputTool=e.target.value}renderObjectUI();refreshVisibility();schedulePrintEstimate()});row.querySelector('.tool-speed').addEventListener('input',e=>{tool.speedOverride=e.target.value===''?null:Number(e.target.value);refreshVisibility()});row.querySelector('.tool-erate').addEventListener('input',e=>tool.erate=(Number(e.target.value)||0)/100);row.querySelectorAll('.tool-detail input[type="number"]').forEach(input=>input.addEventListener('wheel',event=>{if(!event.deltaY)return;event.preventDefault();if(event.deltaY<0)input.stepUp();else input.stepDown();input.dispatchEvent(new Event('input',{bubbles:true}))},{passive:false}));row.querySelector('.color-chip').addEventListener('click',e=>{e.stopPropagation();activeTool={sourceId:source.id,toolId:toolOutputId(row.dataset.tool,tool)};openPalette(e.currentTarget)})})}
function renderOrderUI(){schedulePrintEstimate();const host=$('#orderList');host.innerHTML='';[...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order).forEach(([id,data],i)=>{const item=document.createElement('div');item.className='order-item';item.draggable=true;item.dataset.id=id;item.innerHTML=`<span class="handle">⠿</span><strong>${escapeHtml(instanceDisplayName(id,data))}</strong><span>${String(i+1).padStart(2,'0')}</span>`;host.appendChild(item)});bindOrderDrag()}
function bindOrderDrag(){const host=$('#orderList');let dragged=null;host.querySelectorAll('.order-item').forEach(item=>{item.addEventListener('dragstart',()=>{dragged=item;item.classList.add('dragging')});item.addEventListener('dragend',()=>{item.classList.remove('dragging');[...host.children].forEach((el,i)=>instanceState.get(el.dataset.id).order=i+1);renderOrderUI();updateLayerRange();refreshVisibility()});item.addEventListener('dragover',e=>{e.preventDefault();if(!dragged||dragged===item)return;const r=item.getBoundingClientRect();host.insertBefore(dragged,e.clientY<r.top+r.height/2?item:item.nextSibling)})})}
function instanceDisplayName(id,data){const source=sourceState.get(data.source),n=id.split('-').pop();return`${source?.label||data.source}-${n}`}
function updateObjectTabs(){const disabled=instanceState.size<2,island=$('#layoutIsland'),header=island.querySelector('.island-header');island.classList.toggle('disabled',disabled);header.disabled=disabled;header.setAttribute('aria-disabled',String(disabled));if(disabled){island.classList.add('collapsed');header.setAttribute('aria-expanded','false')}updatePrintOrderMarkers()}
function renderAllUI(){renderObjectUI();renderOrderUI();updateObjectTabs()}
function autoArrange(render=true){
  if(!$('#autoArrangeEnabled').checked)return;
  const entries=[...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order);if(!entries.length)return;
  const columns=Math.max(1,Math.floor(Number($('#gridColumns').value)||1)),configuredRows=Math.max(1,Math.floor(Number($('#gridRows').value)||1));
  const spacingX=Math.max(0,Number($('#gridSpacingX').value)||0),spacingY=Math.max(0,Number($('#gridSpacingY').value)||0),pattern=$('#gridPattern').value;
  const offset=Math.max(-1,Math.min(1,(Number($('#gridRowOffset').value)||0)/100)),rotation=(Number($('#gridRotation').value)||0)*Math.PI/180;
  const rows=Math.max(configuredRows,Math.ceil(entries.length/columns)),cos=Math.cos(rotation),sin=Math.sin(rotation);
  const targets=entries.map(([,data],index)=>{
    const column=index%columns,row=Math.floor(index/columns);let x=(column-(columns-1)/2)*spacingX,y=(row-(rows-1)/2)*spacingY;
    if(pattern==='staggered')x+=(row%2?offset:0)*spacingX;
    if(pattern==='diamond'){const rectangularX=x,rectangularY=y;x=(rectangularX-rectangularY)/Math.SQRT2;y=(rectangularX+rectangularY)/Math.SQRT2}
    return{x:x*cos-y*sin,y:x*sin+y*cos};
  });
  const layoutCenterX=(Math.min(...targets.map(target=>target.x))+Math.max(...targets.map(target=>target.x)))/2,layoutCenterY=(Math.min(...targets.map(target=>target.y))+Math.max(...targets.map(target=>target.y)))/2;
  entries.forEach(([,data],index)=>{const[sourceCenterX,sourceCenterY]=sourceXYCenter(sourceState.get(data.source));data.x=targets[index].x-layoutCenterX-sourceCenterX;data.y=targets[index].y-layoutCenterY-sourceCenterY;data.rotation=0});
  $('#rowOffsetField').hidden=pattern!=='staggered';
  if(render)buildInstances();
}
function renderPalette(){const grid=$('#paletteGrid');grid.innerHTML='';const entries=paletteEntries();if(!entries.length){grid.innerHTML='<div class="palette-empty">No saved filaments. Add a filament in Settings.</div>';return}entries.forEach(entry=>{const b=document.createElement('button');b.className='palette-swatch';b.style.setProperty('--swatch',entry.hex);b.title=[entry.name,entry.brand,entry.material].filter(Boolean).join(' · ');b.dataset.hex=entry.hex;b.addEventListener('click',()=>applyPaletteEntry(entry));grid.appendChild(b)});markPaletteSelection()}
function markPaletteSelection(){if(!activeTool)return;const tool=physicalToolAppearance(activeTool.toolId);if(!tool)return;$('#paletteGrid').querySelectorAll('.palette-swatch').forEach(b=>b.classList.toggle('active',b.dataset.hex.toUpperCase()===tool.color.toUpperCase()))}
function applyPaletteEntry(entry){if(!activeTool)return;let updated=false;for(const source of sourceState.values())for(const[id,tool]of source.tools){if(id!==activeTool.toolId&&toolOutputId(id,tool)!==activeTool.toolId)continue;tool.color=entry.hex;tool.name=entry.name;tool.filamentId=entry.filamentId||null;updated=true}if(!updated)return;renderObjectUI();refreshVisibility();markPaletteSelection()}
function openPalette(chip){const popover=$('#colorPopover'),chipRect=chip.getBoundingClientRect(),viewRect=viewport.getBoundingClientRect();popover.hidden=false;popover.style.left='18px';popover.style.top=`${Math.max(14,Math.min(viewRect.height-300,chipRect.top-viewRect.top))}px`;renderPalette()}
let settingsReturnFocus=null;const PROFILE_KEY='pathloom.printerProfiles.v1';let configuredFilamentDiameter=1.75,configuredStartGcode='',configuredToolChangeGcode='',configuredEndGcode='';const profileFields=[['profileDiameter','filamentDiameter'],['profileBedWidth','bedWidth'],['profileBedDepth','bedDepth'],['profileMaxHeight','maxHeight']];const profileDefaults=[1.75,250,210,220];
const defaultStartGcode=`G90 ; use absolute coordinates
M83 ; extruder relative mode
M140 S{bed_temperature} ; set bed temp
M104 S{nozzle_temperature} ; set extruder temp
M190 S{bed_temperature} ; wait for bed temp
M109 S{nozzle_temperature} ; wait for extruder temp
M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%`;
const defaultEndGcode=`G1 Z{print_max_z_plus_10} F{travel_feedrate} ; move print head up
G1 X0 Y{bed_depth} F{travel_feedrate} ; park
M104 S0 ; turn off temperature
M140 S0 ; turn off heatbed
M107 ; turn off fan
M84 ; disable motors`;
const defaultToolChangeGcode=`T{to_tool}`;
const referenceToolChangeGcode=`; Prepare for tool change T{from_tool} -> T{to_tool}
G92 E0
G1 E-15.0000 F6000
G1 E12.0000 F600
G1 E-15.0000 F6000
G1 E8.0000 F600
G1 E-15.0000 F6000
G1 E-24.0000 F1200
G1 E-7 F600
G1 E-35.0000 F300
M142 S36 ; heatbreak temperature
T{to_tool}
M900 K0.05
M572 S0.036
G92 E0
G1 E6.4 F3000 ; after tool change load
G1 E{tool_change_load} F900 ; after tool change load`;
const referenceStartGcode=`M555 X{print_min_x} Y{print_min_y} W{print_area_width} H{print_area_height}
G90 ; use absolute coordinates
M83 ; extruder relative mode
M104 S170 ; preheat extruder
M140 S{bed_temperature} ; set bed temp
M109 S170 ; wait for preheat
G28 W ; home all without mesh bed level
G0 Z40 F1000
G1 E-2 F2400 ; retraction
M84 E ; turn off E motor

; Nozzle wiper
G0 X210 Y-14 Z1.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-18 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z1.5 F3000
G29 P9 X208 Y-2.5 W32 H4

; Nozzle wiper after probing
G0 X210 Y-14 Z1.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-18 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z1.5 F3000

; Mesh bed leveling
M84 E
G29 P1
G29 P1 X150 Y0 W100 H20 C
G29 P3.2
G29 P3.13
G29 A

; Prepare and purge
M104 S{nozzle_temperature}
G0 X249 Y-2.5 Z15 F4800
M109 S{nozzle_temperature}
M190 S{bed_temperature}
T0
G1 E20 F1000
G92 E0
G0 E5 X235 Z0.2 F500
G0 X145 E36 F500
G0 X135 E4 F500
G0 X125 E4 F650
G0 X122 Z0.05 F8000
G0 X119 Z0.2 F8000
G92 E0
M221 S100
M907 E430
G21
G90
M83
M900 K0.05
M900 K30
M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%`;
const referenceEndGcode=`G1 Z{print_max_z_plus_10} F{travel_feedrate} ; move print head up
G1 X0 Y{bed_depth} F{travel_feedrate} ; park
G1 E6 F2000
G1 E-35 F2000
M702 C ; unload filament
G4 ; wait
M221 S100 ; reset flow
M900 K0 ; reset LA
M907 E538 ; reset extruder motor current
M104 S0 ; turn off temperature
M140 S0 ; turn off heatbed
M107 ; turn off fan
M84 ; disable motors
M73 P100 R0
M73 Q100 S0`;
function profileGcodeDefaults(name){return name==='Prusa MK4S'?{startGcode:referenceStartGcode,toolChangeGcode:referenceToolChangeGcode,endGcode:referenceEndGcode}:{startGcode:defaultStartGcode,toolChangeGcode:defaultToolChangeGcode,endGcode:defaultEndGcode}}
function normalizeStoredGcode(code){return String(code||'').replace(/^M555 X63 Y42 W123 H125$/m,'M555 X{print_min_x} Y{print_min_y} W{print_area_width} H{print_area_height}').replace(/^M106 S125(?:\s*;.*)?$/m,'M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%')}
function readPrinterProfiles(){try{const value=JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
function selectSettingsTab(tab){const printer=tab==='printer';$('#printerSettings').hidden=!printer;$('#filamentSettings').hidden=printer;$('#printerSettingsTab').setAttribute('aria-selected',String(printer));$('#filamentSettingsTab').setAttribute('aria-selected',String(!printer))}
function loadPrinterProfile(){const name=$('#profilePrinter').value,saved=readPrinterProfiles()[name],defaults=profileGcodeDefaults(name);profileFields.forEach(([field,basic],i)=>{$(`#${field}`).value=Number(saved?.[basic])>0?Number(saved[basic]):profileDefaults[i]});$('#profileStartGcode').value=normalizeStoredGcode(typeof saved?.startGcode==='string'?saved.startGcode:defaults.startGcode);$('#profileToolChangeGcode').value=normalizeStoredGcode(typeof saved?.toolChangeGcode==='string'?saved.toolChangeGcode:defaults.toolChangeGcode);$('#profileEndGcode').value=normalizeStoredGcode(typeof saved?.endGcode==='string'?saved.endGcode:defaults.endGcode)}
function applyPrinterProfile(name){const saved=readPrinterProfiles()[name],defaults=profileGcodeDefaults(name);profileFields.forEach(([,basic],i)=>{const value=Number(saved?.[basic])>0?Number(saved[basic]):profileDefaults[i];if(basic==='filamentDiameter')configuredFilamentDiameter=value;else if(basic in configuredBuildVolume)configuredBuildVolume[basic]=value;else $(`#${basic}`).value=value});configuredStartGcode=normalizeStoredGcode(typeof saved?.startGcode==='string'?saved.startGcode:defaults.startGcode);configuredToolChangeGcode=normalizeStoredGcode(typeof saved?.toolChangeGcode==='string'?saved.toolChangeGcode:defaults.toolChangeGcode);configuredEndGcode=normalizeStoredGcode(typeof saved?.endGcode==='string'?saved.endGcode:defaults.endGcode);syncToolSpeedPlaceholders();updateBuildVolumePreview();buildInstances()}
function openSettings(tab='printer'){settingsReturnFocus=document.activeElement;$('#profilePrinter').innerHTML=$('#printerSelect').innerHTML;$('#profilePrinter').value=$('#printerSelect').value;loadPrinterProfile();renderFilamentLibrary();selectSettingsTab(tab);$('#libraryModal').hidden=false;$(tab==='printer'?'#printerSettingsTab':'#filamentSettingsTab').focus()}
function openLibrary(){openSettings('filament')}
function closeLibrary(){$('#libraryModal').hidden=true;resetFilamentForm();settingsReturnFocus?.focus()}
function renderFilamentLibrary(){const host=$('#filamentList');host.innerHTML='';if(!filamentLibrary.length){host.innerHTML='<div class="library-empty">No saved filaments yet.</div>';return}filamentLibrary.forEach(f=>{const row=document.createElement('div');row.className='filament-item';row.innerHTML=`<button class="filament-pick" title="Use this color"><i style="--filament-color:${f.color}"></i><span><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml([f.brand,f.material,`${f.diameter} mm`].filter(Boolean).join(' · '))}</small></span></button><details class="filament-menu"><summary aria-label="Actions for ${escapeHtml(f.name)}">…</summary><div class="filament-item-actions"><button class="edit-filament">Edit</button><button class="delete-filament">Delete</button></div></details>`;row.querySelector('.filament-pick').addEventListener('click',()=>{if(activeTool){applyPaletteEntry({name:f.name,hex:f.color,filamentId:f.id});$('#libraryModal').hidden=true;$('#colorPopover').hidden=false}else showToast('Open a tool color first to apply this filament')});row.querySelector('.edit-filament').addEventListener('click',()=>editFilament(f.id));row.querySelector('.delete-filament').addEventListener('click',()=>deleteFilament(f.id));row.querySelector('.filament-menu').addEventListener('toggle',e=>{if(!e.currentTarget.open)return;host.querySelectorAll('.filament-menu[open]').forEach(menu=>{if(menu!==e.currentTarget)menu.open=false})});host.appendChild(row)})}
function editFilament(id){const f=filamentLibrary.find(x=>x.id===id);if(!f)return;$('#filamentEditId').value=f.id;$('#filamentName').value=f.name;$('#filamentBrand').value=f.brand||'';$('#filamentMaterial').value=f.material||'PLA';$('#filamentDia').value=f.diameter||1.75;$('#filamentColor').value=f.color;$('#filamentHex').value=f.color;$('#filamentFormTitle').textContent='Edit filament';$('#cancelFilamentEdit').hidden=false}
function resetFilamentForm(){$('#filamentForm').reset();$('#filamentEditId').value='';$('#filamentDia').value='1.75';$('#filamentColor').value='#223B59';$('#filamentHex').value='#223B59';$('#filamentFormTitle').textContent='Add filament';$('#cancelFilamentEdit').hidden=true}
function deleteFilament(id){filamentLibrary=filamentLibrary.filter(f=>f.id!==id);saveFilamentLibrary();renderFilamentLibrary();renderPalette();showToast('Filament removed')}
function upsertFilament(e){e.preventDefault();const color=normalizeHex($('#filamentHex').value)||normalizeHex($('#filamentColor').value);if(!color){showToast('Enter a valid hex color','error');return}const id=$('#filamentEditId').value||uid();const record={id,name:$('#filamentName').value.trim(),brand:$('#filamentBrand').value.trim(),material:$('#filamentMaterial').value,diameter:Number($('#filamentDia').value)||1.75,color};if(!record.name){showToast('Filament name is required','error');return}const idx=filamentLibrary.findIndex(f=>f.id===id);if(idx>=0)filamentLibrary[idx]=record;else filamentLibrary.unshift(record);saveFilamentLibrary();renderFilamentLibrary();renderPalette();resetFilamentForm();showToast(idx>=0?'Filament updated':'Filament saved')}
async function importFiles(files){for(const file of files){try{const parsed=sanitizeToolpath(JSON.parse(await file.text()),file.name);addSource(parsed);showToast(`${file.name} added`)}catch(err){console.error(err);showToast(`${file.name}: ${err.message}`,'error')}}}
async function loadUkigaraSample(){try{const response=await fetch('./samples/ukigara-clock.toolpath');if(!response.ok)throw new Error(`HTTP ${response.status}`);addSource(sanitizeToolpath(await response.json(),'Ukigara Clock.toolpath'));showToast('Ukigara Clock sample loaded')}catch(err){showToast(`Unable to load sample: ${err.message}`,'error')}}
function transformedPoints(path,instance){const a=(instance.rotation||0)*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);return path.points.map(([x,y,z])=>[x*cos-y*sin+instance.x,x*sin+y*cos+instance.y,z])}
function printerPoints(path,instance){return transformedPoints(path,instance).map(([x,y,z])=>[x+configuredBuildVolume.bedWidth/2,y+configuredBuildVolume.bedDepth/2,z])}
function sourceMaxZ(source){let maximum=0;for(const path of source?.paths||[])for(const point of path.points)maximum=Math.max(maximum,point[2]);return maximum}
function renderGcodeTemplate(template,values){return String(template||'').replace(/\{([a-z0-9_]+)\}/gi,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match).trim()}
function formatPrintTime(seconds){const total=Math.ceil(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),remaining=total%60;return hours?`${hours}h ${minutes}m ${remaining}s`:`${minutes}m ${remaining}s`}
let printEstimateFrame=null;
function schedulePrintEstimate(){if(printEstimateFrame!==null)return;printEstimateFrame=requestAnimationFrame(()=>{printEstimateFrame=null;renderPrintEstimate()})}
function renderPrintEstimate(){
  const label=$('#printTimeEstimate'),detail=$('#printTimeDetails'),filaments=$('#filamentUsageDetails');
  filaments.replaceChildren();
  if(!instanceState.size){label.textContent='Print time in total: —';detail.textContent='Add a toolpath to estimate print time.';return}
  try{
    const ordered=[...instanceState.values()].sort((a,b)=>a.order-b.order);
    const instances=ordered.map((instance,index)=>({previousMaxZ:index?sourceMaxZ(sourceState.get(ordered[index-1].source)):0,paths:sourceState.get(instance.source).paths.map(path=>{const tool=sourceState.get(instance.source).tools.get(path.tool);return{points:printerPoints(path,instance),tool:toolOutputId(path.tool,tool),speed:toolEffectiveSpeed(tool),erate:tool?.erate??1}})}));
    const start=renderGcodeTemplate(configuredStartGcode||defaultStartGcode,{}),matches=[...start.matchAll(/^\s*T(\d+)\b/gm)];
    const result=estimatePrintTime(instances,Number($('#travelSpeed').value),configuredBuildVolume.maxHeight,matches.length?matches.at(-1)[1]:null);
    const usage=estimateFilamentUsage(instances,Number($('#printWidth').value),Number($('#printHeight').value),configuredFilamentDiameter);
    for(const[tool,mm]of [...usage].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))){const row=document.createElement('div');row.className='estimate-filament-row';for(const text of [`T${tool}`,'·',mm.toFixed(1),'mm']){const cell=document.createElement('span');cell.textContent=text;row.append(cell)}filaments.appendChild(row)}
    filaments.style.setProperty('--filament-number-width',(Math.max(5,...[...usage.values()].map(mm=>mm.toFixed(1).length))+.5)+'ch');
    const showHours=Math.ceil(result.totalSeconds)>=3600;
    const timeRow=(title,seconds,separator='·')=>{const row=document.createElement('div');row.className='estimate-time-row';row.setAttribute('aria-label',`${title}: ${formatPrintTime(seconds)}`);const name=document.createElement('span'),dot=document.createElement('span'),value=document.createElement('span');name.textContent=title;dot.textContent=separator;value.className='estimate-time-value';value.style.gridTemplateColumns=`${showHours?Math.max(3,String(Math.floor(Math.ceil(result.totalSeconds)/3600)).length)+'ch 1ch ':''}3ch 1ch 3ch 1ch`;const total=Math.ceil(seconds),parts=[...(showHours?[[Math.floor(total/3600),'h']]:[]),[Math.floor(total%3600/60),'m'],[total%60,'s']];for(const[number,unit]of parts){const n=document.createElement('span'),u=document.createElement('span');n.textContent=number;u.textContent=unit;u.className='estimate-unit';value.append(n,u)}row.append(name,dot,value);return row};
    label.replaceChildren(timeRow('Print time in total',result.totalSeconds,':'));
    detail.replaceChildren(timeRow('Print',result.printSeconds),timeRow('Travel',result.travelSeconds),timeRow('Tool changes',result.toolChangeSeconds));
  }catch(error){label.textContent='Print time in total: —';detail.textContent=error.message}
}

function exportThumbnails(){
  if(!THREE)throw new Error('Wait for the 3D preview before exporting');
  const captureScene=new THREE.Scene(),model=new THREE.Group();captureScene.background=new THREE.Color('#ffffff');captureScene.add(model);
  const captureRenderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  const size=768;captureRenderer.setPixelRatio(1);captureRenderer.setSize(size,size,false);
  try{
    for(const[id,instance]of instanceState){
      const group=createInstanceGroup(id,instance);
      group.traverse(node=>{if(node.material?.uniforms){node.material.uniforms.resolution.value.set(size,size);node.material.uniforms.lineOpacity.value=1}});
      model.add(group);
    }
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    if(bounds.isEmpty())throw new Error('No geometry to capture');
    const center=bounds.getCenter(new THREE.Vector3()),span=bounds.getSize(new THREE.Vector3()).length();
    const captureCamera=new THREE.OrthographicCamera(-1,1,1,-1,.01,Math.max(100,span*6));
    captureCamera.up.set(0,0,1);
    captureCamera.position.copy(center).add(new THREE.Vector3(1,-1,.85).normalize().multiplyScalar(Math.max(10,span*2)));
    captureCamera.lookAt(center);captureCamera.updateMatrixWorld(true);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const corner=new THREE.Vector3(x,y,z).applyMatrix4(captureCamera.matrixWorldInverse);
      minX=Math.min(minX,corner.x);maxX=Math.max(maxX,corner.x);minY=Math.min(minY,corner.y);maxY=Math.max(maxY,corner.y);
    }
    const half=Math.max(maxX-minX,maxY-minY,.1)*.54,midX=(minX+maxX)/2,midY=(minY+maxY)/2;
    captureCamera.left=midX-half;captureCamera.right=midX+half;captureCamera.bottom=midY-half;captureCamera.top=midY+half;captureCamera.updateProjectionMatrix();
    captureRenderer.render(captureScene,captureCamera);
    const canvas=document.createElement('canvas'),blocks=[];
    function drawThumbnail(width,height){
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d'),side=Math.min(width,height);
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
      ctx.drawImage(captureRenderer.domElement,(width-side)/2,(height-side)/2,side,side);
      return ctx;
    }
    drawThumbnail(380,285);
    blocks.push(thumbnailBlock('thumbnail',380,285,canvas.toDataURL('image/png').split(',')[1]));
    for(const[w,h]of [[16,16],[313,173],[480,240]]){
      const ctx=drawThumbnail(w,h),bytes=encodeQoi(w,h,ctx.getImageData(0,0,w,h).data);
      let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
      blocks.push(thumbnailBlock('thumbnail_QOI',w,h,btoa(binary)));
    }
    return blocks.join('\n\n');
  }finally{
    model.traverse(node=>{node.geometry?.dispose();node.material?.dispose()});captureRenderer.dispose();captureRenderer.forceContextLoss();
  }
}

function generateGcode(){
  if(!instanceState.size)throw new Error('Add a .toolpath file first');
  assertPrintReferencesCurrent();
  for(const source of sourceState.values())if(source.generator&&source.generationError)throw new Error(`${source.label}: ${source.generationError}`);
  for(const source of sourceState.values())if(source.generator){const layerHeight=pipelineLayerHeight(source.generator);if(layerHeight===null||Math.abs(layerHeight-Number($('#printHeight').value))>1e-6)throw new Error(`Set Print height to ${layerHeight} mm to match ${source.label}`)}
  const width=Number($('#printWidth').value),height=Number($('#printHeight').value),filamentD=configuredFilamentDiameter,travel=Number($('#travelSpeed').value),nozzleTemperature=Number($('#nozzleTemperature').value),bedTemperature=Number($('#bedTemperature').value),fanSpeed=Number($('#fanSpeed').value);
  if(![width,height,filamentD,travel].every(value=>Number.isFinite(value)&&value>0)||![nozzleTemperature,bedTemperature].every(value=>Number.isFinite(value)&&value>=0)||!Number.isFinite(fanSpeed)||fanSpeed<0||fanSpeed>100)throw new Error('Check Basic Settings');
  const orderedInstances=[...instanceState.entries()].sort((a,b)=>a[1].order-b[1].order),filamentArea=Math.PI*Math.pow(filamentD/2,2),ePerMmBase=width*height/filamentArea;
  let printMinX=Infinity,printMaxX=-Infinity,printMinY=Infinity,printMaxY=-Infinity,printMaxZ=0;
  for(const[,instance]of orderedInstances){const source=sourceState.get(instance.source);for(const path of source.paths)for(const[x,y,z]of printerPoints(path,instance)){printMinX=Math.min(printMinX,x);printMaxX=Math.max(printMaxX,x);printMinY=Math.min(printMinY,y);printMaxY=Math.max(printMaxY,y);printMaxZ=Math.max(printMaxZ,z)}}
  const areaMinX=Math.max(0,Math.floor(printMinX)),areaMinY=Math.max(0,Math.floor(printMinY)),areaMaxX=Math.min(configuredBuildVolume.bedWidth,Math.ceil(printMaxX)),areaMaxY=Math.min(configuredBuildVolume.bedDepth,Math.ceil(printMaxY));
  if(printMinX<0||printMinY<0||printMaxX>configuredBuildVolume.bedWidth||printMaxY>configuredBuildVolume.bedDepth||printMaxZ>configuredBuildVolume.maxHeight)throw new Error('Objects extend outside the configured build volume');
  const templateValues={bed_temperature:bedTemperature,nozzle_temperature:nozzleTemperature,fan_speed_percent:fanSpeed,fan_speed_255:Math.round(fanSpeed*255/100),travel_speed:travel,travel_feedrate:Math.round(travel*60),bed_width:configuredBuildVolume.bedWidth,bed_depth:configuredBuildVolume.bedDepth,max_height:configuredBuildVolume.maxHeight,print_min_x:areaMinX,print_min_y:areaMinY,print_max_x:areaMaxX,print_max_y:areaMaxY,print_area_width:Math.max(1,areaMaxX-areaMinX),print_area_height:Math.max(1,areaMaxY-areaMinY),print_max_z:Number(printMaxZ.toFixed(3)),print_max_z_plus_10:Number(Math.min(configuredBuildVolume.maxHeight,printMaxZ+10).toFixed(3))};
  const startCode=renderGcodeTemplate(configuredStartGcode||defaultStartGcode,templateValues),endCode=renderGcodeTemplate(configuredEndGcode||defaultEndGcode,templateValues),lines=['; Generated by Pathloom',`; width=${width.toFixed(2)} height=${height.toFixed(2)} filament=${filamentD.toFixed(2)}`,'; Start G-code',startCode];
  const toolMatches=[...startCode.matchAll(/^\s*T(\d+)\b/gm)];let currentTool=toolMatches.length?toolMatches.at(-1)[1]:null,toolChangeCount=0;
  const estimateInstances=orderedInstances.map(([,instance],index)=>({previousMaxZ:index?sourceMaxZ(sourceState.get(orderedInstances[index-1][1].source)):0,paths:sourceState.get(instance.source).paths.map(path=>{const tool=sourceState.get(instance.source).tools.get(path.tool);return{points:printerPoints(path,instance),tool:toolOutputId(path.tool,tool),speed:Math.round(toolEffectiveSpeed(tool)*60)/60,erate:tool?.erate??1}})}));
  if(estimateInstances.some(instance=>instance.paths.some(path=>!/^\d+$/.test(path.tool))))throw new Error('Prusa output requires numeric tool IDs');
  const estimate=estimatePrintTime(estimateInstances,travel,configuredBuildVolume.maxHeight,currentTool),usage=estimateFilamentUsage(estimateInstances,width,height,filamentD);
  lines.splice(1,0,exportThumbnails(),`; estimated printing time (normal mode) = ${durationText(estimate.totalSeconds)}`,...usageComments(usage,filamentD),`; printer_model = ${$('#printerSelect').value==='Prusa CoreOne'?'COREONE':'MK4S'}`,`; layer_height = ${height}`,`; filament_diameter = ${filamentD}`,`; extrusion_width = ${width}`);
  lines.push(progressCommand(0,estimate.totalSeconds));
  let elapsed=0,previousPoint=null;
  for(const[instanceIndex,[instanceId,instance]]of orderedInstances.entries()){
    const source=sourceState.get(instance.source);lines.push(`\n; INSTANCE ${instanceDisplayName(instanceId,instance)}`);
    if(instanceIndex>0){
      const[previousId,previousInstance]=orderedInstances[instanceIndex-1],previousSource=sourceState.get(previousInstance.source),previousMaxZ=sourceMaxZ(previousSource),nextStart=printerPoints(source.paths[0],instance)[0],safeZ=Math.min(configuredBuildVolume.maxHeight,previousMaxZ+10),travelFeedrate=Math.round(travel*60);
      lines.push(`; Move safely from ${instanceDisplayName(previousId,previousInstance)} to ${instanceDisplayName(instanceId,instance)}`,`G1 Z${safeZ.toFixed(3)} F${travelFeedrate} ; raise 10 mm`,`G1 X${nextStart[0].toFixed(3)} Y${nextStart[1].toFixed(3)} F${travelFeedrate} ; move to next object`,`G1 Z${nextStart[2].toFixed(3)} F${travelFeedrate} ; lower to start Z`);
    }
    let previousLayerZ=null;
    source.paths.forEach((path,pathIndex)=>{
      const tool=source.tools.get(path.tool),outputTool=toolOutputId(path.tool,tool),numericTool=Number(outputTool);
      const points=printerPoints(path,instance),[startX,startY,startZ]=points[0],travelFeedrate=Math.round(travel*60);
      if(previousLayerZ!==startZ){lines.push(';LAYER_CHANGE',`;Z:${startZ.toFixed(3)}`,`;HEIGHT:${(previousLayerZ===null?startZ:startZ-previousLayerZ).toFixed(3)}`);previousLayerZ=startZ}
      if(previousPoint){const lift=pathIndex===0?Math.min(configuredBuildVolume.maxHeight,sourceMaxZ(sourceState.get(orderedInstances[instanceIndex-1][1].source))+10):startZ;elapsed+=(Math.abs(lift-previousPoint[2])+Math.hypot(startX-previousPoint[0],startY-previousPoint[1])+Math.abs(startZ-lift))/travel}
      if(currentTool!==null&&currentTool!==outputTool)elapsed+=30;
      lines.push(progressCommand(elapsed,estimate.totalSeconds));
      lines.push(`\n; PATH ${pathIndex+1}, LAYER ${path.layer}, Z = ${startZ.toFixed(3)}`,'G92 E0');
      if(instanceIndex===0||pathIndex>0)lines.push(`G1 Z${startZ.toFixed(3)} F${travelFeedrate}`,`G1 X${startX.toFixed(3)} Y${startY.toFixed(3)} F${travelFeedrate}`);
      if(currentTool!==outputTool){
        if(Number.isInteger(numericTool)&&numericTool>=0){
          if(currentTool===null)lines.push(`T${numericTool}`);
          else{lines.push(renderGcodeTemplate(configuredToolChangeGcode||defaultToolChangeGcode,{...templateValues,from_tool:currentTool,to_tool:outputTool,start_x:startX.toFixed(3),start_y:startY.toFixed(3),layer_z:startZ.toFixed(3),tool_change_index:toolChangeCount+1,tool_change_load:toolChangeCount===0?12.4:22.4}));toolChangeCount++}
        }else lines.push(`; TOOL ${outputTool}`);
        currentTool=outputTool;
      }
      const speed=Math.round(toolEffectiveSpeed(tool)*60),multiplier=tool?.erate??1;
      for(let index=1;index<points.length;index++){const[x,y,z]=points[index],[previousX,previousY,previousZ]=points[index-1],length=Math.hypot(x-previousX,y-previousY,z-previousZ),extrusion=length*ePerMmBase*multiplier;elapsed+=length/(speed/60);lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} E${extrusion.toFixed(5)} F${speed}`)}
      previousPoint=points.at(-1);
    });
  }
  lines.push('M73 P100 R0',`; estimated printing time (normal mode) = ${durationText(estimate.totalSeconds)}`,...usageComments(usage,filamentD));
  lines.push('\n; End G-code',endCode,'; End of Pathloom output');return lines.join('\n');
}
window.Pathloom={generateGcode,upsertLiveToolpath,loadUkigaraSample,addImportedBrepInspection,applyImportedBrepEdit};
function downloadText(name,text){const blob=new Blob([text],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function resize(){if(!renderer)return;const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);toolpathGroup?.traverse(child=>child.material?.uniforms?.resolution?.value.set(w,h));camera.aspect=w/h;camera.updateProjectionMatrix();previewDirty=true}
new ResizeObserver(resize).observe(viewport);function animate(){controls.update();if(previewDirty){renderer.render(scene,camera);updatePrintOrderMarkers();previewDirty=false}requestAnimationFrame(animate)}
document.querySelectorAll('.island-header').forEach(header=>header.addEventListener('click',()=>{if(header.disabled)return;const island=header.closest('.sidebar-island'),collapsed=island.classList.toggle('collapsed');header.setAttribute('aria-expanded',String(!collapsed));if(island.id==='layoutIsland'&&!collapsed)showAllObjects();else updatePrintOrderMarkers()}));
document.querySelectorAll('.basic-panel input[type="number"]').forEach(input=>input.addEventListener('wheel',event=>{if(!event.deltaY)return;event.preventDefault();if(event.deltaY<0)input.stepUp();else input.stepDown();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))},{passive:false}));
function formatBasicDecimal(input){const value=Number(input.value);if(Number.isFinite(value))input.value=value.toFixed(2)}
for(const id of ['printWidth','printHeight']){const input=$(`#${id}`);input.addEventListener('change',()=>formatBasicDecimal(input));input.addEventListener('blur',()=>formatBasicDecimal(input));formatBasicDecimal(input)}
$('#addToolpath').addEventListener('click',()=>{if(window.__TAURI__?.core?.invoke)document.dispatchEvent(new Event('pathloom:add-live-files'));else $('#toolpathInput').click()});$('#toolpathInput').addEventListener('change',e=>{importFiles([...e.target.files]);e.target.value=''});
$('#importStep').addEventListener('click',()=>{if(window.__TAURI__?.core?.invoke)document.dispatchEvent(new Event('pathloom:import-step-brep'));else $('#stepInput').click()});$('#stepInput').addEventListener('change',async event=>{const files=[...event.target.files];event.target.value='';for(const file of files){const worker=new Worker('./vendor/occt/occt-import-js-worker.js');try{const buffer=await file.arrayBuffer();const result=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(new Error(e.message||'STEP importer failed'));worker.postMessage({buffer},[buffer])});const shape=normalizeStepResult(result,file.name);importedShapes.push(shape);renderImportedShapes();showToast(`${file.name} imported · display only`)}catch(error){console.error(error);showToast(`${file.name}: ${error.message}`,'error')}finally{worker.terminate()}}});
$('#layerSlider').addEventListener('input',e=>{$('#layerValue').textContent=`${e.target.value} / ${e.target.max}`;$('#pathSlider').value=$('#pathSlider').max;inspectingLayerPaths=false;refreshVisibility()});$('#pathSlider').addEventListener('input',()=>{inspectingLayerPaths=true;refreshVisibility()});$('#previousPath').addEventListener('click',()=>stepLayerPoint(-1));$('#nextPath').addEventListener('click',()=>stepLayerPoint(1));$('#previousObject').addEventListener('click',()=>switchPreviewObject(-1));$('#nextObject').addEventListener('click',()=>switchPreviewObject(1));$('#printSpeed').addEventListener('input',()=>{syncToolSpeedPlaceholders();refreshVisibility()});$('#closePalette').addEventListener('click',()=>$('#colorPopover').hidden=true);viewport.addEventListener('pointerdown',e=>{const p=$('#colorPopover');if(!p.hidden&&!p.contains(e.target))p.hidden=true});$('#colorPopover').addEventListener('pointerdown',e=>e.stopPropagation());
['gridColumns','gridRows','gridSpacingX','gridSpacingY','gridRowOffset','gridRotation'].forEach(id=>$(`#${id}`).addEventListener('input',()=>autoArrange(true)));$('#gridPattern').addEventListener('change',()=>autoArrange(true));
$('#autoArrangeEnabled').addEventListener('change',e=>{$('#arrangeGridSettings').disabled=!e.target.checked;if(e.target.checked)autoArrange(true)});
$('#showPrintOrder').addEventListener('change',updatePrintOrderMarkers);
function syncOutputAction(){const send=$('#outputAction').value==='send',label=send?'Send to Printer':'Generate G-code';$('#executeOutputBtn').textContent=label;$('#executeOutputBtn').title=send?'Send generated G-code to the selected printer':'Download generated G-code';$('#outputAction').title=label}
$('#outputAction').addEventListener('change',syncOutputAction);$('#executeOutputBtn').addEventListener('click',()=>{if($('#outputAction').value==='send'){try{const gcode=generateGcode();document.dispatchEvent(new CustomEvent('pathloom:send-to-printer',{detail:{gcode,filename:'pathloom-output.gcode'}}))}catch(err){showToast(err.message,'error')}return}try{downloadText('pathloom-output.gcode',generateGcode());showToast('G-code generated')}catch(err){showToast(err.message,'error')}});syncOutputAction();
$('#openLibrary').addEventListener('click',openLibrary);$('#closeLibrary').addEventListener('click',closeLibrary);$('#libraryModal').addEventListener('pointerdown',e=>{if(e.target===$('#libraryModal'))closeLibrary()});$('#filamentForm').addEventListener('submit',upsertFilament);$('#cancelFilamentEdit').addEventListener('click',resetFilamentForm);$('#filamentColor').addEventListener('input',e=>$('#filamentHex').value=e.target.value.toUpperCase());$('#filamentHex').addEventListener('input',e=>{const hex=normalizeHex(e.target.value);if(hex)$('#filamentColor').value=hex});
$('#openSettings').addEventListener('click',()=>openSettings());
$('#printerSettingsTab').addEventListener('click',()=>selectSettingsTab('printer'));$('#filamentSettingsTab').addEventListener('click',()=>selectSettingsTab('filament'));$('#profilePrinter').addEventListener('change',loadPrinterProfile);$('#printerSelect').addEventListener('change',()=>applyPrinterProfile($('#printerSelect').value));
$('#printerProfileForm').addEventListener('submit',e=>{e.preventDefault();const profiles=readPrinterProfiles(),name=$('#profilePrinter').value,profile={};for(const[field,basic]of profileFields){const value=Number($(`#${field}`).value);if(!Number.isFinite(value)||value<=0){showToast('Enter positive profile values','error');return}profile[basic]=value}profile.startGcode=$('#profileStartGcode').value.trim();profile.toolChangeGcode=$('#profileToolChangeGcode').value.trim();profile.endGcode=$('#profileEndGcode').value.trim();try{profiles[name]=profile;localStorage.setItem(PROFILE_KEY,JSON.stringify(profiles));$('#printerSelect').value=name;applyPrinterProfile(name);showToast('Printer profile saved')}catch{showToast('Unable to save printer profile','error')}});
document.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&$('#libraryModal').hidden&&!e.altKey&&!e.ctrlKey&&!e.metaKey){const target=e.target;if(target===$('#pathSlider')||target===$('#layerSlider')||!target.closest('input,select,textarea,[contenteditable],button')){e.preventDefault();const step=(e.key==='ArrowRight'||e.key==='ArrowUp'?1:-1)*(e.shiftKey?10:1);if(e.key==='ArrowUp'||e.key==='ArrowDown')stepPreviewLayer(step);else stepLayerPoint(step);return}}if(e.key==='Escape'){if(!$('#libraryModal').hidden)closeLibrary();else $('#colorPopover').hidden=true}if(e.key==='Tab'&&!$('#libraryModal').hidden){const items=[...$('#libraryModal').querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
$('#arrangeGridSettings').disabled=!$('#autoArrangeEnabled').checked;$('#rowOffsetField').hidden=$('#gridPattern').value!=='staggered';applyPrinterProfile($('#printerSelect').value);renderPalette();renderFilamentLibrary();renderAllUI();initializePreview().catch(err=>{console.error('3D preview initialization failed',err);$('#emptyState').hidden=false;$('#emptyState strong').textContent='3D preview unavailable';$('#emptyState span').textContent='Reload to retry. Settings remain available.';showToast('Unable to load 3D preview. Settings remain available.','error')});

$('#cancelRemoveObject').addEventListener('click',()=>$('#removeObjectDialog').close());
$('#confirmRemoveObject').addEventListener('click',()=>{const id=pendingSourceRemoval;$('#removeObjectDialog').close();if(sourceState.has(id))removeSource(id)});
$('#removeObjectDialog').addEventListener('close',()=>pendingSourceRemoval=null);

document.addEventListener('input',event=>{if(event.target.matches('#printSpeed, #travelSpeed, #printWidth, #printHeight, .tool-speed, .tool-erate'))schedulePrintEstimate()});

for(const sidebarScroll of document.querySelectorAll('.sidebar,.cad-panel')){
  function updateSidebarFade(){sidebarScroll.classList.toggle('scrolled',sidebarScroll.scrollTop>0);sidebarScroll.classList.toggle('has-more-below',sidebarScroll.scrollTop+sidebarScroll.clientHeight<sidebarScroll.scrollHeight-1)}
  sidebarScroll.addEventListener('scroll',updateSidebarFade,{passive:true});updateSidebarFade();
  new ResizeObserver(updateSidebarFade).observe(sidebarScroll);
  new MutationObserver(updateSidebarFade).observe(sidebarScroll,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
}

function syncPrintLinks(){
  for(const target of ['printWidth','printHeight']){
    const input=$('#'+target),binding=printLinks[target],source=binding&&sourceState.get(binding.sourceId),parameter=numberParameters(source?.generator).find(p=>p.key===binding.key);
    if(binding&&(!parameter||!Number.isFinite(parameter.value)||parameter.value<=0))delete printLinks[target];
    const linked=!!printLinks[target];input.disabled=linked;
    let icon=input.parentElement.querySelector('.print-link-icon');
    if(linked){input.value=parameter.value;input.title=`Linked to ${source.label} · ${parameter.label}`;if(!icon){icon=document.createElement('span');icon.className='print-link-icon';icon.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/></svg>';icon.setAttribute('aria-label','Linked parameter');input.parentElement.append(icon)}icon.title=input.title;icon.hidden=false}
    else{input.title='';if(icon)icon.hidden=true}
  }
  schedulePrintEstimate();
  document.dispatchEvent(new Event('pathloom:print-links-changed'));
}
function assertPrintReferencesCurrent(){for(const source of sourceState.values())for(const input of source.generator?.inputs||[])if(input.printSetting&&input.value!==Number($('#'+input.printSetting).value))throw new Error(`${source.label}: select the object to update its linked Print Settings before saving or exporting`)}
function captureProject(){
  assertPrintReferencesCurrent();
  for(const source of sourceState.values())if(source.generator&&source.generationError)throw new Error(`${source.label}: fix the generation error before saving`);
  return {format:'pathloom',version:1,printLinks:structuredClone(printLinks),sources:[...sourceState.values()].map(source=>({...source,tools:[...source.tools],liveSource:source.generator?source.liveSource:undefined})),instances:[...instanceState],importedShapes:importedShapes.map(({id,name,visible,sliceLayerHeight,assetId,brepIndex,faces,meshes})=>({id,name,visible,sliceLayerHeight,assetId,brepIndex,faces:faces?structuredClone(faces):undefined,meshes:structuredClone(meshes)})),
    settings:{printer:$('#printerSelect').value,...Object.fromEntries(BASIC_FIELDS.map(id=>[id,Number($('#'+id).value)]))},
    profile:{filamentDiameter:configuredFilamentDiameter,...configuredBuildVolume,startGcode:configuredStartGcode,toolChangeGcode:configuredToolChangeGcode,endGcode:configuredEndGcode},
    view:{layer:Number($('#layerSlider').value),showInputs:!$('#cadShowInputs')||$('#cadShowInputs').checked,camera:camera?.position.toArray(),target:controls?.target.toArray(),showPrintOrder:$('#showPrintOrder').checked},
    cad:window.PathloomCad?.snapshot?.()||null};
}
function restoreProject(raw){
  const project=validateProject(raw);
  const sources=project.sources.map(source=>({...source,...sanitizeToolpath({paths:source.paths},source.filename),tools:new Map(source.tools)}));
  document.dispatchEvent(new Event('pathloom:stop-live-files'));
  sourceState.clear();instanceState.clear();previewGeometryCache.clear();selectedBrepFaces.clear();importedShapes=project.importedShapes||[];
  for(const key of Object.keys(printLinks))delete printLinks[key];Object.assign(printLinks,project.printLinks||{});
  for(const source of sources)sourceState.set(source.id,source);
  for(const[id,instance]of project.instances)instanceState.set(id,instance);
  sourceCounter=Math.max(0,...sources.map(s=>Number(s.id.replace(/^S/,''))||0));selectedInstance=project.instances[0]?.[0]||null;previewInstance=null;
  $('#printerSelect').value=project.settings.printer;
  for(const id of BASIC_FIELDS)$('#'+id).value=project.settings[id];
  configuredFilamentDiameter=project.profile.filamentDiameter;Object.assign(configuredBuildVolume,{bedWidth:project.profile.bedWidth,bedDepth:project.profile.bedDepth,maxHeight:project.profile.maxHeight});
  configuredStartGcode=project.profile.startGcode;configuredToolChangeGcode=project.profile.toolChangeGcode;configuredEndGcode=project.profile.endGcode;
  $('#showPrintOrder').checked=project.view.showPrintOrder!==false;
  syncPrintLinks();updateBuildVolumePreview();renderAllUI();buildInstances();renderImportedShapes();
  $('#layerSlider').value=Math.min(Number($('#layerSlider').max),project.view.layer);
  const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
  if(camera&&vector(project.view.camera))camera.position.fromArray(project.view.camera);
  if(controls&&vector(project.view.target)){controls.target.fromArray(project.view.target);controls.update()}
  refreshVisibility();return project;
}


function clearCadProposal(){for(const group of cadHiddenGroups)group.visible=true;cadHiddenGroups=[];if(!cadProposalGroup)return;scene?.remove(cadProposalGroup);cadProposalGroup.traverse(node=>{node.geometry?.dispose();node.material?.dispose()});cadProposalGroup=null;previewDirty=true}
initCad({
  setComponentMetadata(id,stepId,metadata){const step=sourceState.get(id)?.generator?.steps.find(s=>s.id===stepId);if(step)Object.assign(step,structuredClone(metadata))},
  setEditorState(id,editor){const source=sourceState.get(id);if(source?.generator)source.generator.editor=structuredClone(editor)},
  lockPreview(active){if(active){$('#layerSlider').value=$('#layerSlider').max;$('#pathSlider').value=$('#pathSlider').max;inspectingLayerPaths=false}refreshVisibility()},
  setInputVisibility(sourceId,inputId,visible){const source=sourceState.get(sourceId);if(!source?.generator)return;const definition=migrateDefinition(source.generator),input=definition.inputs.find(input=>input.id===inputId);if(input){input.visible=visible;source.generator=definition;syncPrintLinks()}},
  printSettings:()=>Object.fromEntries(BASIC_FIELDS.map(id=>[id,Number($('#'+id).value)])),
  printLinks:()=>structuredClone(printLinks),
  setPrintLink(target,sourceId,key,linked){
    if(!['printWidth','printHeight'].includes(target))throw new Error('Unsupported print setting');
    if(linked){const parameter=numberParameters(sourceState.get(sourceId)?.generator).find(p=>p.key===key);if(parameter?.printSetting)throw new Error('A parameter following Print Settings cannot drive Print Settings');if(!parameter||!Number.isFinite(parameter.value)||parameter.value<=0)throw new Error('Link requires a positive parameter on a generated object');for(const other of ['printWidth','printHeight'])if(other!==target&&printLinks[other]?.sourceId===sourceId&&printLinks[other]?.key===key)delete printLinks[other];printLinks[target]={sourceId,key}}
    else delete printLinks[target];
    syncPrintLinks();
  },
  pickSource(event){
    if(!THREE||!camera||!toolpathGroup)return null;
    const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hit=ray.intersectObject(toolpathGroup,true).find(hit=>hit.object.visible&&hit.object.parent.visible);
    const instanceId=hit?.object.parent.userData.instanceId,instance=instanceState.get(instanceId);
    if(!instance)return null;selectedInstance=instanceId;return instance.source;
  },
  clearProposal:clearCadProposal,
  previewProposal(result,exclusive=false){
    clearCadProposal();if(!THREE||!scene)throw new Error('Wait for the 3D view');
    cadProposalGroup=new THREE.Group();const grouped=new Map();
    const current=sourceState.get(window.PathloomCad?.snapshot()?.sourceId),instance=[...instanceState.values()].find(instance=>instance.source===current?.id);
    for(const path of result.paths){const key=String(path.tool);if(!grouped.has(key))grouped.set(key,[]);const positions=grouped.get(key);for(let i=1;i<path.points.length;i++)positions.push(...path.points[i-1],...path.points[i])}
    for(const[tool,positions]of grouped){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:current?.tools.has(tool)?toolPreviewColor(current,tool):sharedToolAppearance(tool,Number(tool)||0).color}));cadProposalGroup.add(line)}
    if(result.previewPoints?.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(result.previewPoints.flat(),3));cadProposalGroup.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0xff553d,size:7,sizeAttenuation:false,depthTest:false})));}
    if(exclusive&&current)for(const group of toolpathGroup.children)if(instanceState.get(group.userData.instanceId)?.source===current.id){group.visible=false;cadHiddenGroups.push(group)}
    if(instance){cadProposalGroup.position.set(instance.x,instance.y,0);cadProposalGroup.rotation.z=instance.rotation*Math.PI/180}
    scene.add(cadProposalGroup);previewDirty=true;
  },
  apply(result,key){const info=upsertLiveToolpath({source:key,label:result.definition.name,paths:result.paths,origin:'generator'});const source=sourceState.get(info.sourceId);source.generator=result.definition;source.generationError=null;syncPrintLinks();return info.sourceId},
  invalidate(id,message){const source=sourceState.get(id);if(source?.generator)source.generationError=message},
  sourceExists:id=>sourceState.has(id),sources:()=>[...sourceState.values()],
  placement(sourceId){const selected=instanceState.get(selectedInstance);return selected?.source===sourceId?selected:[...instanceState.values()].find(instance=>instance.source===sourceId)||{x:0,y:0,rotation:0}},captureProject,restoreProject,
  preview:()=>({THREE,scene,camera,controls,canvas,viewport,dirty:()=>{previewDirty=true}}),
  toast:showToast
});
