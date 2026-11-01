import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

test('distribution inventory hashes artifacts and pins the separately provisioned runtime',()=>{
  const output=execFileSync(process.execPath,['scripts/verify-distribution.mjs'],{encoding:'utf8'});
  assert.match(output,/Distribution inventory verified/);
});

test('desktop asset discovery ships notices, source/rebuild material and runtime lock',async()=>{
  const {frontendFiles,frontendDirectories}=await import('../scripts/frontend-assets.mjs');
  assert.ok((await frontendFiles()).includes('THIRD_PARTY_NOTICES.md'));
  assert.ok(frontendDirectories.includes('distribution'));
  const guide=await readFile(new URL('../distribution/SOURCE_AND_REBUILD.md',import.meta.url),'utf8');
  assert.match(guide,/c2148e54b456b571238d35cac037d304053d64b2/);
  assert.match(guide,/d2abb6d844231cb8f29be6894440874a4700e4a5/);
});
