import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,access,readdir} from 'node:fs/promises';
import {frontendFiles,frontendRoot,frontendDirectories} from '../scripts/frontend-assets.mjs';

test('discovered frontend assets contain all local module and worker dependencies',async()=>{
  const files=await frontendFiles(),shipped=new Set(files);
  const included=name=>shipped.has(name)||frontendDirectories.some(dir=>name.startsWith(dir+'/'));
  const cadFiles=await readdir(path.join(frontendRoot,'cad'),{recursive:true});
  for(const filename of [...files.filter(file=>file.endsWith('.js')),...cadFiles.filter(file=>file.endsWith('.js')).map(file=>'cad/'+file)]){
    const source=await readFile(path.join(frontendRoot,filename),'utf8');
    for(const [,reference]of source.matchAll(/(?:from\s*|import\s*\(|new Worker\s*\(|new URL\s*\()\s*['"](\.\.?\/[^'"$]+\.js)['"]/g)){
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(filename),reference));
      assert.ok(included(resolved),`${filename} depends on unshipped ${resolved}`);await access(path.join(frontendRoot,resolved));
    }
  }
  assert.ok(shipped.has('samples/ukigara-clock.toolpath'));
  assert.ok(!files.some(name=>name.includes('bridge-client')||name.includes('prusalink-client')));
});
