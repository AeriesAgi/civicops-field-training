// Attach to the CLI-owned Chromium; never launch another browser or inject procedure state.
// Keeps local capture/read requests alive across the host's long scheduling pauses.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const base = `/tmp/.iwsdk-browser-${process.getuid()}`;
const appPort = process.env.VR_PORT ?? '5191';
let session;
// IWSDK keys its managed profile by the canonical workspace path.
const workspaceKey = createHash('sha256').update(process.cwd()).digest('hex');
for (const dir of [workspaceKey]) {
  const file = join(base, dir, 'DevToolsActivePort');
  if (!existsSync(file)) continue;
  const [port] = readFileSync(file, 'utf8').trim().split('\n');
  let browser;
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${Number(port)}`, { timeout: 5000 }); }
  catch { continue; }
  const page = browser.contexts().flatMap(c => c.pages()).find(p => { try { return new URL(p.url()).port === appPort; } catch { return false; } });
  if (!page) continue;
  page.setDefaultTimeout(90_000); page.setDefaultNavigationTimeout(90_000);
  const frame = page.frames().find(f => f !== page.mainFrame() && (() => { try { return new URL(f.url()).port === appPort && !f.url().includes('__iwsdk_editor'); } catch { return false; } })());
  const cdp = await page.context().newCDPSession(page);
  session = { page, frame, cdp, context: page.context() }; break;
}
if (!session) throw new Error('No CLI-owned application on the dedicated VR port');
const request = await import(pathToFileURL(resolve(process.argv[2])).href);
try {
  const result = await request.default(session);
  process.stdout.write(JSON.stringify({ ok: true, data: { result } }), () => process.exit(0));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: { message: error.message } }), () => process.exit(1));
}
