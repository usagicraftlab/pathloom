// Planar curve primitives and reusable geometry transformations.
import ClipperLib from './vendor/clipper/clipper-browser.js';
const number=(min,max,integer=false)=>({min,max,integer});
export const COMPONENT_GROUPS=['Curve','Geometry','Transform','Pattern','Toolpath','Utility','Custom'];
export const BASIC_COMPONENTS={
  circle:{label:'Circle',group:'Curve',accepts:null,returns:'contours',params:{radius:'number',center:'point',samples:'number'},defaults:{radius:20,center:[0,0,0],samples:120},constraints:{radius:number(.05,500),samples:number(12,720,true)}},
  ellipse:{label:'Ellipse',group:'Curve',accepts:null,returns:'contours',params:{radiusX:'number',radiusY:'number',center:'point',samples:'number'},defaults:{radiusX:25,radiusY:15,center:[0,0,0],samples:120},constraints:{radiusX:number(.05,500),radiusY:number(.05,500),samples:number(12,720,true)}},
  rectangle:{label:'Rectangle',group:'Curve',accepts:null,returns:'contours',params:{width:'number',height:'number',center:'point'},defaults:{width:40,height:30,center:[0,0,0]},constraints:{width:number(.1,1000),height:number(.1,1000)}},
  'rounded-rectangle':{label:'Rounded rectangle',group:'Curve',accepts:null,returns:'contours',params:{width:'number',height:'number',radius:'number',center:'point',samples:'number'},defaults:{width:40,height:30,radius:4,center:[0,0,0],samples:80},constraints:{width:number(.1,1000),height:number(.1,1000),radius:number(.01,500),samples:number(12,720,true)}},
  polygon:{label:'Polygon',group:'Curve',accepts:null,returns:'contours',params:{radius:'number',sides:'number',angle:'number',center:'point'},defaults:{radius:20,sides:6,angle:0,center:[0,0,0]},constraints:{radius:number(.05,500),sides:number(3,64,true),angle:number(-36000,36000)}},
  star:{label:'Star',group:'Curve',accepts:null,returns:'contours',params:{radius:'number',innerRadius:'number',points:'number',angle:'number',center:'point'},defaults:{radius:22,innerRadius:12,points:5,angle:90,center:[0,0,0]},constraints:{radius:number(.05,500),innerRadius:number(.01,500),points:number(3,64,true),angle:number(-36000,36000)}},
  rotate:{label:'Rotate',group:'Transform',accepts:'geometry',returns:'same',params:{angle:'number',pivot:'point'},defaults:{angle:30,pivot:[0,0,0]},constraints:{angle:number(-36000,36000)}},
  scale:{label:'Scale',group:'Transform',accepts:'geometry',returns:'same',params:{factor:'number',pivot:'point'},defaults:{factor:1.2,pivot:[0,0,0]},constraints:{factor:number(.01,100)}},
  'scale-nu':{label:'Scale NU',group:'Transform',accepts:'geometry',returns:'same',params:{factors:'point',pivot:'point'},defaults:{factors:[1.2,1,1],pivot:[0,0,0]}},
  'mirror-x':{label:'Mirror X',group:'Transform',accepts:'geometry',returns:'same',params:{pivot:'point'},defaults:{pivot:[0,0,0]}},
  'mirror-y':{label:'Mirror Y',group:'Transform',accepts:'geometry',returns:'same',params:{pivot:'point'},defaults:{pivot:[0,0,0]}},
  resample:{label:'Resample curve',group:'Curve',accepts:'geometry',returns:'same',params:{samples:'number'},defaults:{samples:120},constraints:{samples:number(12,720,true)}},
  reverse:{label:'Reverse curve',group:'Curve',accepts:'geometry',returns:'same',params:{},defaults:{}},
  seam:{label:'Curve seam',group:'Curve',accepts:'geometry',returns:'same',params:{fraction:'number'},defaults:{fraction:.25},constraints:{fraction:number(0,1)}},
  'array-grid':{label:'Rectangular array',group:'Pattern',accepts:'geometry',returns:'same',params:{columns:'number',rows:'number',spacing:'point'},defaults:{columns:2,rows:2,spacing:[60,60,0]},constraints:{columns:number(1,16,true),rows:number(1,16,true)}},
  'array-polar':{label:'Polar array',group:'Pattern',accepts:'geometry',returns:'same',params:{count:'number',radius:'number',angle:'number',pivot:'point'},defaults:{count:4,radius:80,angle:360,pivot:[0,0,0]},constraints:{count:number(1,16,true),radius:number(0,1000),angle:number(-36000,36000)}},
  'curve-boolean':{label:'Curve Boolean',group:'Curve',description:'Boolean regions from closed, coplanar curve sets. A is the subject; B is the clipping set. Union combines both sets; Difference is A minus B; Intersection keeps their overlap; XOR keeps non-overlapping areas. B is optional for Union.',accepts:null,returns:'contours',curveSelection:'closed',minCurves:{a:1,b:0},params:{a:'curves',b:'curves',mode:'number',samples:'number'},defaults:{a:[],b:[],mode:0,samples:180},choices:{mode:[{value:0,label:'Union'},{value:1,label:'Difference'},{value:2,label:'Intersection'},{value:3,label:'XOR'}]},constraints:{mode:number(0,3,true),samples:number(12,720,true)}},
  offset:{label:'Offset curve',group:'Curve',description:'Offset closed planar contours. Positive values expand outer boundaries; holes offset in the opposite direction.',accepts:'contours',returns:'contours',params:{distance:'number'},defaults:{distance:1},constraints:{distance:number(-100,100)}},
  'join-close':{label:'Join / Close curves',group:'Curve',description:'Join open curve segments whose endpoints are within tolerance, then close only when the remaining endpoints are within that tolerance. Does not add long closing chords.',accepts:null,returns:'contours',curveSelection:'any',minCurves:{curves:1},params:{curves:'curves',tolerance:'number',samples:'number'},defaults:{curves:[],tolerance:.1,samples:180},constraints:{tolerance:number(.001,5),samples:number(12,720,true)}},
  'divide-curve':{label:'Divide curve',group:'Curve',description:'Return evenly spaced points along each selected curve. Closed curves return count points without duplicating the seam; open curves return count + 1 points including endpoints.',accepts:null,returns:'points',curveSelection:'any',minCurves:{curves:1},params:{curves:'curves',count:'number'},defaults:{curves:[],count:12},constraints:{count:number(1,720,true)}},
  'evaluate-curve':{label:'Evaluate curve',group:'Curve',description:'Return one point on each selected curve at normalized arc-length parameter t from 0 to 1.',accepts:null,returns:'points',curveSelection:'any',minCurves:{curves:1},params:{curves:'curves',t:'number'},defaults:{curves:[],t:.5},constraints:{t:number(0,1)}},
};
const rotate=(point,angle,pivot)=>{const c=Math.cos(angle),s=Math.sin(angle),x=point[0]-pivot[0],y=point[1]-pivot[1];return[pivot[0]+x*c-y*s,pivot[1]+x*s+y*c,...point.slice(2)]};
function resample(points,count){const closed=points.length>2&&Math.hypot(...points[0].map((v,a)=>v-points.at(-1)[a]))<1e-6,lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,a)=>v-points[i-1][a])));const total=lengths.at(-1);if(total<1e-6)throw new Error('Cannot resample a collapsed curve');let segment=1;const result=[];for(let i=0;i<(closed?count:count+1);i++){const distance=total*i/count;while(segment<lengths.length-1&&lengths[segment]<distance)segment++;const t=(distance-lengths[segment-1])/(lengths[segment]-lengths[segment-1]||1);result.push(points[segment-1].map((v,a)=>v+(points[segment][a]-v)*t))}if(closed)result.push([...result[0]]);return result}

const CLIPPER_SCALE=10000;
const toClipPath=points=>points.slice(0,-1).map(([x,y])=>({X:Math.round(x*CLIPPER_SCALE),Y:Math.round(y*CLIPPER_SCALE)}));
const fromClipPath=path=>path.map(({X,Y})=>[X/CLIPPER_SCALE,Y/CLIPPER_SCALE]);
function validClipPaths(contours){const paths=contours.map(contour=>toClipPath(contour.points)).filter(path=>path.length>=3&&Math.abs(ClipperLib.Clipper.Area(path))>=1);if(!paths.length)throw new Error('Operation needs at least one non-collapsed closed curve');return paths}
function executeCurveBoolean(a,b,mode){
  if(!Number.isInteger(mode)||mode<0||mode>3)throw new Error('Choose Union, Difference, Intersection or XOR');
  if(!a.length)throw new Error('Curve Boolean needs at least one curve in A');if(mode!==0&&!b.length)throw new Error('Difference, Intersection and XOR need at least one curve in B');
  const all=[...a,...b],z=all[0].points[0][2]||0,spatial=all.some(curve=>curve.points[0].length===3);if(all.some(curve=>curve.points.some(point=>Math.abs((point[2]||0)-z)>1e-6)))throw new Error('Curve Boolean requires all curves on the same XY-parallel plane');
  const subject=validClipPaths(a),clip=b.length?validClipPaths(b):[],engine=new ClipperLib.Clipper(ClipperLib.Clipper.ioStrictlySimple);
  engine.AddPaths(subject,ClipperLib.PolyType.ptSubject,true);if(clip.length)engine.AddPaths(clip,ClipperLib.PolyType.ptClip,true);
  const solution=new ClipperLib.PolyTree(),types=[ClipperLib.ClipType.ctUnion,ClipperLib.ClipType.ctDifference,ClipperLib.ClipType.ctIntersection,ClipperLib.ClipType.ctXor];
  if(!engine.Execute(types[mode],solution,ClipperLib.PolyFillType.pftEvenOdd,ClipperLib.PolyFillType.pftEvenOdd))throw new Error('Curve Boolean failed; check for invalid or intersecting input curves');
  const paths=ClipperLib.Clipper.PolyTreeToPaths(solution).map(fromClipPath).filter(path=>path.length>=3);if(!paths.length)throw new Error('Curve Boolean result is empty');
  return paths.map(points=>{if(spatial)points=points.map(point=>[...point,z]);return{points:[...points,[...points[0]]]}});
}
function executeOffset(source,distance){
  if(source.some(curve=>curve.points[0].length===3)){const groups=new Map();for(const curve of source){const z=curve.points[0][2]||0;if(!groups.has(z))groups.set(z,[]);groups.get(z).push({...curve,points:curve.points.map(([x,y])=>[x,y])})}return [...groups].flatMap(([z,curves])=>executeOffset(curves,distance).map(curve=>({...curve,points:curve.points.map(point=>[...point,z])})))}
  const rawPaths=validClipPaths(source);if(!Number.isFinite(distance)||Math.abs(distance)<1e-8)return structuredClone(source);
  const normalizer=new ClipperLib.Clipper(ClipperLib.Clipper.ioStrictlySimple);normalizer.AddPaths(rawPaths,ClipperLib.PolyType.ptSubject,true);const normalizedTree=new ClipperLib.PolyTree();if(!normalizer.Execute(ClipperLib.ClipType.ctUnion,normalizedTree,ClipperLib.PolyFillType.pftEvenOdd,ClipperLib.PolyFillType.pftEvenOdd))throw new Error('Offset could not normalize the input regions');const paths=ClipperLib.Clipper.PolyTreeToPaths(normalizedTree);
  const engine=new ClipperLib.ClipperOffset(2,CLIPPER_SCALE*.01);engine.AddPaths(paths,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
  const solution=new ClipperLib.PolyTree();engine.Execute(solution,distance*CLIPPER_SCALE);
  const result=ClipperLib.Clipper.PolyTreeToPaths(solution).map(fromClipPath).filter(path=>path.length>=3);
  if(!result.length)throw new Error('Offset removed all contours; reduce the offset distance');return result.map(points=>({points:[...points,[...points[0]]]}));
}
function sampleOpenControl(points,count){const out=[],n=points.length;for(let k=0;k<=count;k++){const u=k/count*(n-1),i=Math.min(n-2,Math.floor(u)),t=u-i,p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(n-1,i+2)];out.push(p1.map((v,a)=>.5*((2*v)+(-p0[a]+p2[a])*t+(2*p0[a]-5*v+4*p2[a]-p3[a])*t*t+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t*t*t)))}return out}
export function inputCurvePoints(input,samples,sectionPoints){const curve=input.curve;if(input.cadBinding){const points=curve.points.map(p=>[...p]);return curve.closed?[...points,[...points[0]]]:points}if(curve.closed)return sectionPoints(curve,samples);if(curve.type==='polyline')return curve.points.map(p=>[...p]);return sampleOpenControl(curve.points,Math.max(samples,(curve.points.length-1)*4))}
function curveLengths(points){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,a)=>v-points[i-1][a])));if(lengths.at(-1)<1e-8)throw new Error('Cannot evaluate a collapsed curve');return lengths}
function pointAtLength(points,lengths,t){const target=lengths.at(-1)*t;let i=1;while(i<lengths.length-1&&lengths[i]<target)i++;const span=lengths[i]-lengths[i-1],u=(target-lengths[i-1])/(span||1);const point=points[i-1].map((v,a)=>v+(points[i][a]-v)*u);return point.length===2?[...point,.1]:point}
function joinCurves(inputs,samples,tolerance,sectionPoints){
  const spatial=inputs.some(input=>input.curve.points.some(point=>point.length===3)),closed=[],remaining=[];for(const input of inputs){let points=inputCurvePoints(input,samples,sectionPoints);if(spatial)points=points.map(point=>point.length===2?[...point,0]:point);if(points.length<2)continue;if(input.curve.closed)closed.push({points:[...points.slice(0,-1),[...points[0]]]});else remaining.push(points)}
  const distance=(a,b)=>Math.hypot(...a.map((v,axis)=>v-b[axis])),joined=[];
  while(remaining.length){let chain=remaining.shift(),changed=true;while(changed){changed=false;for(let i=0;i<remaining.length;i++){const next=remaining[i],forward=distance(chain.at(-1),next[0])<=tolerance&&distance(next.at(-1),chain[0])<=tolerance,backward=distance(chain.at(-1),next.at(-1))<=tolerance&&distance(next[0],chain[0])<=tolerance;if(forward||backward){const oriented=backward?[...next].reverse():next,tail=chain.at(-1).map((v,a)=>(v+oriented[0][a])/2),head=oriented.at(-1).map((v,a)=>(v+chain[0][a])/2);chain=[...chain.slice(0,-1),tail,...oriented.slice(1,-1),head];chain[chain.length-1]=[...chain[0]];joined.push({points:chain});remaining.splice(i,1);chain=null;break}const matches=[['head',distance(chain[0],next.at(-1)),false],['tail',distance(chain.at(-1),next[0]),false],['head',distance(chain[0],next[0]),true],['tail',distance(chain.at(-1),next.at(-1)),true]].filter(x=>x[1]<=tolerance).sort((a,b)=>a[1]-b[1]);if(!matches.length)continue;if(matches.length>1&&Math.abs(matches[0][1]-matches[1][1])<1e-8)throw new Error('Join is ambiguous at a branching endpoint');const[side,,reverse]=matches[0],oriented=reverse?[...next].reverse():next,join=side==='head'?oriented.at(-1):oriented[0],target=side==='head'?chain[0]:chain.at(-1),snap=join.map((v,a)=>(v+target[a])/2);chain=side==='head'?[snap,...oriented.slice(0,-1),...chain.slice(1)]:[...chain.slice(0,-1),...oriented.slice(1),snap];remaining.splice(i,1);changed=true;break}if(!chain)break}
    if(!chain)continue;
    if(distance(chain[0],chain.at(-1))>tolerance)throw new Error('Curves did not form a closed loop within tolerance');chain[chain.length-1]=[...chain[0]];joined.push({points:chain});
  }return[...closed,...joined];
}
export function executeCurveInputComponent(operation,p,{inputs=new Map(),sectionPoints=()=>{throw new Error('Curve sampling is unavailable')},validateSection=()=>{}}={}){
  if(operation==='curve-boolean'){const curves=ids=>ids.map(id=>{const input=inputs.get(id);if(!input||input.type!=='curve'||!input.curve.closed)throw new Error('Curve Boolean accepts closed planar curves only');const points=sectionPoints(input.curve,p.samples);validateSection(points);return{points}});return executeCurveBoolean(curves(p.a),curves(p.b),p.mode)}
  if(operation==='join-close'){if(!(p.tolerance>0))throw new Error('Join tolerance must be positive');return joinCurves(p.curves.map(id=>inputs.get(id)).filter(Boolean),p.samples,p.tolerance,sectionPoints)}
  if(operation==='divide-curve'||operation==='evaluate-curve'){const output=[];for(const id of p.curves){const input=inputs.get(id);if(!input||input.type!=='curve')throw new Error('Select valid curves');const points=inputCurvePoints(input,180,sectionPoints),lengths=curveLengths(points);if(operation==='evaluate-curve')output.push(pointAtLength(points,lengths,p.t));else{if(!Number.isInteger(p.count)||p.count<1)throw new Error('Division count must be a positive integer');const n=input.curve.closed?p.count:p.count+1;for(let i=0;i<n;i++)output.push(pointAtLength(points,lengths,i/p.count))}}if(!output.length)throw new Error('Select at least one curve');return output}
  return null;
}
export function executeBasicComponent(operation,p,source){
  const spec=BASIC_COMPONENTS[operation];if(!spec)return null;
  if(operation==='curve-boolean'||operation==='join-close'||operation==='divide-curve'||operation==='evaluate-curve')return null;
  if(operation==='offset')return executeOffset(source,p.distance);
  if(!spec.accepts){
    if(p.center[2]!==0)throw new Error('Curve primitives are in XY; move in Z after Stack');let points=[];
    if(operation==='rectangle'){const w=p.width/2,h=p.height/2;points=[[-w,-h],[w,-h],[w,h],[-w,h]]}
    else if(operation==='rounded-rectangle'){const w=p.width/2,h=p.height/2,r=p.radius;if(r>Math.min(w,h))throw new Error('Corner radius must fit inside the rectangle');const n=Math.max(3,Math.ceil(p.samples/4));for(let corner=0;corner<4;corner++){const cx=corner===0||corner===3?w-r:-w+r,cy=corner<2?h-r:-h+r;for(let i=0;i<n;i++){const angle=(corner*90+i*90/(n-1))*Math.PI/180;points.push([cx+r*Math.cos(angle),cy+r*Math.sin(angle)])}}}
    else {if(operation==='star'&&p.innerRadius>=p.radius)throw new Error('Inner radius must be smaller than outer radius');const n=operation==='polygon'?p.sides:operation==='star'?p.points*2:p.samples;for(let i=0;i<n;i++){const a=2*Math.PI*i/n+(p.angle||0)*Math.PI/180,r=operation==='star'&&i%2?p.innerRadius:p.radius;points.push([Math.cos(a)*(operation==='ellipse'?p.radiusX:r),Math.sin(a)*(operation==='ellipse'?p.radiusY:r)])}}
    points=points.filter((point,i)=>!i||Math.hypot(point[0]-points[i-1][0],point[1]-points[i-1][1])>1e-8);if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-8)points.pop();points=points.map(([x,y])=>[x+p.center[0],y+p.center[1]]);points.push([...points[0]]);return[{points}];
  }
  const copies=operation==='array-grid'?p.columns*p.rows:operation==='array-polar'?p.count:1;
  if(copies>64||source.reduce((n,path)=>n+path.points.length,0)*copies>300000)throw new Error('Component output exceeds the point/copy budget');
  if(operation==='scale-nu'&&p.factors.some(v=>v<=0||v>100))throw new Error('Scale factors must be greater than 0 and at most 100');
  if(operation==='array-grid'&&p.spacing[2]!==0)throw new Error('Rectangular arrays use XY spacing; use Linear array for Z offsets');
  return source.flatMap(path=>Array.from({length:copies},(_,index)=>{
    let points;
    if(operation==='resample')points=resample(path.points,p.samples);
    else if(operation==='reverse')points=[...path.points].reverse().map(point=>[...point]);
    else if(operation==='seam'){const open=path.points.slice(0,-1),shift=Math.floor(p.fraction*open.length)%open.length;points=[...open.slice(shift),...open.slice(0,shift)].map(point=>[...point]);points.push([...points[0]])}
    else points=path.points.map(point=>{
      if(operation==='rotate')return rotate(point,p.angle*Math.PI/180,p.pivot);
      if(operation==='scale'||operation==='scale-nu')return point.map((v,axis)=>p.pivot[axis]+(v-p.pivot[axis])*(operation==='scale'?p.factor:p.factors[axis]));
      if(operation==='mirror-x'||operation==='mirror-y'){const axis=operation==='mirror-x'?0:1;return point.map((v,a)=>a===axis?2*p.pivot[a]-v:v)}
      if(operation==='array-grid')return point.map((v,axis)=>v+(axis===0?index%p.columns*p.spacing[0]:axis===1?Math.floor(index/p.columns)*p.spacing[1]:0));
      if(operation==='array-polar')return rotate(point.map((v,axis)=>v+(axis===0?p.radius:0)),p.angle*index/p.count*Math.PI/180,p.pivot);
      return [...point];
    });return{...path,points};
  }));
}
