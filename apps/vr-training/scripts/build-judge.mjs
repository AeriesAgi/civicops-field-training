/**
 * `npm run build:judge`: a production build with the IWER Quest 3 emulator bundled, so judges
 * without a headset can play in desktop Chrome or Edge. iwsdk.config.json is restored
 * byte-for-byte afterwards; the normal `npm run build` never includes the emulator.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeManifestText } from './judge-manifest.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(project, 'iwsdk.config.json');
const original = readFileSync(configPath, 'utf8');
if (JSON.parse(original).dev?.emulator?.injectOnBuild) {
  console.error('iwsdk.config.json already sets injectOnBuild; restore it from git before a judge build.');
  process.exit(1);
}
const restore = () => writeFileSync(configPath, original, 'utf8');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { restore(); process.exit(130); });

let status = 1;
try {
  writeFileSync(configPath, judgeManifestText(original), 'utf8');
  const vite = path.join(project, 'node_modules', 'vite', 'bin', 'vite.js');
  status = spawnSync(process.execPath, [vite, 'build', '--mode', 'judge', ...process.argv.slice(2)], { cwd: project, stdio: 'inherit' }).status ?? 1;
} finally {
  restore();
}
process.exit(status);
