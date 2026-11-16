// CC0/CC-BY used content only. No downloaded source files are copied to public/.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS,KHRTextureBasisu} from '@gltf-transform/extensions';
import {mergeDocuments,dedup,weld,prune,unpartition,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
function fallback(raw){
 const n=raw.readUInt32LE(12),j=JSON.parse(raw.subarray(20,20+n));let bin=raw.subarray(28+n);
 for(const v of j.bufferViews??[]){const x=v.extensions?.EXT_meshopt_compression;if(!x)continue;const a=new Uint8Array(x.count*x.byteStride);MeshoptDecoder.decodeGltfBuffer(a,x.count,x.byteStride,bin.subarray(x.byteOffset,x.byteOffset+x.byteLength),x.mode,x.filter??'NONE');const b=Buffer.alloc(Math.ceil(a.length/4)*4);b.set(a);v.buffer=0;v.byteOffset=bin.length;v.byteLength=a.length;bin=Buffer.concat([bin,b]);}
 j.buffers=[{byteLength:bin.length}];j.extensionsRequired=(j.extensionsRequired??[]).filter(x=>x!=='EXT_meshopt_compression');
 let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,json,b,bin]);
}
for(const [output,inputs,size] of [['room-rehearsal-kit',['cone','cabinet'],512],['emulator-depot-room',['capture-room'],2048],['roads-cone',['cone'],512]]){
 const doc=new Document();for(const name of inputs)mergeDocuments(doc,await io.read(`artifacts/room-build/${name}.glb`));
 if(output==='roads-cone')for(const m of doc.getRoot().listMaterials())m.setName('LicensedRoadConePBR');
 const scene=doc.getRoot().listScenes()[0];for(const other of doc.getRoot().listScenes().slice(1)){for(const child of other.listChildren())scene.addChild(child);other.dispose();}
 await doc.transform(dedup(),weld(),prune({keepLeaves:true}),unpartition());
 let index=0;for(const tex of doc.getRoot().listTextures()){
  const normal=doc.getRoot().listMaterials().some(m=>m.getNormalTexture()===tex),color=doc.getRoot().listMaterials().some(m=>m.getBaseColorTexture()===tex||m.getEmissiveTexture()===tex);
  const stem=`artifacts/room-build/${output}-${index++}`;
  await sharp(Buffer.from(tex.getImage())).resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).png().toFile(stem+'.png');
  execFileSync('toktx',['--t2','--genmipmap','--encode',normal?'uastc':'etc1s',...(normal?['--uastc_quality','2']:['--qlevel','180']),'--assign_oetf',color?'srgb':'linear',stem+'.ktx2',stem+'.png'],{stdio:'ignore'});
  tex.setImage(await fs.readFile(stem+'.ktx2')).setMimeType('image/ktx2').setName(`${output}-${index}`);
 }
 doc.createExtension(KHRTextureBasisu).setRequired(true);await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high'}));
 const bytes=fallback(Buffer.from(await io.writeBinary(doc)));await fs.writeFile(`public/models/${output}.glb`,bytes);
 console.log(JSON.stringify({output,bytes:bytes.length,materials:doc.getRoot().listMaterials().length,triangles:doc.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((b,p)=>b+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0),textures:index}));
}
