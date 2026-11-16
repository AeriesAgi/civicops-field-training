/** Report the emitted local payload and conservative Quest texture allocations. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { init, parse } from 'es-module-lexer';
import { hdrTextureEstimate, payloadInventory } from './build-report-metrics.mjs';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
async function walk(dir) {
  return (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(async entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }))).flat();
}
const files = (await walk(dist)).sort();
const records = await Promise.all(files.map(async full => {
  const bytes = await fs.readFile(full);
  return { file: path.relative(dist, full), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const runtimeFiles = records.filter(r => !r.file.endsWith('AGENTS.md'));
const jsFiles = runtimeFiles.filter(r => r.file.startsWith('assets/') && r.file.endsWith('.js'));
await init;
const imports = new Map();
for (const record of jsFiles) {
  const source = await fs.readFile(path.join(dist, record.file), 'utf8');
  imports.set(record.file, parse(source)[0].map(item => ({
    specifier: item.specifier ?? item.n,
    dynamic: item.type ? item.type === 'dynamic' : item.d >= 0,
  })).filter(item => item.specifier));
}
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1].replace(/^\.\//, ''));
const resolveImport = (owner, specifier) => specifier.startsWith('.') ? path.normalize(path.join(path.dirname(owner), specifier)) : null;
function closure(seeds) {
  const result = new Set(seeds), queue = [...seeds];
  while (queue.length) {
    const file = queue.shift();
    for (const item of imports.get(file) ?? []) {
      const target = resolveImport(file, item.specifier);
      if (!item.dynamic && target && !result.has(target)) { result.add(target); queue.push(target); }
    }
  }
  return result;
}
const startupJS = closure([...entries, ...jsFiles.filter(r => /\/(index-|world-initializer-|inter-)/.test(r.file)).map(r => r.file)]);
const total = list => ({ bytes: list.reduce((a,r) => a + r.bytes, 0), gzipBytes: list.reduce((a,r) => a + r.gzipBytes, 0) });
const inventory = payloadInventory(records, startupJS);
const assetFiles = inventory.publicAssets;
const initialFiles = inventory.initial;
function mipBlocks(width, height, levels, bytesPerBlock) {
  let sum = 0;
  for (let level = 0; level < levels; level++) sum += Math.ceil(Math.max(1,width >> level)/4) * Math.ceil(Math.max(1,height >> level)/4) * bytesPerBlock;
  return sum;
}
const textures = [];
const seenTextureFiles = new Set();
for (const record of runtimeFiles.filter(r => r.file.endsWith('.glb'))) {
  const glb = await fs.readFile(path.join(dist, record.file));
  const jsonSize = glb.readUInt32LE(12), asset = JSON.parse(glb.subarray(20,20+jsonSize).toString());
  const binaryStart = 20 + jsonSize + 8;
  for (const image of asset.images ?? []) {
    if (image.mimeType !== 'image/ktx2') continue;
    let ktx;
    if (image.uri) {
      const external = path.normalize(path.join(path.dirname(record.file), image.uri));
      if (seenTextureFiles.has(external)) continue;
      seenTextureFiles.add(external);
      ktx = await fs.readFile(path.join(dist, external));
    } else {
      const view = asset.bufferViews[image.bufferView], offset = binaryStart + (view.byteOffset ?? 0);
      ktx = glb.subarray(offset, offset + view.byteLength);
    }
    const width = ktx.readUInt32LE(20), height = ktx.readUInt32LE(24), levels = ktx.readUInt32LE(40);
    const dfd = ktx.readUInt32LE(48), model = ktx[dfd + 12], descriptorSize = ktx.readUInt16LE(dfd + 10);
    let alpha = false;
    for (let sample = dfd + 28; sample < dfd + 4 + descriptorSize; sample += 16) if ((ktx[sample + 3] & 15) === 15) alpha = true;
    const etc1s = model === 163;
    textures.push({ file:record.file, name:image.name ?? '', width,height,levels,encoding:etc1s?'ETC1S':'UASTC',alpha,
      questBytes:mipBlocks(width,height,levels,etc1s && !alpha?8:16),
      uniformASTCBytes:mipBlocks(width,height,levels,16) });
  }
}
const fontRecord = jsFiles.find(r => /\/inter-/.test(r.file));
const fonts = fontRecord ? (await import(pathToFileURL(path.join(dist,fontRecord.file)).href)).inter : {};
const availableWeights = {light:300,medium:500,'semi-bold':600,bold:700};
const requestedWeights = new Set([400]);
for (const record of assetFiles.filter(r => r.file.endsWith('.uikitml'))) {
  const markup = await fs.readFile(path.join(dist,record.file),'utf8');
  for (const match of markup.matchAll(/font-weight\s*:\s*(\d+)/g)) requestedWeights.add(Number(match[1]));
}
const fontNames = new Set([...requestedWeights].map(weight => Object.keys(fonts).reduce((a,b) =>
  Math.abs(availableWeights[b]-weight) < Math.abs(availableWeights[a]-weight)?b:a)));
function rgbaMipBytes(width,height) {
  let total = 0;
  while (width > 1 || height > 1) { total += width * height * 4; width = Math.max(1,width>>1); height = Math.max(1,height>>1); }
  return total + 4;
}
const fontAtlases = [...fontNames].map(name => ({name,width:fonts[name].common.scaleW,height:fonts[name].common.scaleH,
  bytes:rgbaMipBytes(fonts[name].common.scaleW,fonts[name].common.scaleH)}));
const hdrs = await Promise.all(runtimeFiles.filter(r => r.file.endsWith('.hdr')).map(async record =>
  hdrTextureEstimate(record.file, await fs.readFile(path.join(dist, record.file)))));
const ibl = {
  sourceBytes: hdrs.reduce((sum, hdr) => sum + hdr.sourceBytes, 0),
  pmremTargetBytes: hdrs.reduce((sum, hdr) => sum + hdr.pmremTargetBytes, 0),
  retainedPingPongBytes: hdrs.reduce((sum, hdr) => sum + hdr.retainedPingPongBytes, 0),
  environments: hdrs,
};
const ktxQuestBytes = textures.reduce((a,t)=>a+t.questBytes,0);
const fontBytes = fontAtlases.reduce((a,t)=>a+t.bytes,0);
const iblBytes = ibl.sourceBytes+ibl.pmremTargetBytes+ibl.retainedPingPongBytes;
// Two 25-joint hand skeletons use 12x12 RGBA32F textures. The SDK's
// hidden shared 512px cursor map is conservatively retained in the estimate.
const handBoneBytes = 2*12*12*4*4;
const retainedCursorBytes = rgbaMipBytes(512,512);
const ghostBoneBytes = 8*8*4*4; // Original 15-bone instructor demo, conservatively retained.
const auxiliaryBytes = handBoneBytes+retainedCursorBytes+ghostBoneBytes;
let observedCheckout = { revision: null, changedFiles: null };
try {
  observedCheckout = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim(),
    changedFiles: execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).trim(),
  };
} catch { /* Source archives may not include Git metadata. Artifact hashes remain authoritative. */ }
const report = {
  generatedAt:new Date().toISOString(),
  provenance: {
    observedCheckout,
    note: 'Checkout observed when reporting, not proof of which source produced dist. Run immediately after a fresh build. Sorted file/hash pairs identify the exact measured artifact.',
    distManifestSha256: createHash('sha256').update(JSON.stringify(records.map(({ file, sha256 }) => ({ file, sha256 })))).digest('hex'),
    files: records,
  },
  assumptions:{
    payload:'Packaged inventory bounds, not measured cold transfers. Initial upper bound conservatively includes every index/app chunk plus the world initializer, font module, all public models, decoders, HDR, UI and scene JSON, and every non-JS Vite output (including WASM, CSS and fonts). Entire-dist upper bound also includes all unused dynamic/worker chunks.',
    gzip:'Theoretical individual gzip level9; raw bytes are authoritative independent of server compression.',
    questTextures:'Quest ASTC+ETC2 support assumed: Three KTX2Loader chooses ETC2 RGB4bpp for alpha-free ETC1S and ASTC4x4 8bpp for UASTC; ETC1S alpha maps use ETC2 RGBA8bpp. All mip levels counted.',
    fonts:'UIKit default weight400 plus authored font-weight values select cached Inter atlases. RGBA8 allocation including full mip chain counted.',
    ibl:'Every packaged HDR environment counts its RGBA16F source, PMREM packed output and retained generator ping-pong target. This conservative sum does not assert that every environment is allocated simultaneously.',
    scope:'Packaged static texture estimate, not measured device allocation. Dynamic Assist canvases, animated-crew bone textures and browser swapchain/depth buffers are excluded. The custom solid gloves reuse SDK MIT skeleton/mesh geometry. Two tracked-hand RGBA32F bone textures, the 8x8 instructor ghost bone texture and the conservatively retained hidden SDK cursor atlas are counted. Upstream XR hand model downloads occur at immersive entry and are not hosted dist assets; ASSETS lists their additional transfer bytes.',
  },
  initialLocalPayload:{...total(initialFiles),limitBytes:15_000_000,passes:total(initialFiles).bytes<=15_000_000},
  entireRuntimeDistUpperBound:{...total(runtimeFiles),limitBytes:15_000_000,passes:total(runtimeFiles).bytes<=15_000_000},
  categories:{startupJS:total(jsFiles.filter(r=>startupJS.has(r.file))),fontModule:fontRecord??null,
    additionalDynamicAndWorkers:total(jsFiles.filter(r=>!startupJS.has(r.file))),emittedNonJS:total(inventory.emittedAssets),publicRuntime:total(assetFiles)},
  initialFiles:initialFiles.map(r=>r.file),
  deferredChunks:jsFiles.filter(r=>!startupJS.has(r.file)),
  importGraph:Object.fromEntries([...imports].map(([file,list])=>[file,list])),
  textures:{ktxQuestBytes,fontBytes,iblBytes,handBoneBytes,ghostBoneBytes,retainedCursorBytes,totalQuestBytes:ktxQuestBytes+fontBytes+iblBytes+auxiliaryBytes,
    uniformASTCUpperBoundBytes:textures.reduce((a,t)=>a+t.uniformASTCBytes,0)+fontBytes+iblBytes+auxiliaryBytes,
    limitBytes:16_000_000,passes:ktxQuestBytes+fontBytes+iblBytes+auxiliaryBytes<=16_000_000,fontAtlases,ibl,ktx:textures},
};
await fs.mkdir(path.join(project,'artifacts'),{recursive:true});
await fs.writeFile(path.join(project,'artifacts/build-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({initialLocalPayload:report.initialLocalPayload,entireRuntimeDistUpperBound:report.entireRuntimeDistUpperBound,
  textures:{ktxQuestBytes,fontBytes,iblBytes,totalQuestBytes:report.textures.totalQuestBytes,uniformASTCUpperBoundBytes:report.textures.uniformASTCUpperBoundBytes,passes:report.textures.passes},
  output:'artifacts/build-report.json'},null,2));
