// A layer boundary is one preview step: last point -> next layer's start.
export function advancePreview(layer,point,delta,counts){
  if(!counts.length)return {layer:1,point:0};
  let index=Math.max(0,Math.min(counts.length-1,layer-1)),value=Math.max(0,Math.min(counts[index],point));
  for(let left=Math.abs(delta);left>0;){const direction=Math.sign(delta),available=direction>0?counts[index]-value:value,step=Math.min(left,available);value+=direction*step;left-=step;if(!left)break;const next=index+direction;if(next<0||next>=counts.length)break;index=next;value=direction>0?0:counts[index];left--;}
  return {layer:index+1,point:value};
}
export function curveDirection(points){
  const start=points[0];if(!start)return null;
  for(let i=1;i<points.length;i++){const vector=points[i].map((value,axis)=>value-start[axis]),length=Math.hypot(...vector);if(length>1e-8)return {start,direction:vector.map(value=>value/length),length:6};}
  return null;
}
