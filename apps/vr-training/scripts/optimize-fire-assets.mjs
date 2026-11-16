/** Original Culltron fire/EMS art: shared roads KTX2 colour, meshopt, no new texture file. */
import fs from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const build = 'artifacts/hero-build';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await fs.mkdir('public/models', { recursive: true });

function externalize(bytes) {
  const jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonSize));
  const binary = bytes.subarray(28 + jsonSize);
  const imageViews = new Set((json.images ?? []).map((image) => image.bufferView));
  const ranges = [...imageViews].map((index) => {
    const view = json.bufferViews[index];
    return [view.byteOffset ?? 0, (view.byteOffset ?? 0) + Math.ceil(view.byteLength / 4) * 4];
  }).sort((a, b) => a[0] - b[0]);
  const shift = (offset) => offset - ranges.reduce((sum, [, end], index) => sum + (offset >= end ? ranges[index][1] - ranges[index][0] : 0), 0);
  let cursor = 0;
  const slices = [];
  for (const [start, end] of ranges) {
    slices.push(binary.subarray(cursor, start));
    cursor = end;
  }
  slices.push(binary.subarray(cursor));
  let bin = Buffer.concat(slices);
  const ids = new Map();
  json.bufferViews = json.bufferViews.filter((view, index) => {
    if (imageViews.has(index)) return false;
    ids.set(index, ids.size);
    return true;
  });
  for (const view of json.bufferViews) {
    if ((view.buffer ?? 0) === 0 && view.byteOffset !== undefined) view.byteOffset = shift(view.byteOffset);
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed?.buffer === 0) compressed.byteOffset = shift(compressed.byteOffset ?? 0);
  }
  for (const accessor of json.accessors ?? []) if (accessor.bufferView !== undefined) accessor.bufferView = ids.get(accessor.bufferView);
  for (const image of json.images ?? []) {
    delete image.bufferView;
    image.uri = `../textures/${image.name}.ktx2`;
    image.mimeType = 'image/ktx2';
  }
  for (const view of json.bufferViews) {
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (!compressed) continue;
    const decoded = new Uint8Array(compressed.count * compressed.byteStride);
    MeshoptDecoder.decodeGltfBuffer(decoded, compressed.count, compressed.byteStride, bin.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength), compressed.mode, compressed.filter ?? 'NONE');
    const padded = Buffer.alloc(Math.ceil(decoded.byteLength / 4) * 4);
    padded.set(decoded);
    view.buffer = 0;
    view.byteOffset = bin.length;
    view.byteLength = decoded.byteLength;
    bin = Buffer.concat([bin, padded]);
  }
  json.buffers = json.buffers.slice(0, 1);
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((name) => name !== 'EXT_meshopt_compression');
  json.buffers[0].byteLength = bin.length;
  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + bin.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(bin.length);
  chunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBytes, chunk, bin]);
}

const names = ['street', 'engine', 'ambulance', 'flare', 'mast', 'exclusion', 'casualty-1', 'casualty-2', 'casualty-3', 'casualty-4', 'tag-minor', 'tag-delayed', 'tag-immediate', 'tag-expectant'];
const reports = [];
for (const name of names) {
  const doc = await io.read(`${build}/fire-${name}.glb`);
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  for (const material of doc.getRoot().listMaterials()) material.setName('CivicOpsRoadsAtlas');
  for (const texture of doc.getRoot().listTextures()) {
    const id = texture.getName().toLowerCase();
    const map = id.includes('normal') ? 'hero-normal' : id.includes('orm') ? 'hero-orm' : 'roads-color';
    texture.setImage(await fs.readFile(`public/textures/${map}.ktx2`)).setMimeType('image/ktx2').setName(map);
  }
  await doc.transform(dedup(), weld(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const bytes = externalize(Buffer.from(await io.writeBinary(doc)));
  await fs.writeFile(`public/models/fire-${name}.glb`, bytes);
  const meshes = doc.getRoot().listMeshes();
  const triangles = meshes.reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((count, primitive) => count + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);
  reports.push({ name: `fire-${name}`, bytes: bytes.length, triangles, primitives: meshes.reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0) });
  console.log(JSON.stringify(reports.at(-1)));
}
await fs.writeFile(`${build}/fire-packaging-report.json`, JSON.stringify(reports, null, 2));
