// Planar curve primitives and reusable geometry transformations.
const number=(min,max,integer=false)=>({min,max,integer});
export const COMPONENT_GROUPS=['Curve','Transform','Pattern','Toolpath','Utility','Custom'];
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
};
const rotate=(point,angle,pivot)=>{const c=Math.cos(angle),s=Math.sin(angle),x=point[0]-pivot[0],y=point[1]-pivot[1];return[pivot[0]+x*c-y*s,pivot[1]+x*s+y*c,...point.slice(2)]};
function resample(points,count){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,a)=>v-points[i-1][a])));const total=lengths.at(-1);if(total<1e-6)throw new Error('Cannot resample a collapsed curve');let segment=1;const result=[];for(let i=0;i<count;i++){const distance=total*i/count;while(segment<lengths.length-1&&lengths[segment]<distance)segment++;const t=(distance-lengths[segment-1])/(lengths[segment]-lengths[segment-1]||1);result.push(points[segment-1].map((v,a)=>v+(points[segment][a]-v)*t))}result.push([...result[0]]);return result}
export function executeBasicComponent(operation,p,source){
  const spec=BASIC_COMPONENTS[operation];if(!spec)return null;
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
