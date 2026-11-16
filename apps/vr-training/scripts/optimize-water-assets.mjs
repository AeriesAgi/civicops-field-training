/** Original Culltron water art: external 512px KTX2 colour, shared hero maps, meshopt. */
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRTextureBasisu} from '@gltf-transform/extensions';
import {dedup, weld, prune, meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
const build='artifacts/hero-build';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
await fs.mkdir('public/models',{recursive:true});await fs.mkdir('public/textures',{recursive:true});
const only=process.argv.slice(2);
const names=only.length?only:['road','valve-key','barrier','sign'];
if(!only.length)execFileSync('toktx',['--t2','--genmipmap','--encode','etc1s','--qlevel','225','--assign_oetf','srgb','public/textures/water-color.ktx2',`${build}/water-color.png`],{stdio:'ignore'});
function externalize(bytes){
 const jsonSize=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jsonSize)),binary=bytes.subarray(28+jsonSize);
 const imageViews=new Set((j.images??[]).map(i=>i.bufferView));
 const ranges=[...imageViews].map(i=>{const v=j.bufferViews[i];return [v.byteOffset??0,(v.byteOffset??0)+Math.ceil(v.byteLength/4)*4];}).sort((a,b)=>a[0]-b[0]);
 const shift=offset=>offset-ranges.reduce((n,[,b],i)=>n+(offset>=b?ranges[i][1]-ranges[i][0]:0),0);
 let cursor=0;const slices=[];
 for(const [a,b] of ranges){slices.push(binary.subarray(cursor,a));cursor=b;}
 slices.push(binary.subarray(cursor));let bin=Buffer.concat(slices);
 const ids=new Map();j.bufferViews=j.bufferViews.filter((v,i)=>{if(imageViews.has(i))return false;ids.set(i,ids.size);return true;});
 for(const v of j.bufferViews){
  if((v.buffer??0)===0&&v.byteOffset!==undefined)v.byteOffset=shift(v.byteOffset);
  const x=v.extensions?.EXT_meshopt_compression;if(x?.buffer===0)x.byteOffset=shift(x.byteOffset??0);
 }
 for(const a of j.accessors??[])if(a.bufferView!==undefined)a.bufferView=ids.get(a.bufferView);
 for(const img of j.images??[]){delete img.bufferView;img.uri=`../textures/${img.name}.ktx2`;img.mimeType='image/ktx2';}
 // The managed IWSDK editor needs genuine decoder-free fallback bytes, as hero assets do.
 for(const v of j.bufferViews){
  const x=v.extensions?.EXT_meshopt_compression;if(!x)continue;
  const decoded=new Uint8Array(x.count*x.byteStride);
  MeshoptDecoder.decodeGltfBuffer(decoded,x.count,x.byteStride,bin.subarray(x.byteOffset,x.byteOffset+x.byteLength),x.mode,x.filter??'NONE');
  const padded=Buffer.alloc(Math.ceil(decoded.byteLength/4)*4);padded.set(decoded);
  v.buffer=0;v.byteOffset=bin.length;v.byteLength=decoded.byteLength;bin=Buffer.concat([bin,padded]);
 }
 j.buffers=j.buffers.slice(0,1);j.extensionsRequired=j.extensionsRequired.filter(n=>n!=='EXT_meshopt_compression');j.buffers[0].byteLength=bin.length;
 let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bh,bin]);
}
const reports=[];
for(const name of names){
 const doc=await io.read(`${build}/water-${name}.glb`);doc.createExtension(KHRTextureBasisu).setRequired(true);
 for(const m of doc.getRoot().listMaterials())m.setName('CivicOpsWaterAtlas');
 for(const t of doc.getRoot().listTextures()){
  const id=t.getName().toLowerCase(),map=id.includes('normal')?'hero-normal':id.includes('orm')?'hero-orm':'water-color';
  t.setImage(await fs.readFile(`public/textures/${map}.ktx2`)).setMimeType('image/ktx2').setName(map);
 }
 await doc.transform(dedup(),weld(),prune({keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'high'}));
 const bytes=externalize(Buffer.from(await io.writeBinary(doc)));await fs.writeFile(`public/models/water-${name}.glb`,bytes);
 const meshes=doc.getRoot().listMeshes(),tris=meshes.reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
 reports.push({name:`water-${name}`,bytes:bytes.length,triangles:tris,primitives:meshes.reduce((n,m)=>n+m.listPrimitives().length,0)});console.log(JSON.stringify(reports.at(-1)));
}
await fs.writeFile(`${build}/water-packaging-report.json`,JSON.stringify(reports,null,2));
