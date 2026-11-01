import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.pathloom-runtime','python',process.platform==='win32'?'Scripts/python.exe':'bin/python');
execFileSync(python,['-B',path.join(root,'scripts','verify-cad-runtime.py')],{stdio:'inherit'});
