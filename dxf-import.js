const finite = value => Number.isFinite(Number(value));
const xy = point => point && finite(point.x) && finite(point.y) ? [Number(point.x), Number(point.y)] : null;
const sampleArc = (center, radius, start, end, count = 48) => {
  const span = end - start;
  return Array.from({length: Math.max(2, Math.ceil(Math.abs(span) / (Math.PI * 2) * count) + 1)}, (_, i) => {
    const angle = start + span * i / (Math.max(2, Math.ceil(Math.abs(span) / (Math.PI * 2) * count)));
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  });
};
function bulgeSegment(a, b, bulge) {
  if (!bulge) return [a, b];
  const dx=b[0]-a[0],dy=b[1]-a[1],chord=Math.hypot(dx,dy),theta=4*Math.atan(bulge);
  if (!chord || Math.abs(theta)<1e-8) return [a,b];
  const radius=chord/(2*Math.sin(Math.abs(theta)/2)),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],offset=chord/(2*Math.tan(theta/2));
  const center=[mid[0]-dy/chord*offset,mid[1]+dx/chord*offset],start=Math.atan2(a[1]-center[1],a[0]-center[0]);
  return sampleArc(center,radius,start,start+theta,Math.min(96,Math.max(8,Math.ceil(Math.abs(theta)*12))));
}
function polyline(vertices, closed=false) {
  const points=[];
  const count=vertices.length;
  for(let i=0;i<count;i++){
    const a=xy(vertices[i]),next=vertices[(i+1)%count];if(!a)continue;points.push(a);
    if((i<count-1||closed)&&next){const segment=bulgeSegment(a,xy(next),Number(vertices[i].bulge)||0);points.push(...segment.slice(1,-1))}
  }
  return {points,closed};
}
export function dxfCurves(document) {
  const curves=[];
  const add=(entity,points,closed=false)=>{if(points.length>=2)curves.push({name:entity.layer?`${entity.layer} · ${entity.type}`:entity.type,layer:entity.layer||'DXF',points,closed})};
  for(const e of document.entities||[]){
    switch(e.type){
      case 'LINE': add(e,(e.vertices||[]).map(xy).filter(Boolean)); break;
      case 'LWPOLYLINE': case 'POLYLINE': {const r=polyline(e.vertices||[],!!(e.shape||e.closed));add(e,r.points,r.closed);break}
      case 'CIRCLE': {const c=xy(e.center),r=Number(e.radius);if(c&&r>0)add(e,sampleArc(c,r,0,Math.PI*2,64),true);break}
      case 'ARC': {const c=xy(e.center),r=Number(e.radius),a=Number(e.startAngle)*Math.PI/180,b=Number(e.endAngle)*Math.PI/180;if(c&&r>0&&finite(a)&&finite(b))add(e,sampleArc(c,r,a,b+(b<=a?Math.PI*2:0),48));break}
      case 'ELLIPSE': {const c=xy(e.center),major=xy(e.majorAxisEndPoint),ratio=Number(e.axisRatio);if(c&&major&&ratio>0){const a=Number(e.startAngle)||0,b=Number.isFinite(e.endAngle)?e.endAngle:Math.PI*2,len=Math.hypot(...major),rot=Math.atan2(major[1],major[0]),points=Array.from({length:65},(_,i)=>{const t=a+(b-a)*i/64,x=len*Math.cos(t),y=len*ratio*Math.sin(t);return[c[0]+x*Math.cos(rot)-y*Math.sin(rot),c[1]+x*Math.sin(rot)+y*Math.cos(rot)]});add(e,points,Math.abs(b-a)>=Math.PI*2-1e-6)}break}
      case 'SPLINE': {const pts=(e.controlPoints||e.fitPoints||[]).map(xy).filter(Boolean);if(pts.length>1)add(e,pts);break}
      default: break;
    }
    if(curves.length>500)throw new Error('DXF contains more than 500 supported curves');
  }
  if(!curves.length)throw new Error('No supported 2D curves found in this DXF');
  if(curves.length>128)throw new Error('DXF contains more than 128 supported curves; split the file or import fewer layers');
  const all=curves.flatMap(curve=>curve.points),minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1])),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  if(maxX-minX>1000||maxY-minY>1000)throw new Error('DXF extents exceed the current 1,000 mm input range');
  return curves.map(curve=>{const points=curve.points.map(([x,y])=>[x-cx,y-cy]);if(curve.closed&&points.length>2&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-7)points.pop();if(points.length>256)throw new Error(`${curve.name} has more than 256 vertices; simplify this curve before importing`);return {...curve,points}});
}
