"""Used licensed models + CC0 photographed emulator room. Sources never enter git."""
import bpy, math, pathlib, sys
from mathutils import Vector
LIB=pathlib.Path('asset-src/library')
OUT=pathlib.Path('artifacts/room-build');OUT.mkdir(parents=True,exist_ok=True)
def reset():bpy.ops.wm.read_factory_settings(use_empty=True)
def ground(obj,height,name):
    bpy.context.view_layer.update()
    for v in obj.data.vertices:v.co=obj.matrix_world@v.co
    obj.parent=None;obj.matrix_world.identity()
    lo=Vector([min(v.co[i] for v in obj.data.vertices) for i in range(3)])
    hi=Vector([max(v.co[i] for v in obj.data.vertices) for i in range(3)])
    for v in obj.data.vertices:v.co=(v.co-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z)))*(height/(hi.z-lo.z))
    obj.name=name
    for p in obj.data.polygons:p.use_smooth=True
    obj['contactPlaneY']=0;obj['metresHeight']=height
    return obj
def save(name,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_extras=True,export_animations=False)
    print('EXPORTED',name,flush=True)
reset();bpy.ops.import_scene.gltf(filepath=str(LIB/'sketchfab/barrier__traffic_cone_pack.glb'))
# First cone, the orange/reflective variant. Source object names are glTF node names.
cone=ground(bpy.data.objects['Object_3'],.75,'RehearsalTrafficCone')
cone['sourceLicence']='CC-BY-4.0';cone['sourceAuthor']='Sabri Ayes';save('cone',[cone])
reset();bpy.ops.import_scene.gltf(filepath=str(LIB/'models/props/utility_box_02/utility_box_02_1k.gltf'))
panel=ground(next(o for o in bpy.context.scene.objects if o.type=='MESH'),1.1,'WeatheredIsolationCabinet')
mod=panel.modifiers.new('QuestCabinetSilhouette','DECIMATE');mod.ratio=.5
bpy.context.view_layer.objects.active=panel;bpy.ops.object.modifier_apply(modifier=mod.name)
panel['sourceLicence']='CC0-1.0';save('cabinet',[panel])
reset()
# Photograph is emulator scenery only. The head-height sphere and flat floor share
# camera-projected UVs, giving a stable floor contact without a grey scan mesh.
im=bpy.data.images.load('asset-src/polyhaven/hdri/empty_workshop_2k.hdr')
bpy.context.scene.view_settings.view_transform='AgX';bpy.context.scene.view_settings.look='AgX - Medium High Contrast'
im.save_render(str((OUT/'room-panorama.png').resolve()),scene=bpy.context.scene)
pano=bpy.data.images.load(str((OUT/'room-panorama.png').resolve()))
mat=bpy.data.materials.new('PhotographedDepotRoom');mat.use_nodes=True
n=mat.node_tree.nodes;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=pano;em=n.new('ShaderNodeEmission');out=n.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(tex.outputs['Color'],em.inputs[0]);mat.node_tree.links.new(em.outputs[0],out.inputs[0]);mat.use_backface_culling=False
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=25,location=(0,0,1.5));room=bpy.context.object;room.name='PhotographedDepotBackdrop'
# glTF vertices face inward; at original photograph position direction matches HDRI.
for p in room.data.polygons:p.flip()
# UVs Blender sphere's seam does not use the HDRI azimuth convention. Generate it.
for p in room.data.polygons:
    us=[]
    for li in p.loop_indices:
        v=room.data.vertices[room.data.loops[li].vertex_index].co.normalized();us.append((math.atan2(v.y,v.x)/(2*math.pi)+.5,math.asin(v.z)/math.pi+.5))
    seam=max(u for u,v in us)-min(u for u,v in us)>.5
    for li,(u,v) in zip(p.loop_indices,us):room.data.uv_layers.active.data[li].uv=(u+(1 if seam and u<.5 else 0),v)
room.data.materials.append(mat);room['emulatorOnly']=True;room['passthroughSimulated']=True
# The room floor is 1:1. A radial grid avoids the panorama floor swimming at the feet.
verts=[(0,0,0)];uvs=[(.5,0)];faces=[]
for ring in range(1,17):
    r=ring/16*9
    for i in range(65):
        a=i/64*2*math.pi;verts.append((r*math.cos(a),r*math.sin(a),0));uvs.append((a/(2*math.pi)+.5,math.asin(-1.5/math.sqrt(r*r+2.25))/math.pi+.5))
for i in range(64):faces.append((0,1+i,2+i))
for ring in range(15):
    for i in range(64):
        a=1+ring*65+i;b=a+65;faces.append((a,b,b+1,a+1))
mesh=bpy.data.meshes.new('GroundedPhotographFloor');mesh.from_pydata(verts,[],faces);mesh.uv_layers.new()
for p in mesh.polygons:
    for li in p.loop_indices:mesh.uv_layers.active.data[li].uv=uvs[mesh.loops[li].vertex_index]
floor=bpy.data.objects.new('PhotographedRealFloor',mesh);bpy.context.collection.objects.link(floor);floor.data.materials.append(mat)
save('capture-room',[room,floor])
print('ROOM KIT READY',flush=True)
