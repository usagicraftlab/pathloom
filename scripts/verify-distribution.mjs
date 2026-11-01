import {createHash} from 'node:crypto';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const runtime=await readJson('distribution/runtime-manifest.json');
const artifacts=await readJson('distribution/artifact-manifest.json');
if(runtime.python.version!=='3.12'||runtime.packages['cadquery-ocp']!=='7.8.1.1.post1'||runtime.packages.OCP!=='7.8.1.1'||runtime.packages.vtk!=='9.3.1')throw new Error('CAD runtime manifest versions are not the release pins');
const lock=await readFile(path.join(root,runtime.installer.requirements),'utf8');
for(const pin of ['cadquery-ocp==7.8.1.1.post1','vtk==9.3.1'])if(!lock.includes(pin))throw new Error(`Runtime lock is missing ${pin}`);
for(const artifact of artifacts.artifacts){
  const bytes=await readFile(path.join(root,artifact.path));
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==artifact.sha256)throw new Error(`${artifact.path} SHA-256 mismatch: ${actual}`);
}
for(const rel of ['THIRD_PARTY_NOTICES.md','distribution/SOURCE_AND_REBUILD.md','distribution/runtime-manifest.json','distribution/artifact-manifest.json','distribution/cad-runtime-requirements.lock','package-lock.json','src-tauri/Cargo.lock'])await access(path.join(root,rel));
console.log(`Distribution inventory verified: ${artifacts.artifacts.length} hashed artifacts, locked CAD runtime ${runtime.packages.OCP}`);
