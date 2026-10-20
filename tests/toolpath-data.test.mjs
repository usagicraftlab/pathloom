import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToolpath,toolSlots,outputToolOptions,validatePrintSettings,printableBounds} from '../toolpath-data.js';
import {validateProject,LAYOUT_DEFAULTS} from '../pathloom-project.js';
import {estimatePrintTime,estimateFilamentUsage} from '../print-time.js';

const settings={printWidth:.6,printHeight:.6,printSpeed:35,travelSpeed:180,nozzleTemperature:210,bedTemperature:60,fanSpeed:50};
const volume={bedWidth:250,bedDepth:210,maxHeight:220};
const tool={name:'Blue',color:'#123456',erate:1,speedOverride:null,outputTool:'0'};
function project(){return {format:'pathloom',version:1,sources:[{id:'S1',label:'Imported',filename:'test.toolpath',paths:[{order:0,tool:0,points:[[0,0,.6],[1,0,.6]]}],tools:[['0',{...tool}]]}],instances:[['S1-1',{source:'S1',x:0,y:0,rotation:0,order:1}]],settings:{printer:'Prusa MK4S',...settings},profile:{...volume,filamentDiameter:1.75,startGcode:'G90',toolChangeGcode:'T{to_tool}',endGcode:'M84'},view:{layer:1,showInputs:false}}}

test('imported negative Z is blocked at the same final export boundary as all other sources',()=>{
  const source={...normalizeToolpath({paths:[{points:[[0,0,-1],[1,0,-1]],tool:0}]}),label:'Negative',tools:new Map([['0',tool]])};
  const instances=[['one',{source:'S1',x:0,y:0,rotation:0}]];
  assert.throws(()=>printableBounds(instances,new Map([['S1',source]]),volume),/below the bed/);
  // Custom non-planar printing remains supported; no accidental 2D-only rule.
  source.paths[0].points=[[0,0,.2],[1,0,.4]];
  assert.equal(printableBounds(instances,new Map([['S1',source]]),volume).maxZ,.4);
});

test('file import rejects empty and coercible nonnumeric points while graph disconnections stay representable',()=>{
  assert.throws(()=>normalizeToolpath({paths:[]}),/no paths/);
  assert.deepEqual(normalizeToolpath({paths:[]},'empty',{allowEmpty:true}).paths,[]);
  for(const bad of [null,false,'',NaN,Infinity])assert.throws(()=>normalizeToolpath({paths:[{points:[[bad,0,0],[1,0,0]]}]}),/XYZ/);
  const result=normalizeToolpath({paths:[{points:[['1',0,.6],[2,0,.6]]},{points:[[0,0,.2],[1,0,.2]]}]});
  assert.deepEqual(result.paths.map(p=>p.layer),[2,1]);assert.equal(result.paths[0].points[0][0],1);
});

test('project and output share fan and physical-tool validation',()=>{
  const p=project();p.settings.fanSpeed=150;
  assert.throws(()=>validateProject(p),/Fan speed/);assert.throws(()=>validatePrintSettings(p.settings),/Fan speed/);
  p.settings.fanSpeed=100;p.sources[0].tools[0][1].outputTool='bad-tool';assert.throws(()=>validateProject(p),/Output tool/);
  p.sources[0].tools[0][1].outputTool='255';assert.doesNotThrow(()=>validateProject(p));
  p.sources[0].tools[0][1].outputTool='256';assert.throws(()=>validateProject(p),/Output tool/);
});

test('sparse logical tool IDs do not allocate empty rows or physical-tool menus',()=>{
  const tools=new Map([['999999999',tool]]);assert.equal(toolSlots(tools).length,1);
  assert.equal(outputToolOptions('999999999').length,6);
  assert.equal(toolSlots(new Map([['2',tool]])).length,3);
});

test('new view and layout state round-trips while older projects remain readable',()=>{
  const p=project();assert.doesNotThrow(()=>validateProject(p));
  p.layout={...LAYOUT_DEFAULTS,autoArrangeEnabled:false,gridSpacingX:99};Object.assign(p.view,{projection:'orthographic',axis:'top',zoom:2,orthoHeight:100,selectedInstance:'S1-1',previewInstance:'ALL'});
  assert.deepEqual(validateProject(p),p);p.view.selectedInstance='missing';assert.throws(()=>validateProject(p),/selection/);p.view.selectedInstance='S1-1';p.layout.gridRows=0;assert.throws(()=>validateProject(p),/layout/);
});

test('cached distance estimates agree with transformed geometry for rotated repeated objects',()=>{
  const points=[[0,0,.6],[3,0,.6],[3,4,.6]],paths=[{points,placement:{x:10,y:20,rotation:90},tool:'0',speed:10,erate:1}];
  const transformed=points.map(([x,y,z])=>[10-y,20+x,z]);
  assert.deepEqual(estimatePrintTime([{paths,previousMaxZ:0}],100,220),estimatePrintTime([{paths:[{...paths[0],points:transformed,placement:undefined}],previousMaxZ:0}],100,220));
  assert.deepEqual(estimateFilamentUsage([{paths}],.6,.3,1.75),estimateFilamentUsage([{paths:[{...paths[0],points:transformed}]}],.6,.3,1.75));
});
