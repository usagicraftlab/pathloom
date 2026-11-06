export const commandGroupDefinitions=[
  {id:'sketch',label:'スケッチ'},
  {id:'curve-create',label:'カーブを編集'},
  {id:'solid-create',label:'立体をつくる'},
  {id:'solid-edit',label:'立体を加工する'},
  {id:'surface-create',label:'サーフェスをつくる'},
  {id:'surface-edit',label:'サーフェスを加工する'},
  {id:'transform',label:'移動・回転・ミラーなど'},
];

const surfaceCreationOperations=new Set(['surface.plane','surface.planarRegion','surface.sweep1','surface.loft']);
const solidEditingOperations=new Set(['solid.union','solid.difference','solid.intersection','solid.fillet','solid.chamfer','solid.shell','solid.split']);
const iconMarkup={
  point:'<circle cx="12" cy="12" r="2.5"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/>',
  line:'<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  polyline:'<path d="m4 18 5-11 6 9 5-10"/><circle cx="4" cy="18" r="1.5"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="16" r="1.5"/>',
  rectangle:'<rect x="5" y="6" width="14" height="12" rx=".5"/>',polygon:'<path d="m12 3 8 6-3 10H7L4 9z"/>',circle:'<circle cx="12" cy="12" r="8"/>',
  arc:'<path d="M5 18a9 9 0 0 1 14-11"/><path d="m16 5 3 2-1 3"/>',ellipse:'<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
  spline:'<path d="M4 18c4-13 12 13 16-12"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="6" r="1.5"/>',
  prism:'<path d="m5 8 7-4 7 4v9l-7 4-7-4zM5 8l7 4 7-4m-7 4v9"/>',revolve:'<path d="M6 17a8 8 0 1 1 12 0"/><path d="M12 3v18m-2-2 2 2 2-2"/>',
  sweep:'<path d="M4 18c4-11 12-11 16-1"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/>',loft:'<path d="M5 7c4-3 10-3 14 0M5 17c4 3 10 3 14 0M5 7v10m14-10v10M5 7c4 3 10 3 14 0M5 17c4-3 10-3 14 0"/>',
  join:'<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',explode:'<path d="M4 8 9 5v6zm11-3 5 3-5 3zM4 16l5-3v6zm11-3 5 3-5 3z"/>',reverse:'<path d="M5 8h13l-3-3m4 11H6l3 3"/>',
  plane:'<path d="m3 8 12-4 6 3-12 4zM9 11v9l12-4V7m-12 13-6-3V8"/>',sphere:'<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c4 4 4 12 0 16m0-16c-4 4-4 12 0 16"/>',
  cylinder:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 18c0 4 14 4 14 0"/>',cone:'<path d="m12 4-8 15c0 3 16 3 16 0zM4 19c0 3 16 3 16 0"/>',
  torus:'<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/>',boolean:'<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  shell:'<path d="M5 7 12 4l7 3v10l-7 3-7-3zM5 7l7 3 7-3m-7 3v4m0 6v-4"/>',move:'<path d="M12 3v18m-3-3 3 3 3-3M9 6l3-3 3 3M3 12h18m-3-3 3 3-3 3M6 9l-3 3 3 3"/>',
  rotate:'<path d="M5 9a7 7 0 1 1 1 7M5 4v5h5"/>',scale:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5M8 16l8-8"/>',mirror:'<path d="M12 3v18M9 7 5 12l4 5zm6 0 4 5-4 5z"/>',
  offset:'<rect x="7" y="7" width="12" height="12"/><path d="M4 17V4h13"/>',region:'<path d="M4 6h16v12H4zM9 10h6v4H9z"/>',ellipsoid:'<ellipse cx="12" cy="12" rx="8.5" ry="5"/><path d="M12 4c4 4 4 12 0 16m0-16c-4 4-4 12 0 16"/>',
  cap:'<path d="M4 9c0-4 16-4 16 0v7c0 4-16 4-16 0zM4 9c0 4 16 4 16 0"/><path d="M8 9h8"/>',assemble:'<path d="m4 13 5 5 11-12M4 6l4 4m5 7 3 3"/>',
  fillet:'<path d="M5 19V6h6a8 8 0 0 1 8 8v5z"/>',chamfer:'<path d="M5 19V6h9l5 5v8z"/>',section:'<path d="m4 8 8-4 8 4v9l-8 4-8-4zM3 14h18"/>',
  trim:'<path d="M4 5 20 19M4 19 20 5M7 8l-3-3m13 14 3 3"/>',extend:'<path d="M4 12h15m-4-4 4 4-4 4M4 6v12"/>',blend:'<path d="M4 17c4 0 4-10 8-10s4 10 8 10"/>',
  rebuild:'<path d="M4 17 9 7l6 8 5-9"/><circle cx="4" cy="17" r="1.5"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="20" cy="6" r="1.5"/>',
  seam:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16m-3-2 3 2 3-2"/>',poles:'<path d="m4 17 5-10 6 8 5-9"/><circle cx="4" cy="17" r="2"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="15" r="2"/><circle cx="20" cy="6" r="2"/>',
  surface:'<path d="M4 7c4-3 12-3 16 0v10c-4 3-12 3-16 0zM4 7c4 3 12 3 16 0M4 17c4-3 12-3 16 0M12 9v6"/>',surfaceOffset:'<path d="M5 7c4-3 10-3 14 0v7c-4 3-10 3-14 0zM8 11c4-3 10-3 14 0v7c-4 3-10 3-14 0"/>',
};
const iconFamilies={
  'point.create':'point','curve.line':'line','curve.polyline':'polyline','curve.rectangle':'rectangle','curve.polygon':'polygon','curve.circle':'circle','curve.arc':'arc','curve.ellipse':'ellipse','curve.nurbs':'spline','curve.interpolate':'spline','curve.explode':'explode','curve.reverse':'reverse','curve.extractBoundary':'surface','curve.offset':'offset','curve.join':'join','curve.split':'section','curve.trim':'trim','curve.extend':'extend','curve.fillet':'fillet','curve.chamfer':'chamfer','curve.blend':'blend','curve.rebuild':'rebuild','curve.seam':'seam','curve.editPoles':'poles','surface.plane':'plane','surface.planarRegion':'region','surface.sweep1':'sweep','surface.loft':'loft','surface.join':'join','surface.explode':'explode','surface.reverse':'reverse','surface.corners':'surface','surface.edges':'surface','surface.untrim':'surface','surface.offset':'surfaceOffset','surface.split':'section','shape.extrude':'prism','shape.revolve':'revolve','shape.cylinder':'cylinder','shape.cone':'cone','shape.pipe':'sweep','shape.cap':'cap','solid.box':'prism','solid.sphere':'sphere','solid.torus':'torus','solid.ellipsoid':'ellipsoid','solid.union':'boolean','solid.difference':'boolean','solid.intersection':'boolean','solid.assemble':'assemble','solid.fillet':'fillet','solid.chamfer':'chamfer','solid.shell':'shell','solid.split':'section','shape.section':'section',
};

export function commandGroup(command){
  const operationId=command.baseOperation.id;
  if(/^C(?:0[1-9]|1[0-2])$/.test(command.id))return 'sketch';
  if(operationId==='shape.transform')return 'transform';
  if(operationId==='shape.extrude'&&command.displayName==='Extrude Surface')return 'surface-create';
  if(solidEditingOperations.has(operationId)||operationId==='shape.cap')return operationId==='shape.cap'?'surface-edit':'solid-edit';
  if(surfaceCreationOperations.has(operationId))return 'surface-create';
  if(operationId.startsWith('surface.'))return 'surface-edit';
  if(operationId.startsWith('solid.')||['shape.extrude','shape.revolve','shape.cylinder','shape.cone','shape.pipe'].includes(operationId))return 'solid-create';
  return 'curve-create';
}

export function createCommandIcon(command){
  const operationId=command.baseOperation.id;
  const family=operationId==='shape.transform'?command.defaults.mode||'move':iconFamilies[operationId]||'polyline';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
  icon.innerHTML=iconMarkup[family]||iconMarkup.polyline;
  return icon;
}
