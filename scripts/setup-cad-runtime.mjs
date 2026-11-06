import {execFileSync} from 'node:child_process';
import {mkdir,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'.pathloom-runtime');
await mkdir(runtime,{recursive:true});
let uv=path.join(runtime,process.platform==='win32'?'uv.exe':'uv');
let bundledUvReady=false;
try{
  await access(uv);
  execFileSync(uv,['--version'],{stdio:'ignore'});
  bundledUvReady=true;
}catch{}
if(!bundledUvReady){
  try{execFileSync('uv',['--version'],{stdio:'ignore'});uv='uv'}catch{
    const targets={darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'},linux:{x64:'x86_64-unknown-linux-gnu',arm64:'aarch64-unknown-linux-gnu'}};
    const target=targets[process.platform]?.[process.arch];if(!target)throw new Error('Install uv, then run npm run cad:setup again');
    const response=await fetch(`https://github.com/astral-sh/uv/releases/download/0.13.1/uv-${target}.tar.gz`);if(!response.ok)throw new Error('Unable to download the CAD runtime installer');
    const archive=path.join(runtime,'uv.tar.gz');await writeFile(archive,Buffer.from(await response.arrayBuffer()));
    execFileSync('tar',['-xzf',archive,'-C',runtime,'--strip-components=1'],{stdio:'inherit'});
  }
}
const env=path.join(runtime,'python'),python=path.join(env,process.platform==='win32'?'Scripts/python.exe':'bin/python');
let pythonReady=false;
try{
  await access(python);
  execFileSync(python,['--version'],{stdio:'ignore'});
  pythonReady=true;
}catch{}
if(!pythonReady){
  // A copied runtime can leave uv-managed Python binaries for the wrong CPU
  // architecture. Reinstall the interpreter selected for this host before
  // recreating the virtual environment.
  const pythonTarget=process.platform==='darwin'
    ?`cpython-3.12-macos-${process.arch==='arm64'?'aarch64':'x86_64'}-none`
    :'3.12';
  execFileSync(uv,['python','install','--reinstall',pythonTarget],{stdio:'inherit'});
  execFileSync(uv,['venv','--clear','--python',pythonTarget,env],{stdio:'inherit'});
}
const requirements=path.join(root,'distribution','cad-runtime-requirements.lock');
execFileSync(uv,['pip','sync','--python',python,'--require-hashes',requirements],{stdio:'inherit'});
execFileSync(python,['-B',path.join(root,'scripts','verify-cad-runtime.py')],{stdio:'inherit'});
console.log('Verified CAD runtime ready:',python);
