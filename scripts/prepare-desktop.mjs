import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'desktop-dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ['index.html', 'app.js', 'style.css', 'desktop-client.js']) {
  await copyFile(path.join(root, file), path.join(out, file));
}

for (const dir of ['samples', 'vendor']) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}

console.log(`Prepared Pathloom desktop assets in ${out}`);
