import {execFileSync} from 'node:child_process';
import {mkdir,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'.pathloom-runtime');
await mkdir(runtime,{recursive:true});
let uv=path.join(runtime,process.platform==='win32'?'uv.exe':'uv');
try{await access(uv)}catch{
  try{execFileSync('uv',['--version'],{stdio:'ignore'});uv='uv'}catch{
    const targets={darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'},linux:{x64:'x86_64-unknown-linux-gnu',arm64:'aarch64-unknown-linux-gnu'}};
    const target=targets[process.platform]?.[process.arch];if(!target)throw new Error('Install uv, then run npm run cad:setup again');
    const response=await fetch(`https://github.com/astral-sh/uv/releases/download/0.13.1/uv-${target}.tar.gz`);if(!response.ok)throw new Error('Unable to download the CAD runtime installer');
    const archive=path.join(runtime,'uv.tar.gz');await writeFile(archive,Buffer.from(await response.arrayBuffer()));
    execFileSync('tar',['-xzf',archive,'-C',runtime,'--strip-components=1'],{stdio:'inherit'});
  }
}
const env=path.join(runtime,'python'),python=path.join(env,process.platform==='win32'?'Scripts/python.exe':'bin/python');
try{await access(python)}catch{execFileSync(uv,['venv','--python','3.12',env],{stdio:'inherit'})}
execFileSync(uv,['pip','install','--python',python,'cadquery-ocp==7.8.1.1'],{stdio:'inherit'});
console.log('Editable CAD runtime ready:',python);
