/** Original Culltron art: one shared KTX2 atlas, meshopt geometry, exact anchors. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRTextureBasisu} from '@gltf-transform/extensions';
import {dedup, weld, prune, meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
const build='artifacts/hero-build';
await fs.mkdir('public/textures',{recursive:true});
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const maps=['color','orm','normal'];
for (const name of ['timber-color','timber-normal']) {
  try { await fs.access(`${build}/hero-${name}.png`); maps.push(name); } catch {}
}
for(const map of maps){
 const source=path.join(build,`hero-${map}.png`), output=`public/textures/hero-${map}.ktx2`;
 const args=map.endsWith('normal')?['--encode','uastc','--uastc_quality','2','--zcmp','10','--assign_oetf','linear']:['--encode','etc1s','--qlevel','220','--assign_oetf',map.endsWith('color')?'srgb':'linear'];
 execFileSync('toktx',['--t2','--genmipmap',...args,output,source],{stdio:'ignore'});
}
/** Remove embedded atlas copies while retaining compressed buffer offsets. */
function externalize(bytes){
 const jsonSize=bytes.readUInt32LE(12), j=JSON.parse(bytes.subarray(20,20+jsonSize)), binary=bytes.subarray(28+jsonSize);
 const imageViews=new Set((j.images??[]).map(i=>i.bufferView));
 const ranges=[...imageViews].map(i=>{const v=j.bufferViews[i];return [v.byteOffset??0,(v.byteOffset??0)+Math.ceil(v.byteLength/4)*4];}).sort((a,b)=>a[0]-b[0]);
 const shift=offset=>offset-ranges.reduce((n,[a,b])=>n+(offset>=b?b-a:0),0);
 let cursor=0; const slices=[];
 for(const [a,b] of ranges){slices.push(binary.subarray(cursor,a));cursor=b;}
 slices.push(binary.subarray(cursor));let bin=Buffer.concat(slices);
 const ids=new Map();j.bufferViews=j.bufferViews.filter((v,i)=>{if(imageViews.has(i))return false;ids.set(i,ids.size);return true;});
 for(const v of j.bufferViews){
  if((v.buffer??0)===0 && v.byteOffset!==undefined)v.byteOffset=shift(v.byteOffset);
  const x=v.extensions?.EXT_meshopt_compression;
  if(x?.buffer===0)x.byteOffset=shift(x.byteOffset??0);
 }
 for(const a of j.accessors??[])if(a.bufferView!==undefined)a.bufferView=ids.get(a.bufferView);
 for(const image of j.images??[]){
  const name=(image.name??'').toLowerCase();
  const map=name.includes('timber')?(name.includes('normal')?'timber-normal':'timber-color'):name.includes('normal')?'normal':name.includes('orm')?'orm':'color';
  delete image.bufferView;image.uri=`../textures/hero-${map}.ktx2`;image.mimeType='image/ktx2';
 }
 // IWSDK's editor has no meshopt decoder. Supply a genuine standard glTF
 // fallback; the application uses the compressed views through its decoder.
 // glTF Transform's synthetic fallback buffer contains no actual byte data.
 for(const view of j.bufferViews){
  const x=view.extensions?.EXT_meshopt_compression;
  if(!x)continue;
  const decoded=new Uint8Array(x.count*x.byteStride);
  MeshoptDecoder.decodeGltfBuffer(decoded,x.count,x.byteStride,
    bin.subarray(x.byteOffset,x.byteOffset+x.byteLength),x.mode,x.filter??'NONE');
  const padded=Buffer.alloc(Math.ceil(decoded.byteLength/4)*4);padded.set(decoded);
  view.buffer=0;view.byteOffset=bin.length;view.byteLength=decoded.byteLength;
  bin=Buffer.concat([bin,padded]);
 }
 j.buffers=j.buffers.slice(0,1);
 j.extensionsRequired=j.extensionsRequired.filter(name=>name!=='EXT_meshopt_compression');
 j.buffers[0].byteLength=bin.length;
 let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,bh,bin]);
}
const names=['distribution-board','breaker','padlock','danger-tag','voltage-tester','proving-unit','terminals','lock-zone','tag-zone','workbench','workshop-hero'];
const reports=[];
for(const name of names){
 const doc=await io.read(`${build}/${name}.glb`);
 doc.createExtension(KHRTextureBasisu).setRequired(true);
 for(const material of doc.getRoot().listMaterials())if(material.getName().startsWith('CivicOpsHeroAtlas'))material.setName('CivicOpsHeroAtlas');
 for(const texture of doc.getRoot().listTextures()){
  const id=texture.getName().toLowerCase();const map=id.includes('timber')?(id.includes('normal')?'timber-normal':'timber-color'):id.includes('normal')?'normal':id.includes('orm')?'orm':'color';
  texture.setImage(await fs.readFile(`public/textures/hero-${map}.ktx2`)).setMimeType('image/ktx2').setName(`hero-${map}`);
 }
 await doc.transform(dedup(),weld(),prune({keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'high'}));
 const prepared=await io.writeBinary(doc);const bytes=externalize(Buffer.from(prepared));
 await fs.writeFile(`public/models/hero-${name}.glb`,bytes);
 const root=doc.getRoot();const tris=root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
 reports.push({name,bytes:bytes.length,triangles:tris,primitives:root.listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0)});
 console.log(JSON.stringify(reports.at(-1)));
}
await fs.writeFile(`${build}/packaging-report.json`,JSON.stringify(reports,null,2));
