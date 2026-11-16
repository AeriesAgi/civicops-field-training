"""Original CC0 municipal workshop architecture. Blender 4.5 headless, metres."""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
OUT=os.path.abspath('artifacts/asset-build'); os.makedirs(OUT,exist_ok=True)
M={}
def material(name,color,rough=.6,metal=0,emit=None):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 if emit: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emit
 M[name]=m; return m
def box(name,size,pos,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos); o=bpy.context.object; o.name=name
 o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mat)
 if bevel:
  b=o.modifiers.new('Manufactured edge','BEVEL'); b.width=bevel; b.segments=2
  bpy.ops.object.modifier_apply(modifier=b.name)
  n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=n.name)
 return o
def pipe(name,a,b,r,mat):
 a,b=Vector(a),Vector(b); d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d.length,location=(a+b)/2); o=bpy.context.object; o.name=name
 o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
white=material('Warm mineral paint',(.76,.78,.72),.88)
mint=material('Depot sage enamel',(.26,.39,.36),.65)
ink=material('Graphite powdercoat',(.035,.06,.063),.55)
metal=material('Brushed galvanised steel',(.48,.53,.52),.35,.86)
wood=material('Oiled timber',(.32,.20,.105),.72)
glass=material('Diffused daylight',(.73,.88,.96),.6,emit=.6)
light=material('Fluorescent opal diffuser',(.93,.95,.89),.3,emit=1.2)
# Small original PBR surface maps. Exported images are converted to KTX2 afterwards.
def image(name,fn,res=256):
 im=bpy.data.images.new(name,width=res,height=res,alpha=True)
 pixels=[]
 for yy in range(res):
  for xx in range(res):pixels.extend(fn(xx,yy))
 im.pixels=pixels; im.filepath_raw=OUT+'/'+name+'.png'; im.file_format='PNG'; im.save(); return im
noise=lambda x,y: math.sin(x*73.17+y*29.37)*math.cos(x*12.21-y*41.97)
norm=image('mineral-normal',lambda x,y:(.5+.023*noise(x,y),.5+.023*noise(y,x),1,1))
rough=image('mineral-orm',lambda x,y:(1,.87+.025*noise(x,y),0,1))
for m in [white]+[v for k,v in M.items() if k.startswith('Ceramic')]:
 nodes=m.node_tree.nodes;links=m.node_tree.links;bsdf=nodes.get('Principled BSDF')
 n=nodes.new('ShaderNodeTexImage');n.image=norm;n.image.colorspace_settings.name='Non-Color'
 nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.25;links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
 t=nodes.new('ShaderNodeTexImage');t.image=rough;t.image.colorspace_settings.name='Non-Color';sep=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bsdf.inputs['Roughness'])
# Y-up authoring exported from Blender's Z-up axes: input (x,y,z) maps to (x,z,-y).
def p(x,y,z):return (x,-z,y)
def s(x,y,z):return (x,z,y)
# Real thickness and bevelled wall boundaries. Open front receives seated rig.
box('Floor slab',s(6.4,.08,5.6),p(0,-.055,-.3),ink)
box('Back painted wall',s(6.4,3.2,.12),p(0,1.6,-2.3),white,.015)
box('Sage lower wall',s(6.4,1,.035),p(0,.5,-2.221),mint,.01)
box('Left wall',s(.12,3.2,5.6),p(-3.2,1.6,-.3),white,.015)
box('Right wall',s(.12,3.2,5.6),p(3.2,1.6,-.3),white,.015)
box('Ceiling',s(6.4,.10,5.6),p(0,3.24,-.3),white,.01)
box('Front painted wall',s(6.4,3.2,.12),p(0,1.6,2.48),white,.015)
for x in [-3.12,3.12]:box('Steel skirting',s(.024,.11,5.5),p(x,.055,-.3),ink,.007)
box('Back skirting',s(6.3,.11,.024),p(0,.055,-2.20),ink,.007)
box('Wall dado rail',s(6.3,.04,.05),p(0,1.01,-2.185),metal,.009)
# Slight tile variation with visible grout, no dense mesh decoration.
for ix in range(16):
 for iz in range(14):
  key='Porcelain floor'
  if key not in M:material(key,(.426,.451,.438),.82)
  box('Porcelain floor tile',s(.394,.012,.394),p(-3+ix*.4,-.009,-2.9+iz*.4),M[key])
# Broad frosted window over left return; behind bench at eye-safe distance.
box('Window recess',s(1.85,1.1,.04),p(-1.7,1.92,-2.205),ink,.025)
box('Frosted window',s(1.73,.99,.022),p(-1.7,1.92,-2.17),glass,.015)
for x in [-2.55,-1.7,-.85]:box('Window mullion',s(.027,1.04,.034),p(x,1.92,-2.15),metal,.006)
box('Window sill',s(1.93,.048,.20),p(-1.7,1.36,-2.12),white,.016)
# Wall raceway and conduit have plausible joints, clips and sockets.
box('Cable raceway',s(6.15,.075,.052),p(0,2.60,-2.17),mint,.012)
for x in [-.55,.60,2.0]:
 pipe('Vertical steel conduit',p(x,.99,-2.12),p(x,2.59,-2.12),.013,metal)
 for y in [1.20,1.80,2.35]:box('Conduit clip',s(.05,.024,.032),p(x,y,-2.12),ink,.004)
 box('Junction box',s(.10,.13,.055),p(x,1.15,-2.1),mint,.012)
# Fixtures are emissive objects only: no realtime lights or shadows.
for x in [-1.5,1.5]:
 box('Luminaire housing',s(.20,.055,1.3),p(x,3.15,-.4),metal,.015)
 box('Opal lamp cover',s(.15,.035,1.22),p(x,3.112,-.4),light,.016)
# Original workshop wayfinding, extruded typography merged with material.
def text(body,size,pos,mat,name):
 c=bpy.data.curves.new(name,'FONT'); c.body=body;c.size=size;c.extrude=.0005
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=p(*pos);o.rotation_euler=(math.pi/2,0,0);c.materials.append(mat)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
box('Wayfinding plaque',s(1.60,.38,.025),p(.80,2.05,-2.195),mint,.018)
text('CIVICOPS',.16,(.09,2.08,-2.175),white,'CivicOps workshop sign')
text('ELECTRICAL WORKSHOP / 01',.05,(.10,1.96,-2.174),white,'Department plaque')
# Dark contact patch under the main bench: diffused edge baked into a texture later.
shadow=image('bench-contact',lambda x,y:(.015,.025,.022,.25*max(0,1-(((x-128)/128)**2+((y-128)/128)**2))**3))
sm=material('Baked bench contact',(.015,.025,.022),1);sm.surface_render_method='DITHERED'
n=sm.node_tree.nodes.new('ShaderNodeTexImage');n.image=shadow
bs=sm.node_tree.nodes.get('Principled BSDF');sm.node_tree.links.new(n.outputs['Color'],bs.inputs['Base Color']);sm.node_tree.links.new(n.outputs['Alpha'],bs.inputs['Alpha'])
bpy.ops.mesh.primitive_plane_add(size=1,location=p(0,.001,-.26));o=bpy.context.object;o.name='Soft bench contact shadow';o.scale=(1.4,1.0,1);o.data.materials.append(sm)
# Consolidate opaque architecture in a PBR swatch atlas. Different paint,
# porcelain, graphite and steel finishes remain physically distinct in one batch.
selected=[white,mint,ink,metal,M['Porcelain floor']]
col=image('architecture-colour',lambda x,y:((*selected[min(x//16,4)].diffuse_color[:3],1)),res=128)
packed=image('architecture-orm',lambda x,y:(1,selected[min(x//16,4)].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value,selected[min(x//16,4)].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,1),res=128)
combined=material('Workshop opaque PBR batch',(1,1,1),1,1)
bs=combined.node_tree.nodes.get('Principled BSDF');nodes=combined.node_tree.nodes;links=combined.node_tree.links
for im,target in [(col,'Base Color')]:
 t=nodes.new('ShaderNodeTexImage');t.image=im;links.new(t.outputs['Color'],bs.inputs[target])
t=nodes.new('ShaderNodeTexImage');t.image=packed;t.image.colorspace_settings.name='Non-Color';sep=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
for o in bpy.context.scene.objects:
 if o.type!='MESH' or len(o.data.materials)!=1 or o.data.materials[0] not in selected:continue
 index=selected.index(o.data.materials[0]);uv=o.data.uv_layers.new(name='PaletteUV');o.data.uv_layers.active=uv;uv.active_render=True
 for value in uv.data:value.uv=((index*16+8)/128,.5)
 o.data.materials[0]=combined
# Merge architecture per material; retained 3D contours, no hundreds of draw calls.
for mat in list(M.values()):
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
 if not objs:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();bpy.context.object.name=mat.name
bpy.ops.export_scene.gltf(filepath=OUT+'/workshop.glb',export_format='GLB',export_yup=True,export_apply=True)
print('WORKSHOP EXPORTED',len([o for o in bpy.context.scene.objects if o.type=='MESH']))
