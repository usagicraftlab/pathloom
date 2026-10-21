import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
// Browser ES modules live at the root; server/build code lives in scripts/ or
// legacy/. Both development and packaging use this single discovery function.
export async function frontendFiles() {
  const entries = await readdir(frontendRoot, {withFileTypes: true});
  return ['index.html', 'style.css', 'THIRD_PARTY_NOTICES.md', 'samples/ukigara-clock.toolpath', ...entries.filter(e => e.isFile() && e.name.endsWith('.js')).map(e => e.name)].sort();
}
export const frontendDirectories = ['vendor','cad'];
