"""Culltron CivicOps Electrical full-scale street, original procedural CC0 art.
Meters, +Y up, camera/player near (0,1.6,0) looking down -Z.  The street is
an immersive walk-around training environment: two 3.5 m lanes, real-height
poles, one 4.5 m car, a utility mini-sub and a cordoned downed line.
"""
from __future__ import annotations
import bpy, math, json
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
OUT = APP / 'public' / 'models'
ART = APP / 'artifacts' / 'electrical-street'
OUT.mkdir(parents=True, exist_ok=True); ART.mkdir(parents=True, exist_ok=True)

# restrained authored palette: no external textures, one material per family
# Dusk-readable albedo. Values stay dark enough for evening, light enough that
# a standing capture is not a black frame under one directional light plus IBL.
COLORS = {
    'asphalt': (0.18,0.18,0.19,1), 'lane': (0.90,0.88,0.78,1),
    'curb': (0.55,0.54,0.50,1), 'sidewalk': (0.42,0.40,0.37,1),
    'verge': (0.20,0.34,0.16,1), 'buildingA': (0.62,0.46,0.38,1),
    'buildingB': (0.40,0.48,0.52,1), 'roof': (0.32,0.18,0.16,1),
    'glass': (0.55,0.72,0.78,1), 'steel': (0.45,0.48,0.50,1),
    'cabinet': (0.10,0.36,0.38,1), 'cabinetLight': (0.22,0.55,0.54,1),
    'hazard': (0.95,0.38,0.05,1), 'warning': (0.98,0.73,0.08,1),
    'cable': (0.08,0.08,0.09,1), 'car': (0.12,0.42,0.48,1),
    'tyre': (0.08,0.08,0.09,1), 'lamp': (1.0,0.62,0.22,1),
    'tree': (0.12,0.38,0.18,1), 'trunk': (0.36,0.22,0.12,1),
    'house': (0.70,0.62,0.50,1), 'sign': (0.95,0.92,0.78,1),
}
MATS: dict[str,bpy.types.Material] = {}

def mat(name: str, emission: float=0.0):
    m = MATS.get(name)
    if m: return m
    m = bpy.data.materials.new('ElectricalStreet_' + name)
    m.diffuse_color = COLORS[name]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = COLORS[name]
    bsdf.inputs['Roughness'].default_value = 0.76 if name not in ('glass','lamp') else 0.32
    if name == 'glass': bsdf.inputs['Metallic'].default_value = 0.2
    if emission:
        bsdf.inputs['Emission Color'].default_value = COLORS[name]
        bsdf.inputs['Emission Strength'].default_value = emission * 2.5
    MATS[name] = m
    return m

def assign(o, name):
    o.data.materials.append(mat(name, 3.5 if name == 'lamp' else 0.0)); return o

def bevel(o, amount=0.015):
    if amount <= 0: return o
    mod = o.modifiers.new('soft manufactured edge','BEVEL'); mod.width = amount; mod.segments = 1
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(name, dims, pos, material, bevel_amount=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o,material); bevel(o,bevel_amount)
    for p in o.data.polygons: p.use_smooth=False
    o.select_set(False); return o

def cyl(name, radius, depth, pos, material, vertices=10, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    o=bpy.context.object; o.name=name
    if axis == 'X': o.rotation_euler[1]=math.pi/2
    elif axis == 'Z': o.rotation_euler[0]=math.pi/2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign(o,material)
    for p in o.data.polygons: p.use_smooth = vertices >= 12
    o.select_set(False); return o

def sphere(name, radius, pos, material, segments=10):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=pos)
    o=bpy.context.object; o.name=name; assign(o,material); o.select_set(False); return o

def curve_tube(name, points, radius, material):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=2; c.bevel_depth=radius; c.bevel_resolution=1
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for bp, co in zip(s.bezier_points, points): bp.co=co; bp.handle_left_type='AUTO'; bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); assign(o,'cable')
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False); return bpy.context.object

def join_group(objects, name):
    objects=[o for o in objects if o and o.name in bpy.data.objects and o.type=='MESH']
    if not objects: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    out=bpy.context.object; out.name=name; out.select_set(False)
    return out

def roof(name, x, z, w, d, h, material='roof'):
    # low pitched prism, intentionally simple but continuous and substantial
    verts=[(-w/2,h,-d/2),(w/2,h,-d/2),(w/2,h,d/2),(-w/2,h,d/2),
           (0,h+0.55,-d/2),(0,h+0.55,d/2)]
    faces=[(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5),(0,3,2,1)]
    me=bpy.data.meshes.new(name); me.from_pydata([(x+a,y,z+b) for a,y,b in verts],[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); assign(o,material); return o

def building(x,z,w,d,h,material):
    parts=[]
    parts.append(box('StreetBuildingWalls',(w,h,d),(x,h/2,z),material,0.04))
    parts.append(roof('StreetBuildingRoof',x,z,w+0.12,d+0.12,h))
    # glazed frontage faces toward street (inner x face)
    side = -1 if x>0 else 1
    front_x=x+side*(w/2+0.006)
    for i in range(3):
        zz=z-d*.27+i*d*.27
        parts.append(box('WindowFrame',(0.035,1.25,1.0),(front_x,h*.56,zz),'glass',0.01))
        parts.append(box('WindowMullion',(0.042,1.25,0.035),(front_x,h*.56,zz),'steel',0.0))
    parts.append(box('Door',(0.04,1.9,1.0),(front_x,0.95,z+d*.32),'door' if 'door' in COLORS else 'steel',0.01))
    return parts

def streetlight(x,z,parts):
    parts.append(cyl('StreetlightPole',0.10,8.6,(x,4.3,z),'steel',vertices=10))
    parts.append(cyl('PoleFoot',0.28,0.18,(x,0.09,z),'steel',vertices=10))
    # arm points over roadway
    direction=-1 if x>0 else 1
    arm=box('StreetlightArm',(2.0,0.10,0.10),(x+direction*0.92,8.46,z),'steel',0.03)
    parts.append(arm)
    parts.append(box('WarmLamp',(0.38,0.13,0.20),(x+direction*1.72,8.32,z),'lamp',0.04))

def car(x,z,parts):
    # 4.5 m long, 1.8 m wide compact service car aligned with road (+Z)
    local=[]
    local.append(box('CarBody',(1.80,0.52,4.50),(x,0.52,z),'car',0.12))
    local.append(box('CarCabin',(1.46,0.72,2.20),(x,1.12,z-0.12),'car',0.13))
    local.append(box('CarWindshield',(1.22,0.45,0.035),(x,1.22,z+0.94),'glass',0.02))
    local.append(box('CarRearGlass',(1.22,0.42,0.035),(x,1.22,z-1.18),'glass',0.02))
    for sx in (-0.94,0.94):
        for sz in (-1.42,1.42):
            local.append(cyl('CarTyre',0.35,0.18,(x+sx,0.37,z+sz),'tyre',vertices=12,axis='X'))
            local.append(cyl('CarHub',0.15,0.19,(x+sx,0.37,z+sz),'steel',vertices=10,axis='X'))
    local += [box('CarLamp',(0.38,0.16,0.08),(x-0.57,0.61,z+2.25),'warning',0.02), box('CarLamp',(0.38,0.16,0.08),(x+0.57,0.61,z+2.25),'warning',0.02)]
    carobj=join_group(local,'ElectricalTrainingCar'); parts.append(carobj)

def mini_sub(parts):
    local=[]
    # Sidewalk verge, clear of the 3.5 m lanes. The service door still faces +Z.
    x,z=-4.55,-8.0
    local += [box('MiniSubCabinet',(1.80,2.15,0.72),(x,1.08,z),'cabinet',0.07),
              box('MiniSubCap',(1.92,0.16,0.82),(x,2.19,z),'cabinetLight',0.05),
              box('MiniSubLip',(1.88,0.10,0.44),(x,0.92,z+0.35),'steel',0.03),
              box('MiniSubBase',(1.96,0.18,0.82),(x,0.09,z),'steel',0.04)]
    # front service panel and warning stripe, facing +Z to player
    local += [box('MiniSubServiceDoor',(1.42,1.30,0.025),(x,1.37,z+0.371),'cabinetLight',0.025),
              box('MiniSubStripe',(1.42,0.12,0.028),(x,0.88,z+0.389),'warning',0.01),
              box('MiniSubHandle',(0.12,0.20,0.05),(x,1.34,z+0.405),'steel',0.015)]
    # corner studs read at distance and add manufactured finish
    for sx in (-0.72,0.72):
      for sy in (0.40,1.95): local.append(cyl('MiniSubBolt',0.035,0.028,(x+sx,sy,z+0.41),'warning',vertices=8,axis='Z'))
    # The lock, tag and tester rest on this lip instead of floating in the lane.
    local.append(box('MiniSubToolShelf',(0.78,0.04,0.28),(x,0.94,z+0.56),'steel',0.01))
    parts.append(join_group(local,'ElectricalMiniSub'))

def road_scene():
    all_parts=[]; keep=[]
    # 7 m paved road, 50 m view corridor, shoulders and sidewalks.
    road=box('RoadSurface',(7.0,0.12,50.0),(0,-0.06,-20.0),'asphalt',0.02); keep.append(road)
    all_parts.append(road)
    all_parts += [box('LeftCurb',(0.34,0.20,50.0),(-3.67,0.10,-20.0),'curb',0.025), box('RightCurb',(0.34,0.20,50.0),(3.67,0.10,-20.0),'curb',0.025)]
    all_parts += [box('LeftSidewalk',(1.55,0.12,50.0),(-4.55,-0.01,-20.0),'sidewalk',0.02), box('RightSidewalk',(1.55,0.12,50.0),(4.55,-0.01,-20.0),'sidewalk',0.02)]
    all_parts += [box('LeftVerge',(7.0,0.06,50.0),(-8.8,-0.03,-20.0),'verge',0.02), box('RightVerge',(7.0,0.06,50.0),(8.8,-0.03,-20.0),'verge',0.02)]
    # dashed centre line and edge markings
    marks=[]
    for z in range(3,-46,-6): marks.append(box('CentreDash',(0.14,0.012,3.0),(0,0.008,z),'lane',0.005))
    for x in (-3.35,3.35): marks.append(box('EdgeLine',(0.10,0.012,50.0),(x,0.008,-20.0),'lane',0.005))
    all_parts.append(join_group(marks,'RoadMarkings'))
    # street furniture and a recognizable skyline
    poles=[]
    for x in (-4.18,4.18):
      for z in (-6.0,-25.0): streetlight(x,z,poles)
    keep.append(join_group(poles,'StreetlightPoles'))
    buildings=[]
    for x,z,w,d,h,mc in [(-8.2,-6,4.4,8.5,4.6,'buildingA'),(8.3,-8,4.2,9.0,5.1,'buildingB'),(-8.6,-19,5.2,9.0,5.8,'buildingB'),(8.8,-22,5.0,10.0,4.4,'buildingA'),(-8.4,-33,4.8,10.0,5.4,'house'),(8.7,-35,5.4,9.0,5.0,'buildingB')]: buildings += building(x,z,w,d,h,mc)
    all_parts.append(join_group(buildings,'StreetBuildings'))
    # distant low horizon mass keeps the scene from reading as a floating set.
    all_parts.append(box('HorizonBlock',(28.0,4.0,0.8),(0,2.0,-45.0),'buildingB',0.05))
    # a few authored trees in verge, faceted and sparse
    trees=[]
    for x,z in [(-6.8,-9),(-6.9,-26),(6.8,-14),(6.7,-30)]:
      trees += [cyl('TreeTrunk',0.12,2.8,(x,1.4,z),'trunk',vertices=8), sphere('TreeCanopy',1.0,(x,3.15,z),'tree')]
    all_parts.append(join_group(trees,'StreetTrees'))
    # downed wire, sagging into the protected zone: black cable plus highly visible markers
    cable=curve_tube('DownedLiveLine',[(-4.18,8.0,-6.0),(-2.4,4.8,-9.0),(0.2,1.4,-13.5),(2.1,0.45,-15.0)],0.045,'cable'); keep.append(cable)
    warning_parts=[]
    for x,z in [(-2.5,-13.8),(-1.2,-14.5),(1.0,-14.5),(2.5,-13.8)]:
      warning_parts += [cyl('CordonPost',0.055,1.05,(x,0.53,z),'hazard',vertices=8), box('CordonFoot',(0.35,0.08,0.35),(x,0.04,z),'hazard',0.02)]
    warning_parts.append(curve_tube('CordonRail',[(-2.5,0.92,-13.8),(-1.2,0.98,-14.5),(1.0,0.98,-14.5),(2.5,0.92,-13.8)],0.022,'hazard'))
    warning_parts += [box('HazardBoard',(1.0,0.75,0.06),(-2.55,1.25,-13.78),'warning',0.025), box('HazardBoard',(1.0,0.75,0.06),(2.55,1.25,-13.78),'warning',0.025)]
    all_parts.append(join_group([o for o in warning_parts if o.type=='MESH'],'ElectricalCordon'))
    carparts=[]; car(-1.72,-11,carparts); keep.extend(carparts)
    mini_sub(all_parts); keep.extend([bpy.data.objects.get('ElectricalMiniSub')])
    # Merge ordinary meshes by material for a small draw-call footprint.
    keep_names=set()
    for o in keep:
      try:
        if o and bpy.data.objects.get(o.name) is o: keep_names.add(o.name)
      except ReferenceError: pass
    for material_name in MATS:
      regular=[o for o in list(bpy.data.objects) if o.type=='MESH' and o.name not in keep_names]
      group=[o for o in regular if any(ms.material and ms.material.name=='ElectricalStreet_'+material_name for ms in o.material_slots)]
      if len(group)>1: join_group(group,'Street_'+material_name)
    # marker metadata survives in root scene extras through glTF export.
    for name, dims, pos in [('ScaleContract_RoadLane',(7.0,0.12,50.0),(0,-0.06,-20.0)),('ScaleContract_Car',(1.8,1.4,4.5),(-1.72,0,-11)),('ScaleContract_Pole',(0.2,8.6,0.2),(-4.18,0,-6))]:
      marker=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(marker); marker.location=pos; marker['dimensionsMeters']=list(dims); marker['contract']='electrical full-scale street';
    return keep_names

def bake_authored_y_up():
    """Authoring stores runtime (x, up, forward) in Blender (x, y, z).

    hero_common.p maps runtime (x, y, z) to Blender (x, -z, y). The same map
    is applied here once, before export_yup, so the carriageway lies on the
    ground. Canonical point: authored (0, 1, -2) becomes Blender (0, 2, 1)
    and glTF (0, 1, -2). A +90° X rotation (determinant +1) keeps face winding.
    """
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.data and not obj.parent:
            mesh = obj.data
            for vertex in mesh.vertices:
                x, y, z = vertex.co
                vertex.co.x, vertex.co.y, vertex.co.z = x, -z, y
            mesh.update()
        if obj.parent:
            continue
        x, y, z = obj.location
        obj.location = (x, -z, y)

def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    # Set metric units before creating geometry so glTF export preserves metres.
    bpy.context.scene.unit_settings.system='METRIC'; bpy.context.scene.unit_settings.scale_length=1.0
    road_scene()
    bake_authored_y_up()
    root=bpy.data.objects.new("ElectricalStreetRoot",None);bpy.context.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o!=root and not o.parent:o.parent=root
    from street_realism import enhance
    templates=enhance(root,"electrical")
    import hero_common as h
    h.finish(root,"electrical-street.glb",exclude=templates+("ElectricalMiniSub","RoadSurface","DownedLiveLine"))
    bpy.context.scene.world.color=(0.015,0.025,0.05)
    # Select all visible geometry; glTF extras on scale markers are exported.
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects: o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    path=OUT/'electrical-street.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/'electrical-street.blend'))
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,export_vertex_color='ACTIVE', export_materials='EXPORT', export_extras=True, export_cameras=False, export_lights=False)
    tri=sum(sum(max(0,len(p.vertices)-2) for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    # Sidecar is an audit aid; tests also assert GLB presence and these source dimensions.
    contract={'roadWidthMeters':7.0,'laneWidthMeters':3.5,'carLengthMeters':4.5,'carWidthMeters':1.8,'poleHeightMeters':8.6,'eyeHeightMeters':1.6,'triangleCount':tri,'glb':str(path)}
    (ART/'scale-contract.json').write_text(json.dumps(contract,indent=2)+'\n')
    print('ELECTRICAL_STREET', path, 'triangles', tri, 'bytes', path.stat().st_size)

if __name__=='__main__': main()
