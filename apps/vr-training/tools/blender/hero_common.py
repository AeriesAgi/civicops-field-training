"""Culltron original hero modelling kit. Runtime coordinates: metres, +Y up, +Z front.
Generated artwork is CC0, matching the public repository's existing dedication.
Every mesh uses one UV atlas; articulated/readout parts may remain separate.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector, Quaternion

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
OUT = APP / 'artifacts' / 'hero-build'
PALETTE = ['ivory','steel','dark','rubber','red','yellow','teal','copper','wood','lime','plaster','floor','orange','white','blue','glass']
ROOT = None
MAT = None

def p(x, y=None, z=None):
    """Map runtime XYZ to Blender XYZ (also accepts an XYZ sequence)."""
    if y is None: x,y,z=x
    return Vector((x,-z,y))
runtime_to_blender = p

def atlas_material():
    global MAT
    if MAT: return MAT
    existing=bpy.data.materials.get('CivicOpsHeroAtlas')
    if existing: MAT=existing; return MAT
    MAT=bpy.data.materials.new('CivicOpsHeroAtlas'); MAT.use_nodes=True
    tree=MAT.node_tree; bsdf=tree.nodes.get('Principled BSDF')
    for suffix, color_space, socket in [('color','sRGB','Base Color'),('orm','Non-Color',None),('normal','Non-Color',None)]:
        path=OUT / ('hero-'+suffix+'.png')
        if not path.exists(): raise RuntimeError('Generate and bake atlas first: '+str(path))
        img=bpy.data.images.load(str(path),check_existing=True); img.colorspace_settings.name=color_space
        tex=tree.nodes.new('ShaderNodeTexImage'); tex.image=img; tex.label='Shared hero '+suffix
        if socket: tree.links.new(tex.outputs['Color'],bsdf.inputs[socket])
        elif suffix=='orm':
            split=tree.nodes.new('ShaderNodeSeparateColor'); tree.links.new(tex.outputs['Color'],split.inputs['Color'])
            tree.links.new(split.outputs['Green'],bsdf.inputs['Roughness']); tree.links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
            # The R channel is the authored ambient occlusion; glTF carries its binding explicitly.
            group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
            if len(group.interface.items_tree)==0: group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
            ao=tree.nodes.new('ShaderNodeGroup'); ao.node_tree=group; tree.links.new(split.outputs['Red'],ao.inputs['Occlusion'])
        else:
            n=tree.nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value=.5
            tree.links.new(tex.outputs['Color'],n.inputs['Color']); tree.links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
    return MAT

def reset(name):
    global ROOT, MAT
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    MAT=None; ROOT=group(name,parent=False)
    return ROOT

def group(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=p(pos)
    if parent is not False: o.parent=parent or ROOT
    return o

def assign(obj,swatch='ivory'):
    obj.data.materials.clear(); obj.data.materials.append(atlas_material())
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    i=PALETTE.index(swatch); x=(i%8)*256; y=(i//8)*256
    # Project each manufactured face to its strongest normal, padded inside the trim tile.
    for face in obj.data.polygons:
        n=face.normal; axis=max(range(3),key=lambda k:abs(n[k])); axes=[k for k in range(3) if k!=axis]
        coords=[obj.data.vertices[obj.data.loops[j].vertex_index].co for j in face.loop_indices]
        lo=[min(v[a] for v in coords) for a in axes]; hi=[max(v[a] for v in coords) for a in axes]
        for j,v in zip(face.loop_indices,coords):
            u=(v[axes[0]]-lo[0])/max(hi[0]-lo[0],1e-9); vv=(v[axes[1]]-lo[1])/max(hi[1]-lo[1],1e-9)
            uv.data[j].uv=((x+8+u*240)/2048,1-(y+8+vv*240)/2048)
    return obj

def attach(obj,name,swatch,parent=None):
    obj.name=name; obj.parent=parent or ROOT
    assign(obj,swatch); return obj

def bevel(obj,width=.002,segments=2):
    if width>0:
        mod=obj.modifiers.new('MachinedEdgeBevel','BEVEL'); mod.width=width; mod.segments=segments
        bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons: poly.use_smooth=True
    mod=obj.modifiers.new('ManufacturedWeightedNormals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
    bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def box(name,dims,pos,swatch='ivory',bevel_width=.002,parent=None,**kw):
    if 'bevel' in kw: bevel_width=kw['bevel']
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(pos)); obj=bpy.context.object
    obj.dimensions=(dims[0],dims[2],dims[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel(obj,min(bevel_width,min(dims)*.3)); return attach(obj,name,swatch,parent)

def cylinder(name,radius,depth,pos,swatch='steel',axis=(0,1,0),vertices=12,parent=None,radius2=None,bevel_width=.0005):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius2 is None else radius2,depth=depth,location=p(pos))
    obj=bpy.context.object; obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(p(axis).normalized())
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bevel(obj,min(bevel_width,radius*.2,depth*.2),1); return attach(obj,name,swatch,parent)

def span(name,a,b,radius,swatch='steel',vertices=10,parent=None,radius2=None):
    aa=Vector(a); bb=Vector(b)
    return cylinder(name,radius,(bb-aa).length,tuple((aa+bb)*.5),swatch,tuple(bb-aa),vertices,parent,radius2)

def tube(name,points,radius,swatch='rubber',segments=6,parent=None,resolution=3):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=resolution
    spline=curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for control,co in zip(spline.bezier_points,points):
        control.co=p(co); control.handle_left_type='AUTO'; control.handle_right_type='AUTO'
    curve.bevel_depth=radius; curve.bevel_resolution=max(0,(segments-4)//2); curve.resolution_u=resolution
    o=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH'); return attach(bpy.context.object,name,swatch,parent)

def torus(name,radius,tubeRadius,pos,swatch='steel',axis=(0,0,1),major_segments=20,minor_segments=6,parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tubeRadius,major_segments=major_segments,minor_segments=minor_segments,location=p(pos))
    o=bpy.context.object; o.rotation_mode='QUATERNION'; o.rotation_quaternion=Vector((0,0,1)).rotation_difference(p(axis).normalized())
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    for poly in o.data.polygons: poly.use_smooth=True
    return attach(o,name,swatch,parent)

def mesh(name,vertices,faces,swatch='ivory',parent=None,smooth=False):
    data=bpy.data.meshes.new(name); data.from_pydata([p(co) for co in vertices],[],faces); data.update()
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    for poly in data.polygons: poly.use_smooth=smooth
    return attach(o,name,swatch,parent)

def loft(name,sections,swatch='ivory',segments=12,parent=None):
    """Continuous rounded rectangular Z loft: (z, halfW, upperY, lowerY [,power])."""
    verts=[]; faces=[]
    for s in sections:
        z,w,up,down=s[:4]; power=s[4] if len(s)>4 else 3
        for i in range(segments):
            a=2*math.pi*i/segments; ca=math.cos(a); sa=math.sin(a)
            verts.append((w*math.copysign(abs(ca)**(2/power),ca), (up if sa>=0 else down)*math.copysign(abs(sa)**(2/power),sa),z))
    for j in range(len(sections)-1):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments; faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(range(segments-1,-1,-1))); faces.append(tuple((len(sections)-1)*segments+i for i in range(segments)))
    return mesh(name,verts,faces,swatch,parent,True)

def label(name,size,pos,slot,normal=(0,0,1),parent=None,rect=None):
    # Local tangent +X, bitangent +Y, normal +Z; +Y surfaces read toward runtime +Z.
    n=Vector(normal).normalized(); tangent=Vector((-1,0,0)) if n.z < -.5 else Vector((1,0,0)); tangent=(tangent-n*tangent.dot(n)).normalized()
    bitangent=n.cross(tangent); center=Vector(pos); w,h=size
    verts=[tuple(center+tangent*x*w*.5+bitangent*y*h*.5) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    o=mesh(name,verts,[(0,1,2,3)],'white',parent)
    if rect is None: rect=((slot%4)*512,512+(slot//4)*512,512,512)
    x,y,rw,rh=rect; corners=[((x+4)/2048,1-(y+rh-4)/2048),((x+rw-4)/2048,1-(y+rh-4)/2048),((x+rw-4)/2048,1-(y+4)/2048),((x+4)/2048,1-(y+4)/2048)]
    for j,uv in enumerate(corners): o.data.uv_layers.active.data[j].uv=uv
    return o

def rotate(obj,angle_deg,axis=(0,1,0)):
    obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=Quaternion(p(axis).normalized(),math.radians(angle_deg)); return obj

def finish(root,filename,exclude=()):
    """One static draw per asset, keeping named articulated subtrees and contact empties."""
    meshes=[]
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH': continue
        at=o; excluded=False
        while at:
            if at.name in exclude: excluded=True; break
            at=at.parent
        if not excluded: meshes.append(o)
    if meshes:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]; bpy.ops.object.join()
        fixed=bpy.context.object; fixed.name=root.name+'-ManufacturedAssembly'
        mw=fixed.matrix_world.copy(); fixed.parent=root; fixed.matrix_world=mw
    # Articulation retains its named pivot while fixed pieces share one material draw.
    for name in exclude:
        groupobj=bpy.data.objects.get(name)
        if not groupobj or groupobj.type!='EMPTY' or name=='VoltageReadout': continue
        parts=[o for o in groupobj.children_recursive if o.type=='MESH']
        if len(parts)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in parts: o.select_set(True)
            bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
            joined=bpy.context.object; joined.name=name+'-ManufacturedAssembly'
            mw=joined.matrix_world.copy(); joined.parent=groupobj; joined.matrix_world=mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects: o.select_set(True)
    OUT.mkdir(parents=True,exist_ok=True)
    filepath=str(OUT / filename)
    bpy.ops.export_scene.gltf(filepath=filepath,export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
    triangles=sum(sum(len(poly.vertices)-2 for poly in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    print('HERO_EXPORT',filename,triangles,'triangles')
    return filepath
