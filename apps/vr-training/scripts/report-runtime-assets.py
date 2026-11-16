"""Inspect packaged GLB JSON/KTX2 payloads without allocating GPU textures."""
from pathlib import Path
import json, struct
root = Path(__file__).resolve().parent.parent
report = []
seen_texture_files = set()
for path in sorted((root / 'public/models').glob('*.glb')):
    data = path.read_bytes()
    json_length, chunk_type = struct.unpack_from('<II', data, 12)
    asset = json.loads(data[20:20+json_length])
    binary_start = 20 + json_length + 8
    textures = []
    gpu_bytes = 0
    for image in asset.get('images', []):
        if image.get('mimeType') != 'image/ktx2':
            continue
        if 'uri' in image:
            texture_path = (path.parent / image['uri']).resolve()
            shared = texture_path in seen_texture_files
            seen_texture_files.add(texture_path)
            texture_data = texture_path.read_bytes()
            offset = 0
        else:
            view = asset['bufferViews'][image['bufferView']]
            offset = binary_start + view.get('byteOffset', 0)
            texture_data = data
            shared = False
        width, height, depth, layers, faces, levels = struct.unpack_from('<6I', texture_data, offset + 20)
        # Conservative ASTC4x4 / BC7 budget (16 bytes per4x4 block) including all mips.
        size = 0
        for level in range(levels):
            w, h = max(1, width >> level), max(1, height >> level)
            size += ((w + 3)//4) * ((h + 3)//4) * 16
        gpu_bytes += 0 if shared else size
        textures.append({'name': image.get('name', ''), 'width': width, 'height': height, 'levels': levels, 'gpuWorstCaseBytes': size, 'shared': shared})
    tris = sum(asset['accessors'][p['indices']]['count']//3 if 'indices' in p else asset['accessors'][p['attributes']['POSITION']]['count']//3 for mesh in asset.get('meshes', []) for p in mesh['primitives'])
    report.append({'file': path.name, 'bytes': len(data), 'triangles': tris, 'primitives': sum(len(m['primitives']) for m in asset.get('meshes',[])), 'materials': len(asset.get('materials',[])), 'textures': textures, 'gpuWorstCaseBytes': gpu_bytes, 'extensionsRequired': asset.get('extensionsRequired',[])})
print(json.dumps({'assets':report,'totals':{'bytes':sum(r['bytes'] for r in report),'triangles':sum(r['triangles'] for r in report),'primitives':sum(r['primitives'] for r in report),'gpuWorstCaseBytes':sum(r['gpuWorstCaseBytes'] for r in report)}},indent=2))
