import {numberParameters} from './cad-pipeline.js';
import {validateDefinition} from './cad-kernel.js';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export const BASIC_FIELDS=['printWidth','printHeight','printSpeed','travelSpeed','nozzleTemperature','bedTemperature','fanSpeed'];
export function validateProject(input){
  if(!input||input.format!=='pathloom'||input.version!==1)throw new Error('Unsupported .pathloom project');
  const project=structuredClone(input);
  if(!Array.isArray(project.sources)||!Array.isArray(project.instances)||project.sources.length>500||project.instances.length>1000)throw new Error('Invalid objects');
  const ids=new Set();let pointCount=0;
  for(const source of project.sources){
    if(typeof source.id!=='string'||!source.id||ids.has(source.id)||typeof source.filename!=='string'||typeof source.label!=='string')throw new Error('Invalid source identity');ids.add(source.id);
    if(!Array.isArray(source.paths)||!Array.isArray(source.tools))throw new Error('Invalid source paths/settings');
    for(const path of source.paths){
      if(!finite(path.order)||!['string','number'].includes(typeof path.tool)||!Array.isArray(path.points)||path.points.length<2)throw new Error('Invalid project path');
      pointCount+=path.points.length;
      if(pointCount>2000000)throw new Error('Project point limit exceeded');
      for(const xyz of path.points)if(!Array.isArray(xyz)||xyz.length!==3||!xyz.every(finite))throw new Error('Invalid project XYZ');
    }
    const toolIds=new Set();
    for(const entry of source.tools){
      if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||toolIds.has(entry[0]))throw new Error('Invalid tool settings');toolIds.add(entry[0]);
      const tool=entry[1];
      if(!tool||!/^#[0-9a-f]{6}$/i.test(tool.color)||typeof tool.name!=='string'||!finite(tool.erate)||tool.erate<0||(tool.speedOverride!==null&&(!finite(tool.speedOverride)||tool.speedOverride<=0)))throw new Error('Invalid tool values');
    }
    if(source.paths.some(path=>!toolIds.has(String(path.tool))))throw new Error('Missing tool settings');
    if(source.generator)source.generator=validateDefinition(source.generator);
  }
  if(project.printLinks!==undefined){
    if(!project.printLinks||typeof project.printLinks!=='object'||Array.isArray(project.printLinks))throw new Error('Invalid print links');
    for(const[target,binding]of Object.entries(project.printLinks)){
      const source=project.sources.find(source=>source.id===binding?.sourceId),parameter=numberParameters(source?.generator).find(param=>param.key===binding?.key);
      if(!['printWidth','printHeight'].includes(target)||!parameter||!finite(parameter.value)||parameter.value<=0)throw new Error('Invalid linked print parameter');
      if(!project.settings)throw new Error('Missing print settings');project.settings[target]=parameter.value;
    }
  }
  const instanceIds=new Set();
  for(const entry of project.instances){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||instanceIds.has(entry[0]))throw new Error('Invalid instance');instanceIds.add(entry[0]);
    const instance=entry[1];if(!instance||!ids.has(instance.source)||![instance.x,instance.y,instance.rotation,instance.order].every(finite))throw new Error('Invalid placement');
  }
  if(!project.settings||!['Prusa MK4S','Prusa CoreOne'].includes(project.settings.printer))throw new Error('Invalid printer');
  for(const id of BASIC_FIELDS){const value=project.settings[id];if(!finite(value)||value<0||(['printWidth','printHeight','printSpeed','travelSpeed'].includes(id)&&value===0))throw new Error(`Invalid ${id}`)}
  const profile=project.profile;
  if(!profile||!['filamentDiameter','bedWidth','bedDepth','maxHeight'].every(key=>finite(profile[key])&&profile[key]>0)||!['startGcode','toolChangeGcode','endGcode'].every(key=>typeof profile[key]==='string'))throw new Error('Invalid printer profile');
  if(!project.view||!finite(project.view.layer)||typeof project.view.showInputs!=='boolean')throw new Error('Invalid view settings');
  if(project.cad?.previewStepId!=null){const source=project.sources.find(source=>source.id===project.cad.sourceId);if(typeof project.cad.previewStepId!=='string'||!source?.generator?.steps?.some(step=>step.id===project.cad.previewStepId))throw new Error('Invalid processing preview stage')}
  if(project.cad?.mode!==undefined&&!['generate','parameters','output'].includes(project.cad.mode))throw new Error('Invalid workspace mode');
  return project;
}
