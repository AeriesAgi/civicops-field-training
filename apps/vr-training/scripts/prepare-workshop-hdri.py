"""Create a Quest-sized reflection-only HDRI; execute with Blender headless."""
from pathlib import Path
import bpy
project = Path(__file__).resolve().parent.parent
source = Path('asset-src/polyhaven/hdri/small_workshop_1k.hdr')
image = bpy.data.images.load(str(source))
image.scale(512, 256)
image.file_format = 'HDR'
image.filepath_raw = str(project / 'public/textures/workshop-ibl.hdr')
image.save()
print('Reflection-only HDRI:', image.filepath_raw, list(image.size))
