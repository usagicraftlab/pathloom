import {printOutputNodes,isPrintOutputNode,operationSpec,geometrySourceType} from './cad-pipeline.js';
import {geometryEdges,connectGeometry,disconnectGeometry,removeGraphNodes} from './cad-graph.js';
const NS='http://www.w3.org/2000/svg';
const svg=tag=>document.createElementNS(NS,tag);
function button(text,title){const node=document.createElement('button');node.type='button';node.textContent=text;node.title=title;node.setAttribute('aria-label',title);return node}
// Distinct silhouettes identify data types without relying on color alone.
const PORT_VISUALS={
  Surface:{color:'#8b6cbc',icon:'<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 5 9-5M12 12v9"/>'},
  Point:{color:'#16889a',icon:'<path d="M12 3v5m0 8v5M3 12h5m8 0h5"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'},
  Points:{color:'#16889a',icon:'<circle cx="6" cy="6" r="2" fill="currentColor"/><circle cx="18" cy="7" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/><circle cx="18" cy="17" r="2" fill="currentColor"/>'},
  Curve:{color:'#348653',icon:'<path d="M3 18C5 2 18 22 21 6"/><circle cx="3" cy="18" r="1.5"/><circle cx="21" cy="6" r="1.5"/>'},
  'Tool info':{color:'#b1548f',icon:'<path d="M5 3h14v18H5zM9 7h6M9 12h6M9 17h6"/><circle cx="9" cy="7" r="1.5" fill="currentColor"/>'},
  Toolpaths:{color:'#c45c48',icon:'<path d="M3 5h17v5H4v5h16v5M17 17l3 3 3-3"/>'},
  Number:{color:'#4977ba',icon:'<path d="m8 4-2 16M17 4l-2 16M3 9h18M2 15h18"/>'},
  List:{color:'#4977ba',icon:'<path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>'},
  Boolean:{color:'#ab6495',icon:'<path d="m4 12 5 5L20 6"/>'},
  Geometry:{color:'#708398',icon:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10"/>'},
};
const portVisual=type=>PORT_VISUALS[type]||PORT_VISUALS.Geometry;
export function initNodeEditor(host,api){
  const toolbar=document.createElement('div');toolbar.className='node-toolbar';const fitButton=button('⌖','Fit nodes'),arrange=button('↕','Arrange nodes'),hint=document.createElement('span');hint.textContent='';toolbar.append(fitButton,arrange,hint);const geometryVisibility=document.querySelector('.geometry-visibility');if(geometryVisibility)toolbar.append(geometryVisibility);
  const viewport=document.createElement('div');viewport.className='node-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','Processing node graph');
  const world=document.createElement('div');world.className='node-world';const wires=svg('svg');wires.classList.add('node-wires');world.append(wires);viewport.append(world);host.replaceChildren(toolbar,viewport);
  let nodes=new Map(),definition=null,view={x:20,y:20,zoom:1},positions={},gesture=null,connecting=null,mouse=null,selectedEdge=null,frame=null,suppressClick=false,deferredLayout=null,selection=new Set();
  const marquee=document.createElement('div');marquee.className='node-marquee';marquee.hidden=true;viewport.append(marquee);
  function paintSelection(){for(const[id,node]of nodes)node.classList.toggle('node-selected',selection.has(id))}
  function persist(){api.layoutChanged({nodes:structuredClone(positions),view:{...view}})}
  function transform(){world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}
  function local(event){const rect=viewport.getBoundingClientRect();return{x:(event.clientX-rect.left-view.x)/view.zoom,y:(event.clientY-rect.top-view.y)/view.zoom}}
  function redraw(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;drawWires()})}
  function portPoint(id,kind,slot){const node=nodes.get(id);if(!node)return null;const port=[...node.querySelectorAll('.node-port')].find(p=>p.dataset.kind===kind&&(kind==='out'||p.dataset.slot===String(slot)));if(!port)return null;const a=port.getBoundingClientRect(),b=world.getBoundingClientRect();return{x:(a.left+a.width/2-b.left)/view.zoom,y:(a.top+a.height/2-b.top)/view.zoom}}
  function curve(a,b){const bend=Math.max(45,Math.abs(b.y-a.y)*.5);return `M${a.x},${a.y} C${a.x},${a.y+bend} ${b.x},${b.y-bend} ${b.x},${b.y}`}
  function drawWires(){wires.replaceChildren();if(!definition)return;
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);world.style.width=width+'px';world.style.height=height+'px';wires.setAttribute('width',width);wires.setAttribute('height',height);
    for(const edge of geometryEdges(definition)){const a=portPoint(edge.from,'out'),b=portPoint(edge.to,'in',edge.slot);if(!a||!b)continue;const path=svg('path');path.classList.add('node-wire');path.dataset.from=edge.from;path.dataset.to=edge.to;path.dataset.slot=edge.slot;path.setAttribute('d',curve(a,b));path.style.setProperty('--wire-color',portVisual(nodes.get(edge.from)?.querySelector('.node-port.out')?.dataset.type).color);path.classList.toggle('selected',selectedEdge?.from===edge.from&&selectedEdge?.to===edge.to&&selectedEdge?.slot===edge.slot);path.setAttribute('tabindex','0');path.setAttribute('aria-label',`${edge.from} → ${edge.to}`);const help=svg('title');help.textContent='Double-click to disconnect · Select and press Delete';path.append(help);path.addEventListener('click',event=>{event.stopPropagation();selectedEdge=edge;viewport.focus();redraw()});path.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();try{api.replace(disconnectGeometry(api.definition(),edge));selectedEdge=null}catch(error){api.error(error.message)}});wires.append(path)}
    if(connecting&&mouse){const a=portPoint(connecting,'out');if(a){const path=svg('path');path.classList.add('pending-wire');path.style.setProperty('--wire-color',portVisual(nodes.get(connecting)?.querySelector('.node-port.out')?.dataset.type).color);path.setAttribute('d',curve(a,mouse));wires.append(path)}}
  }
  function positionNodes(){for(const[id,node]of nodes){node.style.left=positions[id].x+'px';node.style.top=positions[id].y+'px'}redraw()}
  function autoLayout(){
    const levels=new Map(),lanes=new Map(),heights=new Map();let roots=0;
    for(const[id,node]of nodes)if(id.startsWith('input:')){levels.set(id,0);lanes.set(id,roots++);heights.set(0,Math.max(heights.get(0)||0,node.offsetHeight))}
    for(const step of definition.steps){const parents=geometryEdges(definition).filter(e=>e.to===step.id).map(e=>e.from);const level=1+Math.max(-1,...parents.map(id=>levels.get(id)??-1));levels.set(step.id,level);const inLevel=[...levels].filter(([id,l])=>id!==step.id&&l===level).length;lanes.set(step.id,inLevel);heights.set(level,Math.max(heights.get(level)||0,nodes.get(step.id).offsetHeight))}
    let last=0;for(const output of printOutputNodes(definition)){const level=Math.max(levels.get(output.source)||0,levels.get(output.toolSource)||0)+1;last=Math.max(last,level);levels.set(output.nodeId,level);lanes.set(output.nodeId,printOutputNodes(definition).findIndex(o=>o.id===output.id));heights.set(level,Math.max(heights.get(level)||0,nodes.get(output.nodeId).offsetHeight))}const ys=new Map();let y=40;for(let level=0;level<=Math.max(last,...levels.values());level++){ys.set(level,y);y+=(heights.get(level)||80)+55}
    positions={};for(const[id]of nodes)positions[id]={x:40+(lanes.get(id)||0)*175,y:ys.get(levels.get(id))||40};positionNodes();
  }
  function fit(onlySelected=false){if(!nodes.size||viewport.clientWidth<10||viewport.clientHeight<10)return;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const[id,node]of nodes){if(onlySelected&&selection.size&&!selection.has(id))continue;const p=positions[id];minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+node.offsetWidth);maxY=Math.max(maxY,p.y+node.offsetHeight)}view.zoom=Math.max(.15,Math.min(1,(viewport.clientWidth-60)/(maxX-minX),(viewport.clientHeight-60)/(maxY-minY)));view.x=(viewport.clientWidth-(maxX-minX)*view.zoom)/2-minX*view.zoom;view.y=30-minY*view.zoom;transform();redraw();persist()}
  function finishConnection(target){if(!connecting)return;const from=connecting;connecting=null;mouse=null;try{api.replace(connectGeometry(api.definition(),from,target.dataset.node,target.dataset.slot))}catch(error){api.error(error.message)}redraw()}
  function port(id,kind,type,slot='source',content=type){
    const node=button('',kind==='out'?`Output ${id} (${type})`:`Input ${id} (${type})`);node.className=`node-port ${kind}`;node.dataset.node=id;node.dataset.kind=kind;node.dataset.type=type;node.dataset.slot=slot;const visual=portVisual(type);node.style.setProperty('--port-color',visual.color);const icon=svg('svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.innerHTML=visual.icon;node.append(icon);node.title=`${content} (${type})${kind==='in'?' · Option-click to disconnect':''}`;node.setAttribute('aria-label',`${kind==='out'?'Output':'Input'} ${id} ${content} (${type})`);
    node.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.button!==0)return;if(kind==='out'){connecting=id;mouse=local(event);redraw()}else if(connecting)finishConnection(node)});
    node.addEventListener('click',event=>{event.stopPropagation();if(kind==='in'&&event.altKey){try{let next=api.definition();for(const edge of geometryEdges(next).filter(edge=>edge.to===id&&edge.slot===slot))next=disconnectGeometry(next,edge);api.replace(next)}catch(error){api.error(error.message)}return}if(kind==='out'){connecting=id;mouse=null;hint.textContent='接続先の入力ポートを選択'}else if(connecting)finishConnection(node)});const row=document.createElement('div');row.className=`node-port-row ${kind}`;row.append(node);return row;
  }
  function addPorts(id,node,spec,step){const inputs=document.createElement('div');inputs.className='node-input-ports';
    const types={surface:'Surface','tool-info':'Tool info',layers:'Curve',contours:'Curve',paths:'Toolpaths',points:'Points',curve:'Curve',point:'Point',number:'Number',list:'Number',boolean:'Number'};
    const sourceType=source=>types[geometrySourceType(definition,source)];
    if(isPrintOutputNode(id)){const output=printOutputNodes(definition).find(o=>o.nodeId===id);inputs.append(port(id,'in',sourceType(output.source)||'Geometry','output','Shape'),port(id,'in','Tool info','tools','Tool assignment'))}
    else if(spec&&step){
      for(const[key,type]of Object.entries(spec.params||{}))if(type==='curves'||type==='point')inputs.append(port(id,'in',type==='point'?'Point':'Curve',key,key==='curves'?'Profiles':key));
      if(spec.accepts==='branches'){for(let i=0;i<step.sources.length+(step.sources.length<8?1:0);i++)inputs.append(port(id,'in','Toolpaths',String(i),`Paths ${i+1}`))}
      else if(spec.accepts)inputs.append(port(id,'in',['geometry','layered'].includes(spec.accepts)?sourceType(step.source)||'Geometry':types[spec.accepts]||spec.accepts,'source','Shape'));
    }
    if(inputs.children.length){inputs.style.setProperty('--port-columns',Math.min(3,inputs.children.length));node.prepend(inputs)}
    if(!isPrintOutputNode(id)){const outputs=document.createElement('div');outputs.className='node-output-ports';const type=types[spec?.returns]||'Geometry',content=id.startsWith('input:')?definition.inputs.find(i=>`input:${i.id}`===id)?.name:['curve','contours','layers'].includes(spec?.returns)?'Shape':spec?.returns==='surface'?'Shape':spec?.returns==='points'?(step?.operation==='divide-curve'?'Samples':'Position'):spec?.returns==='tool-info'?'Tool assignment':'Print paths';outputs.append(port(id,'out',type,'source',content));node.append(outputs)}
  }
  function render(cards,d){
    definition=d;connecting=null;mouse=null;const previous=positions;nodes=new Map();world.querySelectorAll('.graph-node').forEach(node=>node.remove());
    for(const input of d.inputs.filter(i=>['curve','point','surface'].includes(i.type))){const id=`input:${input.id}`,node=document.createElement('article');node.className='graph-node geometry-node';node.dataset.inputId=input.id;const title=document.createElement('div');title.className='operation-heading';title.textContent=input.name;const type=document.createElement('div');type.className='node-type';type.textContent=input.type==='point'?'Point':'Curve';node.append(title);if(input.type==='surface'){const file=document.createElement('small');file.className='step-input-filename';file.textContent=input.liveSource?'Live · '+input.liveSource:input.filename||'Choose STEP…';file.title=input.filename;node.append(file)}if(input.type==='point'){const coordinates=document.createElement('div');coordinates.className='node-point-coordinates';for(let axis=0;axis<3;axis++){const label=document.createElement('label');label.textContent='XYZ'[axis];const field=document.createElement('input');field.type='number';field.step='.1';field.value=input.value[axis];field.setAttribute('aria-label',`${input.name} ${'XYZ'[axis]}`);field.addEventListener('change',()=>{const next=structuredClone(api.definition()),point=next.inputs.find(i=>i.id===input.id),value=Number(field.value);if(!field.value||!Number.isFinite(value)){field.value=input.value[axis];return}point.value[axis]=value;try{api.replace(next)}catch(error){api.error(error.message)}});label.append(field);coordinates.append(label)}node.append(coordinates)}node.addEventListener('dblclick',event=>{if(event.target.closest('input,button,textarea,select,.node-port'))return;event.preventDefault();event.stopPropagation();api.inspectInput(event,input.id)});node.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();api.inspectInput(event,input.id)});nodes.set(id,node);addPorts(id,node,{returns:input.type});world.append(node)}
    for(const card of cards){const id=card.dataset.stepId;card.classList.add('graph-node');nodes.set(id,card);addPorts(id,card,operationSpec(d,d.steps.find(s=>s.id===id)),d.steps.find(s=>s.id===id));world.append(card)}
    for(const descriptor of printOutputNodes(d)){const output=document.createElement('article');output.className='graph-node final-node';output.innerHTML='<div class="operation-heading print-output-heading"><svg class="print-output-icon" viewBox="0 0 24 24" role="img" aria-label="3D printer"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h1"/></svg><span>Print output</span></div>';output.addEventListener('dblclick',event=>{if(!event.target.closest('.node-port'))api.inspectOutput?.(event,descriptor.nodeId)});output.addEventListener('contextmenu',event=>api.inspectOutput?.(event,descriptor.nodeId));output.tabIndex=0;output.addEventListener('keydown',event=>{if(event.key==='Enter')api.inspectOutput?.(event,descriptor.nodeId)});output.dataset.outputId=descriptor.nodeId;const name=document.createElement('small');name.className='print-object-name';name.textContent=descriptor.name;name.title=descriptor.name;output.append(name);nodes.set(descriptor.nodeId,output);addPorts(descriptor.nodeId,output);world.append(output);}
    const saved=d.editor;positions={};const missing=[];for(const id of nodes.keys()){const p=Object.hasOwn(saved?.nodes||{},id)?saved.nodes[id]:Object.hasOwn(previous,id)?previous[id]:null;if(p)positions[id]={...p};else missing.push(id)}
    if(missing.length){const known={...positions};if(viewport.clientWidth<10)deferredLayout=known;autoLayout();for(const[id,p]of Object.entries(known))positions[id]=p;
      for(const id of missing){const p=positions[id],node=nodes.get(id);for(let attempt=0;attempt<nodes.size;attempt++){const hit=[...nodes].find(([other,n])=>other!==id&&positions[other]&&p.x<positions[other].x+n.offsetWidth+20&&p.x+node.offsetWidth+20>positions[other].x&&p.y<positions[other].y+n.offsetHeight+35&&p.y+node.offsetHeight+35>positions[other].y);if(!hit)break;p.y=positions[hit[0]].y+hit[1].offsetHeight+55}}
      positionNodes()}else positionNodes();
    selection=new Set([...selection].filter(id=>nodes.has(id)));paintSelection();
    if(saved?.view)view={...saved.view};transform();if(!saved?.view)requestAnimationFrame(fit);redraw();
  }
  viewport.addEventListener('contextmenu',event=>{if(event.isTrusted&&event.button!==0){event.preventDefault();event.stopImmediatePropagation()}},true);
  viewport.addEventListener('pointerdown',event=>{
    suppressClick=false;if(![0,1,2].includes(event.button))return;
    if(event.button!==2&&event.target.closest('.node-port,input,button,textarea,select,a,.step-parameter,.node-wire'))return;
    const node=event.target.closest('.graph-node'),id=node?[...nodes].find(([,n])=>n===node)?.[0]:null;
    viewport.focus({preventScroll:true});selectedEdge=null;const mode=event.button===2||event.button===1?'pan':node?'nodes':'select';
    if(mode==='nodes'){if(event.shiftKey){if(selection.has(id))selection.delete(id);else selection.add(id)}else if(!selection.has(id))selection=new Set([id]);paintSelection()}
    const initial={};for(const key of selection)initial[key]={...positions[key]};
    gesture={mode,button:event.button,target:event.target,start:{x:event.clientX,y:event.clientY},initial,view:{...view},baseline:event.shiftKey?new Set(selection):new Set(),moved:false};
    if(mode==='select'){if(!event.shiftKey)selection.clear();paintSelection();viewport.setPointerCapture(event.pointerId)}
    if(mode==='pan'){event.preventDefault();viewport.setPointerCapture(event.pointerId)}
  });
  viewport.addEventListener('pointermove',event=>{
    if(connecting){mouse=local(event);redraw()}if(!gesture)return;
    const dx=event.clientX-gesture.start.x,dy=event.clientY-gesture.start.y;
    if(Math.hypot(dx,dy)>3){gesture.moved=true;if(!viewport.hasPointerCapture(event.pointerId))viewport.setPointerCapture(event.pointerId)}if(!gesture.moved)return;
    if(gesture.mode==='nodes'){
      const originals=Object.values(gesture.initial);if(!originals.length)return;
      const x=dx/view.zoom,y=dy/view.zoom;
      for(const[id,p]of Object.entries(gesture.initial))positions[id]={x:p.x+x,y:p.y+y};positionNodes();
    }else if(gesture.mode==='pan'){view.x=gesture.view.x+dx;view.y=gesture.view.y+dy;transform();redraw()}
    else{
      const rect=viewport.getBoundingClientRect(),left=Math.min(event.clientX,gesture.start.x),top=Math.min(event.clientY,gesture.start.y),right=Math.max(event.clientX,gesture.start.x),bottom=Math.max(event.clientY,gesture.start.y);
      marquee.hidden=false;Object.assign(marquee.style,{left:left-rect.left+'px',top:top-rect.top+'px',width:right-left+'px',height:bottom-top+'px'});selection=new Set(gesture.baseline);
      for(const[id,node]of nodes){const r=node.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)selection.add(id)}paintSelection();
    }
  });
  function endGesture(event,cancelled=false){
    if(!cancelled&&connecting){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.node-port.in');if(target)finishConnection(target)}
    if(!gesture)return;const ended=gesture;gesture=null;suppressClick=ended.moved;marquee.hidden=true;
    if(ended.moved&&ended.mode!=='select')persist();if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    if(!cancelled&&ended.button===2&&!ended.moved&&ended.target.isConnected)ended.target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:event.clientX,clientY:event.clientY}));
  }
  document.addEventListener('pointerup',event=>endGesture(event));viewport.addEventListener('pointercancel',event=>endGesture(event,true));
  viewport.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  viewport.addEventListener('wheel',event=>{if(event.target.closest('.operation-card'))return;event.preventDefault();const point=local(event),rect=viewport.getBoundingClientRect(),zoom=Math.max(.15,Math.min(2,view.zoom*Math.exp(-event.deltaY*.001)));view={x:event.clientX-rect.left-point.x*zoom,y:event.clientY-rect.top-point.y*zoom,zoom};transform();persist();redraw()},{passive:false});
  function zoomAtCenter(factor,reset=false){const x=viewport.clientWidth/2,y=viewport.clientHeight/2,zoom=reset?1:Math.max(.15,Math.min(2,view.zoom*factor));view={x:x-(x-view.x)*zoom/view.zoom,y:y-(y-view.y)*zoom/view.zoom,zoom};transform();redraw();persist()}
  document.addEventListener('keydown',event=>{
    if(document.body.dataset.workspaceMode!=='generate'||viewport.clientWidth<10||event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false]),.workspace-modes,.operation-context,.component-details-panel,#cadInputInspector')||document.querySelector('dialog[open],.modal-backdrop:not([hidden])'))return;
    const command=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();let handled=true;
    if(command&&key==='a'){selection=event.shiftKey?new Set():new Set(nodes.keys());paintSelection();viewport.focus({preventScroll:true})}
    else if(command&&key==='z'){api.undo?.(event.shiftKey?1:-1)}
    else if(command&&(key==='k'||key==='f')){const r=viewport.getBoundingClientRect();viewport.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+20}))}
    else if(event.key==='Escape'){connecting=null;mouse=null;selectedEdge=null;selection.clear();paintSelection();hint.textContent='';redraw()}
    else if(event.key==='Delete'||event.key==='Backspace'){try{if(selectedEdge){api.replace(disconnectGeometry(api.definition(),selectedEdge));selectedEdge=null}else if(selection.size){api.replace(removeGraphNodes(api.definition(),selection));selection.clear();paintSelection()}else handled=false}catch(error){api.error(error.message)}}
    else if(!command&&key==='f')fit(event.shiftKey);
    else if(key==='+'||key==='=')zoomAtCenter(1.15);
    else if(key==='-')zoomAtCenter(1/1.15);
    else if(key==='0')zoomAtCenter(1,true);
    else if(event.key.startsWith('Arrow')&&!command){const amount=event.shiftKey?10:1,dx=event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0,dy=event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0;if(selection.size){const x=dx,y=dy;for(const id of selection){positions[id].x+=x;positions[id].y+=y}positionNodes()}else{view.x-=dx*10;view.y-=dy*10;transform();redraw()}persist()}
    else handled=false;
    if(handled){event.preventDefault();if(event.key!=='Escape')event.stopPropagation()}
  },true);
  fitButton.addEventListener('click',()=>fit());arrange.addEventListener('click',()=>{autoLayout();fit()});new ResizeObserver(()=>{if(deferredLayout&&viewport.clientWidth>10){const known=deferredLayout;deferredLayout=null;autoLayout();for(const[id,p]of Object.entries(known))if(nodes.has(id))positions[id]=p;positionNodes();persist()}redraw()}).observe(viewport);const observer=new ResizeObserver(redraw);function observe(){observer.disconnect();for(const node of nodes.values())observer.observe(node)}

  return{render(cards,d){render(cards,d);observe()},redraw,fit};
}
