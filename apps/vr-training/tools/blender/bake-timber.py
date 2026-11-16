"""Cycles tangent normal bake from original 30 μm Culltron timber height.

Artwork: Culltron, CC0 1.0. Run after generate-timber.py:
blender -b --python tools/blender/bake-timber.py
No intermediate artwork, external image, or third-party material is required.
"""
from pathlib import Path
import importlib.util
import bpy
import numpy as np

SOURCE = Path(__file__).with_name('generate-timber.py')
spec = importlib.util.spec_from_file_location('culltron_fine_timber', SOURCE)
timber = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timber)
OUT = timber.OUT
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=2)
plane = bpy.context.object
plane.name = 'TimberBakeDesktop980x740mm'
plane.scale = (.490, .370, 1.)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
material = bpy.data.materials.new('CulltronFineTimberBakeSource')
material.use_nodes = True
plane.data.materials.append(material)
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .68
bsdf.inputs['Metallic'].default_value = 0.
_, original_height = timber.timber_fields()
field = original_height.reshape(512, 2, 512, 2).mean(axis=(1, 3))
source = bpy.data.images.new('OriginalFineTimberPhysicalHeight', width=512, height=512,
                             alpha=False, float_buffer=True)
source.colorspace_settings.name = 'Non-Color'
rgba = np.empty((512, 512, 4), dtype=np.float32)
rgba[..., :3] = np.flipud(field)[..., None]
rgba[..., 3] = 1.
source.pixels.foreach_set(rgba.ravel())
source.update()
height_node = nodes.new('ShaderNodeTexImage')
height_node.image = source
height_node.interpolation = 'Linear'
bump = nodes.new('ShaderNodeBump')
bump.inputs['Distance'].default_value = timber.MAX_RELIEF_METRES
bump.inputs['Strength'].default_value = 1.
links.new(height_node.outputs['Color'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
normal = bpy.data.images.new('BakedCulltronFineTimberNormal', width=512, height=512,
                             alpha=False)
normal.colorspace_settings.name = 'Non-Color'
destination = nodes.new('ShaderNodeTexImage')
destination.image = normal
nodes.active = destination
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.render.bake.margin = 0
scene.render.bake.normal_space = 'TANGENT'
bpy.ops.object.bake(type='NORMAL')
normal.filepath_raw = str(OUT / 'hero-timber-normal.png')
normal.file_format = 'PNG'
normal.save()
print(f'Cycles baked original fine timber normal: {normal.filepath_raw}; max relief 30 μm')
