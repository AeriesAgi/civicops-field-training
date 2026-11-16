"""Bake shared hero PBR atlas through Blender 4.5 Cycles; no external artwork."""
import bpy
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'artifacts'/'hero-build'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=2)
plane=bpy.context.object; mat=bpy.data.materials.new('CulltronAtlasBakeSource'); mat.use_nodes=True
plane.data.materials.append(mat); nodes=mat.node_tree.nodes; links=mat.node_tree.links; bsdf=nodes.get('Principled BSDF'); output=nodes.get('Material Output')
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=1; scene.render.bake.margin=0
scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False; scene.render.bake.use_pass_color=True
for suffix,size in [('color',2048),('orm',512)]:
    source=bpy.data.images.load(str(OUT/('hero-'+suffix+'-source.png'))); source.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
    src=nodes.new('ShaderNodeTexImage'); src.image=source
    emission=nodes.new('ShaderNodeEmission'); links.new(src.outputs['Color'],emission.inputs['Color']); links.new(emission.outputs['Emission'],output.inputs['Surface'])
    target=bpy.data.images.new('BakedHero-'+suffix,width=size,height=size,alpha=False); target.colorspace_settings.name=source.colorspace_settings.name
    dst=nodes.new('ShaderNodeTexImage'); dst.image=target; nodes.active=dst
    bpy.ops.object.bake(type='EMIT'); target.filepath_raw=str(OUT/('hero-'+suffix+'.png')); target.file_format='PNG'; target.save()
    nodes.remove(src); nodes.remove(dst); nodes.remove(emission)
# Actual tangent-space normal map from procedural powdercoat, steel brushing and timber grain height.
height=bpy.data.images.load(str(OUT/'hero-height-source.png')); height.colorspace_settings.name='Non-Color'
hsrc=nodes.new('ShaderNodeTexImage'); hsrc.image=height
bump=nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value=.009; bump.inputs['Strength'].default_value=.7
links.new(hsrc.outputs['Color'],bump.inputs['Height']); links.new(bump.outputs['Normal'],bsdf.inputs['Normal']); links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
normal=bpy.data.images.new('BakedHero-normal',width=512,height=512,alpha=False); normal.colorspace_settings.name='Non-Color'
dst=nodes.new('ShaderNodeTexImage'); dst.image=normal; nodes.active=dst
bpy.ops.object.bake(type='NORMAL'); normal.filepath_raw=str(OUT/'hero-normal.png'); normal.file_format='PNG'; normal.save()
print('BAKED shared color/ORM/tangent normal atlas')
