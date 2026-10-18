import {validatePauseLayers} from './gcode-metadata.js';
import {validateEditableShape} from './step-import.js';
import {printOutputNodes,numberParameters} from './cad-pipeline.js';
import {validateDefinition} from './cad-kernel.js';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export const BASIC_FIELDS=['printWidth','printHeight','printSpeed','travelSpeed','nozzleTemperature','bedTemperature','fanSpeed'];
export function validateProject(input){
  if(!input||input.format!=='pathloom'||input.version!==1)throw new Error('Unsupported .pathloom project');
  const project=structuredClone(input);
  if(project.importedShapes!==undefined&&(!Array.isArray(project.importedShapes)||project.importedShapes.length>100))throw new Error('Invalid imported shapes');
  let importedVertexCount=0;
  const shapeIds=new Set();
  for(const shape of project.importedShapes||[]){
    if(shape.brep!==undefined)validateEditableShape(shape);
    if(!shape||typeof shape.id!=='string'||!shape.id||shapeIds.has(shape.id)||typeof shape.name!=='string'||typeof shape.visible!=='boolean'||shape.sliceLayerHeight!==undefined&&(!finite(shape.sliceLayerHeight)||shape.sliceLayerHeight<.05||shape.sliceLayerHeight>10)||shape.faces!==undefined&&(!Array.isArray(shape.faces)||shape.faces.length>200000||shape.faces.some((face,index)=>!face||face.index!==index||!finite(face.area)||face.area<0||typeof face.planar!=='boolean'||!Array.isArray(face.bounds)||face.bounds.length!==2||face.bounds.some(point=>!Array.isArray(point)||point.length!==3||!point.every(finite))))||!Array.isArray(shape.meshes)||!shape.meshes.length)throw new Error('Invalid imported shape');shapeIds.add(shape.id);
    if(shape.assetId!==undefined&&(!/^[a-zA-Z0-9-]{1,96}$/.test(shape.assetId)||!Number.isInteger(shape.brepIndex)||shape.brepIndex<0||!shape.faces?.length))throw new Error('Invalid editable CAD asset reference');
    for(const mesh of shape.meshes){
      if(!mesh||typeof mesh.name!=='string'||!Array.isArray(mesh.positions)||mesh.positions.length<9||mesh.positions.length%3||!mesh.positions.every(finite)||!Array.isArray(mesh.indices)||!mesh.indices.length||!mesh.indices.every(index=>Number.isInteger(index)&&index>=0&&index<mesh.positions.length/3)||!Array.isArray(mesh.color)||mesh.color.length!==3||!mesh.color.every(value=>finite(value)&&value>=0&&value<=1)||!Array.isArray(mesh.normals)||mesh.normals.length!==0&&mesh.normals.length!==mesh.positions.length||!mesh.normals.every(finite))throw new Error('Invalid imported shape mesh');
      if(mesh.brepFaces!==undefined&&(!Array.isArray(mesh.brepFaces)||mesh.brepFaces.length>100000||mesh.brepFaces.some(face=>!face||!Number.isInteger(face.first)||!Number.isInteger(face.last)||face.first<0||face.last<face.first||face.last>=mesh.indices.length/3)))throw new Error('Invalid imported face ranges');
      if(mesh.triangleFaces!==undefined&&(!Array.isArray(mesh.triangleFaces)||mesh.triangleFaces.length!==mesh.indices.length/3||mesh.triangleFaces.some(index=>!Number.isInteger(index)||index<0||index>=(shape.faces?.length||0))))throw new Error('Invalid imported triangle-to-face map');
      importedVertexCount+=mesh.positions.length/3;if(importedVertexCount>1000000)throw new Error('Imported shape vertex limit exceeded');
    }
  }
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
  for(const source of project.sources){
    if(source.generatorRef!==undefined){const owner=project.sources.find(s=>s.id===source.generatorRef);if(!owner?.generator||owner.generatorRef!==undefined||source.generator||owner.id===source.id||!source.generatorGroup||owner.generatorGroup!==source.generatorGroup)throw new Error('Invalid shared generator reference');source.generator=owner.generator;delete source.generatorRef}
    if(source.generatorGroup!==undefined&&(typeof source.generatorGroup!=='string'||!source.generatorGroup||source.generatorGroup.length>200||!source.generator||!printOutputNodes(source.generator).some(o=>o.id===source.generatorOutputId)))throw new Error('Invalid generator object');
  }
  const groups=new Map();for(const source of project.sources)if(source.generatorGroup){const owner=groups.get(source.generatorGroup);if(owner){if(JSON.stringify(owner)!==JSON.stringify(source.generator))throw new Error('Conflicting shared generators');source.generator=owner}else groups.set(source.generatorGroup,source.generator)}
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
    const instance=entry[1];if(!instance||!ids.has(instance.source)||![instance.x,instance.y,instance.rotation,instance.order].every(finite))throw new Error('Invalid placement');validatePauseLayers(instance.pauseLayers);
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

// Serialize a shared processing graph once; object placements/settings remain independent.
export function compactProjectGenerators(project){const owners=new Map();return {...project,sources:project.sources.map(source=>{if(!source.generatorGroup||!source.generator)return source;const owner=owners.get(source.generatorGroup);if(!owner){owners.set(source.generatorGroup,source.id);return source}const next={...source,generatorRef:owner};delete next.generator;return next})}}
