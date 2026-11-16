"""Small CPU sun/contact bake for a full-scale street. One unlit overlay draw.
No realtime shadows. Rays hit the actual kerbs, walls, gates and vegetation.
Receiver polygons retain their heights: the bake never bridges the Water trench.
"""
import bpy, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
import numpy as np

def bake(root, kind, out):
    bpy.context.view_layer.update()
    receivers=[];verts=[];faces=[]
    prefixes=('RoadSurface','FullScaleAsphalt','CentreApproachAsphalt','AsphaltCarriageway','Asphalt','Sidewalk','Shoulder','GrassVerge','StreetGround','Street_verge','RoadApproach')
    # Geometry is still unmerged here; select horizontal receiver faces by semantic name.
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        is_ground=o.name.startswith(prefixes)
        normal_matrix=o.matrix_world.to_3x3()
        for poly in o.data.polygons:
            world=[o.matrix_world@o.data.vertices[i].co for i in poly.vertices]
            if is_ground and (normal_matrix@poly.normal).normalized().z>.98 and -.04 <= sum(v.z for v in world)/len(world) <= .55:
                receivers.append(world)
        if is_ground or o.name.startswith(('PaperLitter','TarCrack','WornResurfacing','Drain','Stormwater','GenericProduce')):continue
        start=len(verts);verts.extend(o.matrix_world@v.co for v in o.data.vertices)
        faces.extend(tuple(start+i for i in poly.vertices) for poly in o.data.polygons)
    if not receivers:return
    # 60 x 86 m coverage at 8-17 cm/texel, below a megabyte compressed with mipmaps.
    x0,x1,z0,z1=(-15,15,-43,43) if kind!='roads' else (-43,43,-15,15)
    W,H=(384,768) if kind!='roads' else (768,384)
    cast=BVHTree.FromPolygons(verts,faces,all_triangles=False)
    terrain_v=[];terrain_f=[]
    for face in receivers:
        i=len(terrain_v);terrain_v.extend(face);terrain_f.append(tuple(range(i,i+len(face))))
    terrain=BVHTree.FromPolygons(terrain_v,terrain_f,all_triangles=False)
    pixels=np.zeros((H,W,4),dtype=np.float32);pixels[:,:,:3]=(.045,.052,.065)
    # Shared directional light comes from upper -X/+Z, with a broad soft penumbra.
    sun=Vector((-.55,-.38,.75)).normalized()
    dirs=[(sun+Vector(d)).normalized() for d in [(-.025,.02,0),(.025,-.02,0),(0,0,0)]]
    ambient=[Vector((.68,0,.73)),Vector((-.68,0,.73)),Vector((0,.68,.73)),Vector((0,-.68,.73))]
    for y in range(H):
        wy=z0+(z1-z0)*(y+.5)/H
        for x in range(W):
            wx=x0+(x1-x0)*(x+.5)/W
            hit=terrain.ray_cast(Vector((wx,wy,1)),Vector((0,0,-1)),1.1)[0]
            if hit is None:continue
            origin=hit+Vector((0,0,.035));direct=0;ao=0
            for ray in dirs:
                if cast.ray_cast(origin,ray,45)[0] is not None:direct+=1
            for ray in ambient:
                point=cast.ray_cast(origin,ray,1.15)[0]
                if point is not None:ao+=max(0,1-(point-origin).length/1.15)
            pixels[y,x,3]=min(.60,direct*.115+ao*.135)
        if y%128==0:print('GROUND_BAKE',kind,y,'/',H,flush=True)
    # Separable box filter gives subtexel contact edges a soft, stable mip response.
    alpha=pixels[:,:,3]
    for axis in [0,1]:alpha=(alpha+np.roll(alpha,1,axis)+np.roll(alpha,-1,axis))/3
    pixels[:,:,3]=alpha
    image=bpy.data.images.new('street-'+kind+'-shadows',width=W,height=H,alpha=True)
    image.pixels.foreach_set(pixels.ravel());image.file_format='PNG';image.filepath_raw=str(out/(image.name+'.png'));image.save()
    material=bpy.data.materials.new('StreetGroundShadowBake');material.use_nodes=True
    t=material.node_tree;t.nodes.clear();output=t.nodes.new('ShaderNodeOutputMaterial');em=t.nodes.new('ShaderNodeEmission');tex=t.nodes.new('ShaderNodeTexImage');tex.image=image
    trans=t.nodes.new('ShaderNodeBsdfTransparent');mix=t.nodes.new('ShaderNodeMixShader')
    t.links.new(tex.outputs['Color'],em.inputs['Color']);t.links.new(tex.outputs['Alpha'],mix.inputs[0]);t.links.new(trans.outputs[0],mix.inputs[1]);t.links.new(em.outputs[0],mix.inputs[2]);t.links.new(mix.outputs[0],output.inputs[0])
    material.surface_render_method='DITHERED'
    # Reproduce only existing top faces; no infinite plane across holes or excavation.
    me=bpy.data.meshes.new('GroundShadowReceivers');vertices=[];polys=[]
    for face in receivers:
        i=len(vertices);vertices.extend(tuple(v+Vector((0,0,.008))) for v in face);polys.append(tuple(range(i,i+len(face))))
    me.from_pydata(vertices,[],polys);me.update();uv=me.uv_layers.new(name='UVMap')
    for loop in me.loops:
        v=me.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((v.x-x0)/(x1-x0),(v.y-z0)/(z1-z0))
    o=bpy.data.objects.new('StreetGroundShadows',me);bpy.context.collection.objects.link(o);o.data.materials.append(material);o.parent=root;o.matrix_parent_inverse=root.matrix_world.inverted()
    o['bakeMethod']='CPU BVH sun penumbra + 4-ray proximity occlusion';o['noRealtimeShadows']=True
    print('GROUND_BAKE_DONE',kind,len(verts),'caster vertices',len(receivers),'receiver faces',flush=True)
