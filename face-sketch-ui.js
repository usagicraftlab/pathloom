import {facePointToUv,faceUvToPoint,surfaceFacePlane,surfaceFromInput} from './face-sketch.js';

const button=(label,action)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',action);return node};

export function renderFaceSketchSettings({step,host,changed,refresh,close}){
  const label=step.operation==='face-spline'?'Spline':'Polyline';
  const editor=document.createElement('section');editor.className='face-sketch-settings';
  const status=document.createElement('p');status.className='hint';
  status.textContent=step.sketch?`STEP面 ${step.sketch.faceIndex+1} · ${step.sketch.points.length}点`:`${label}を作成する平面を選択してください。`;
  const start=()=>{document.dispatchEvent(new CustomEvent('pathloom:face-sketch-start',{detail:{stepId:step.id}}));close()};
  editor.append(status,button(step.sketch?'作成面を選び直す':'作成面を選択',start));
  if(step.sketch){
    const resume=()=>{document.dispatchEvent(new CustomEvent('pathloom:face-sketch-resume',{detail:{stepId:step.id}}));close()};
    const undo=button('最後の点を戻す',()=>{step.sketch.points.pop();changed();refresh()});undo.disabled=!step.sketch.points.length;
    const clear=button('点をクリア',()=>{step.sketch.points=[];changed();refresh()});clear.disabled=!step.sketch.points.length;
    editor.append(button('点を追加',resume),undo,clear);
  }
  host.append(editor);
}

export function initFaceSketchController({canvas,definition,inputUi,status,redraw}){
  let mode=null;
  const begin=(stepId,phase)=>{mode={stepId,phase};const step=definition().steps.find(item=>item.id===stepId),label=step?.operation==='face-spline'?'Spline':'Polyline';status(phase==='face'?`${label}を作成するSTEPの平面をクリックしてください。`:'面上をクリックして点を追加します。右クリックで終了します。');redraw()};
  document.addEventListener('pathloom:face-sketch-start',event=>begin(event.detail.stepId,'face'));
  document.addEventListener('pathloom:face-sketch-resume',event=>{if(inputUi.faceSketch(event.detail.stepId))begin(event.detail.stepId,'points')});
  canvas.addEventListener('contextmenu',event=>{if(!mode)return;event.preventDefault();mode=null;status('');redraw()},true);

  return{
    isActive:()=>!!mode,
    cacheState(){const sketch=mode&&inputUi.faceSketch(mode.stepId);return[mode?.stepId,JSON.stringify(sketch?.points)]},
    draw(THREE,group){
      const sketch=mode&&inputUi.faceSketch(mode.stepId);if(!sketch?.points.length)return;
      const input=definition().inputs.find(item=>item.id===sketch.inputId),plane=surfaceFacePlane(surfaceFromInput(input),sketch.faceIndex);if(!plane)return;
      const vertices=sketch.points.map(point=>new THREE.Vector3(...faceUvToPoint(point,plane)));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.LineBasicMaterial({color:0x1677c8,depthTest:false}));line.renderOrder=24;group.add(line);
      const handles=new THREE.Points(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.PointsMaterial({color:0x1677c8,size:10,sizeAttenuation:false,depthTest:false}));handles.renderOrder=25;group.add(handles);
    },
    handleHit(hit){
      if(!mode)return false;
      if(!hit){status('選択したSTEP面の上をクリックしてください。');return true}
      const data=hit.object.userData,faceIndex=data.triangleFaces[hit.faceIndex];
      try{
        if(mode.phase==='face'){
          inputUi.setFaceSketch(mode.stepId,data.inputId,faceIndex);mode.phase='points';status('面上をクリックして点を追加します。右クリックで終了します。');
        }else{
          const sketch=inputUi.faceSketch(mode.stepId);
          if(data.inputId!==sketch?.inputId||faceIndex!==sketch.faceIndex){status('選択した面の上に点を置いてください。');return true}
          const input=definition().inputs.find(item=>item.id===sketch.inputId),plane=surfaceFacePlane(surfaceFromInput(input),sketch.faceIndex),local=hit.object.worldToLocal(hit.point.clone());
          if(plane&&inputUi.appendFaceSketchPoint(mode.stepId,facePointToUv([local.x,local.y,local.z],plane)))status(`${inputUi.faceSketch(mode.stepId).points.length}点 · 続けてクリック、右クリックで終了`);
        }
        redraw();
      }catch(error){status(error.message,'error')}
      return true;
    },
  };
}
