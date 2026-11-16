/** Shared external KTX2 PBR trims; genuine meshopt with editor fallback bytes. */
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const selected=process.argv.slice(2);
const names=['electrical-street','water-road','roads-street','fire-street','street-actors'];
if(selected.some(name=>!names.includes(name)))throw new Error('Unknown street asset');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for (const family of selected.length?[]:['asphalt','trim']) for(const map of ['color','normal','orm']) {
 const id=`street-${family}-${map}`;
 execFileSync('toktx',['--threads','4','--t2','--genmipmap','--encode',map==='normal'?'uastc':'etc1s',...(map==='normal'?['--uastc_quality','2']:['--qlevel','210']),'--assign_oetf',map==='color'?'srgb':'linear',`public/textures/${id}.ktx2`,`artifacts/street-build/${id}.png`],{stdio:'ignore'});
}
for (const kind of ['electrical','water','roads','fire'].filter(kind=>!selected.length||selected.includes(kind==='water'?'water-road':`${kind}-street`))) {
 const id=`street-${kind}-shadows`;
 execFileSync('toktx',['--threads','4','--t2','--genmipmap','--encode','etc1s','--qlevel','180','--assign_oetf','srgb',`public/textures/${id}.ktx2`,`artifacts/street-build/${id}.png`],{stdio:'ignore'});
}
function packageExternal(bytes){
 const size=bytes.readUInt32LE(12), j=JSON.parse(bytes.subarray(20,20+size));let bin=bytes.subarray(28+size);
 const imageViews=new Set((j.images??[]).map(i=>i.bufferView));
 const ranges=[...imageViews].map(i=>{const v=j.bufferViews[i];return [v.byteOffset??0,(v.byteOffset??0)+Math.ceil(v.byteLength/4)*4];}).sort((a,b)=>a[0]-b[0]);
 const shift=offset=>offset-ranges.reduce((sum,[a,b])=>sum+(offset>=b?b-a:0),0);
 let cursor=0;const pieces=[];
 for(const [a,b] of ranges){pieces.push(bin.subarray(cursor,a));cursor=b;}pieces.push(bin.subarray(cursor));bin=Buffer.concat(pieces);
 const ids=new Map();j.bufferViews=j.bufferViews.filter((v,i)=>{if(imageViews.has(i))return false;ids.set(i,ids.size);return true;});
 for(const v of j.bufferViews){if((v.buffer??0)===0&&v.byteOffset!==undefined)v.byteOffset=shift(v.byteOffset);const x=v.extensions?.EXT_meshopt_compression;if(x?.buffer===0)x.byteOffset=shift(x.byteOffset??0);}
 for(const a of j.accessors??[])if(a.bufferView!==undefined)a.bufferView=ids.get(a.bufferView);
 // Preserve fallback bytes for the managed editor without making it decode meshopt.
 for(const v of j.bufferViews??[]){const x=v.extensions?.EXT_meshopt_compression;if(!x)continue;
  const decoded=new Uint8Array(x.count*x.byteStride);MeshoptDecoder.decodeGltfBuffer(decoded,x.count,x.byteStride,bin.subarray(x.byteOffset,x.byteOffset+x.byteLength),x.mode,x.filter??'NONE');
  const padded=Buffer.alloc(Math.ceil(decoded.byteLength/4)*4);padded.set(decoded);v.buffer=0;v.byteOffset=bin.length;v.byteLength=decoded.byteLength;bin=Buffer.concat([bin,padded]);
 }
 for(const image of j.images??[]){delete image.bufferView;image.uri=`../textures/${image.name}.ktx2`;image.mimeType='image/ktx2';}
 j.buffers=j.buffers.slice(0,1);j.buffers[0].byteLength=bin.length;j.extensionsRequired=(j.extensionsRequired??[]).filter(x=>x!=='EXT_meshopt_compression');
 let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bh,bin]);
}
const report=[];
for(const name of selected.length?selected:names) {
 const file=name==='street-actors'?`artifacts/street-build/${name}.glb`:name==='electrical-street'?`public/models/${name}.glb`:`artifacts/hero-build/${name}.glb`;
 const doc=await io.read(file);
 for(const m of doc.getRoot().listMaterials()) {
  m.setName(m.getName().replace(/\.\d+$/, ''));
  if(m.getName()==='street-trim')m.setAlphaMode('MASK').setAlphaCutoff(.18);
  if(m.getName()==='StreetGroundShadowBake') {
   m.setAlphaMode('BLEND').setExtension('KHR_materials_unlit',doc.createExtension(KHRMaterialsUnlit).createUnlit());
   // Blender exports the bake through an emission node; unlit uses base colour.
   m.setBaseColorTexture(m.getEmissiveTexture() ?? m.getBaseColorTexture()).setBaseColorFactor([1,1,1,1]);
   m.setEmissiveTexture(null).setEmissiveFactor([0,0,0]);
   const info=m.getBaseColorTextureInfo();if(info)info.setWrapS(33071).setWrapT(33071);
  }
 }
 doc.createExtension(KHRTextureBasisu).setRequired(true);
 for(const t of doc.getRoot().listTextures()) {
  const raw=t.getName().replace(/\.png$/,'');
  const id=raw.startsWith('street-')?raw:raw.includes('normal')?'hero-normal':raw.includes('orm')?'hero-orm':name==='water-road'?'water-color':name==='electrical-street'?'hero-color':'roads-color';
  t.setImage(await fs.readFile(`public/textures/${id}.ktx2`)).setMimeType('image/ktx2').setName(id);
 }
 await doc.transform(dedup(),weld(),prune({keepLeaves:true}),meshopt({encoder:MeshoptEncoder,level:'high'}));
 const bytes=packageExternal(Buffer.from(await io.writeBinary(doc)));await fs.writeFile(`public/models/${name}.glb`,bytes);
 report.push({name,bytes:bytes.length,triangles:doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0)});
 console.log(JSON.stringify(report.at(-1)));
}
const reportDirectory=`artifacts/${process.env.CIVICOPS_CAPTURE_PREFIX ?? 'vr14'}`;
await fs.mkdir(reportDirectory,{recursive:true});
await fs.writeFile(`${reportDirectory}/asset-report.json`,JSON.stringify(report,null,2));
