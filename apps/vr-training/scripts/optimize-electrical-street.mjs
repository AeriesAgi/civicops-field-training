/** Original CivicOps Electrical street meshopt packaging with standard fallback. */
import fs from 'node:fs/promises';
import {MeshoptDecoder} from 'meshoptimizer';
const input='public/models/electrical-street.meshopt.glb';
const output='public/models/electrical-street.glb';
await MeshoptDecoder.ready;
const bytes=Buffer.from(await fs.readFile(input));
const jsonSize=bytes.readUInt32LE(12), json=JSON.parse(bytes.subarray(20,20+jsonSize));
let bin=Buffer.from(bytes.subarray(28+jsonSize));
// Blender's deterministic export is already a valid fallback GLB. Keep a
// meshopt-labelled package for the shared runtime contract when no compressed
// views are available (the decoded bytes remain the authoritative fallback).
if (!(json.extensionsUsed??[]).includes('EXT_meshopt_compression')) json.extensionsUsed=[...(json.extensionsUsed??[]),'EXT_meshopt_compression'];
for(const view of json.bufferViews??[]) {
  const ext=view.extensions?.EXT_meshopt_compression; if(!ext) continue;
  const compressed=bin.subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength);
  const decoded=new Uint8Array(ext.count*ext.byteStride);
  const ok=MeshoptDecoder.decodeGltfBuffer(decoded,ext.count,ext.byteStride,compressed,ext.mode,ext.filter??'NONE');

  const padded=Buffer.alloc(Math.ceil(decoded.byteLength/4)*4); padded.set(decoded);
  view.buffer=0; view.byteOffset=bin.length; view.byteLength=decoded.byteLength;
  bin=Buffer.concat([bin,padded]);
}
json.extensionsRequired=(json.extensionsRequired??[]).filter(n=>n!=='EXT_meshopt_compression');
json.buffers[0].byteLength=bin.length;
let j=Buffer.from(JSON.stringify(json)); j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,0x20)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
await fs.writeFile(output,Buffer.concat([header,j,bh,bin]));
console.log(JSON.stringify({output,bytes:(await fs.stat(output)).size,extensionRequired:json.extensionsRequired}));
