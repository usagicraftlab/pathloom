import { cp, mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'desktop-dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ['index.html', 'app.js', 'print-time.js', 'print-intro.js', 'gcode-metadata.js', 'cad-kernel.js', 'cad-pipeline.js', 'cad-components.js', 'cad-library.js', 'cad-input-ui.js', 'cad-graph.js', 'cad-node-editor.js', 'cad-worker.js', 'cad-ui.js', 'cad-gizmo.js', 'cad-face-selection.js', 'cad-chat.js', 'pathloom-project.js', 'dxf-import.js', 'step-import.js', 'gh-brep-live.js', 'cad-ai-context.js', 'cad-code-runtime.js', 'cad-worker-client.js', 'step-geometry.js', 'step-slice-worker.js', 'style.css', 'desktop-client.js']) {
  await copyFile(path.join(root, file), path.join(out, file));
}

for (const dir of ['samples', 'vendor']) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}

const orbitControlsPath = path.join(out, 'vendor', 'three', 'OrbitControls.js');
const orbitControls = await readFile(orbitControlsPath, 'utf8');
await writeFile(
  orbitControlsPath,
  orbitControls.replace("from 'three';", "from './three.module.js';"),
  'utf8'
);

console.log(`Prepared Pathloom desktop assets in ${out}`);
