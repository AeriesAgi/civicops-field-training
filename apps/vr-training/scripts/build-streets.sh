#!/usr/bin/env bash
# Run from apps/vr-training with Blender on PATH and CC0 sources under asset-src/.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${HEAVY_SH:-}" && "${HEAVY_LOCK_HELD:-0}" != 1 ]]; then exec "$HEAVY_SH" bash "$0" "$@"; fi
python3 tools/blender/prepare-street-textures.py
python3 tools/blender/generate-atlas.py
python3 tools/blender/generate-water-atlas.py
python3 tools/blender/generate-roads-atlas.py
python3 - <<'PY'
from PIL import Image
from pathlib import Path
p=Path('artifacts/hero-build')
Image.open(p/'hero-color-source.png').save(p/'hero-color.png')
Image.open(p/'hero-orm-source.png').save(p/'hero-orm.png')
Image.new('RGB',(512,512),(128,128,255)).save(p/'hero-normal.png')
PY
blender -b -t 4 --factory-startup --python tools/blender/build-realistic-streets.py
node scripts/optimize-streets.mjs
# The district build also emits historical primitive actors. Always replace them
# with the selected licensed fleet/crew and baked motion before shipping.
bash scripts/build-library-actors.sh
