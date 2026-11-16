/** CC0 art pipeline. Run after . */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = 'asset-src/polyhaven';
const buildRoot = path.join(project, 'artifacts/asset-build');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const selected = [
  // Fine surface character is baked into PBR maps; distant props need only silhouette.
  ['metal_toolbox', 0.25, 0.006], ['screwdriver', 0.75, 0.001], ['pliers', 0.75, 0.001],
  ['garden_gloves_01', 0.35, 0.006], ['mounted_fluorescent_lights', 0.08, 0.02],
  ['steel_frame_shelves_01', 0.25, 0.015],
  ['metal_tool_chest', 0.15, 0.01],
];
const only = process.argv.slice(2);
await fs.mkdir(buildRoot, { recursive: true });
await MeshoptSimplifier.ready;
const reports = [];
for (const [name, ratio, error] of selected) {
  if (only.length && !only.includes(name)) continue;
  const doc = await io.read(path.join(sourceRoot, name, `${name}_1k.gltf`));
  const root = doc.getRoot();
  // Poly Haven ARM already contains baked AO in R; restore the omitted AO slot.
  for (const mat of root.listMaterials()) {
    const orm = mat.getMetallicRoughnessTexture();
    if (orm) mat.setOcclusionTexture(orm);
    mat.setDoubleSided(false);
  }
  await doc.transform(dedup(), flatten(), join(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }), prune());
  const scene = root.listScenes()[0];
  const bounds = getBounds(scene);
  const info = {
    name, bounds, yUp: true, origin: 'Source origin retained',
    materials: root.listMaterials().length,
    drawCalls: root.listMeshes().reduce((a,m) => a + m.listPrimitives().length, 0),
    triangles: root.listMeshes().reduce((a,m) => a + m.listPrimitives().reduce((b,p) => b + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3,0),0),
    textures: root.listTextures().length, textureDimension: 512,
    simplificationTarget: ratio, simplificationMaxError: error,
  };
  const prepared = path.join(buildRoot, `${name}-geometry.glb`);
  const normals = path.join(buildRoot, `${name}-normal.glb`);
  const textures = path.join(buildRoot, `${name}-textures.glb`);
  const output = path.join(project, 'public/models', `poly-${name.replaceAll('_','-')}.glb`);
  await io.write(prepared, doc);
  for (const args of [
    ['uastc', prepared, normals, '--slots', 'normalTexture', '--resize', '512', '--level', '2', '--rdo', 'true', '--rdo-lambda', '0.5', '--zstd', '10', '--jobs', '2'],
    ['etc1s', normals, textures, '--slots', '{baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture}', '--resize', '512', '--quality', '180', '--jobs', '2'],
    ['draco', textures, output, '--decode-speed', '8', '--quantize-position', '14', '--quantize-normal', '10', '--quantize-texcoord', '12'],
  ]) execFileSync('gltf-transform', args, { stdio: 'ignore' });
  info.bytes = (await fs.stat(output)).size;
  reports.push(info);
  console.log(JSON.stringify(info));
}
await fs.writeFile(path.join(buildRoot,'poly-runtime-report.json'), JSON.stringify(reports,null,2));
