#!/usr/bin/env bash
# All intermediate files stay in ignored artifacts/asset-build.
set -euo pipefail
: "${BLENDER:=blender}"
cd "$(dirname "$0")/.."
gltf-transform uastc artifacts/asset-build/workshop.glb artifacts/asset-build/workshop-normal.glb --slots normalTexture --resize 512 --level 2 --rdo true --rdo-lambda 0.5 --zstd 10 --jobs 2
gltf-transform etc1s artifacts/asset-build/workshop-normal.glb artifacts/asset-build/workshop-textures.glb --slots '{baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture}' --resize 512 --quality 200 --jobs 2
gltf-transform draco artifacts/asset-build/workshop-textures.glb public/models/workshop.glb --decode-speed 8 --quantize-position 14 --quantize-normal 10 --quantize-texcoord 12
python3 scripts/report-runtime-assets.py > artifacts/asset-build/runtime-assets-report.json
