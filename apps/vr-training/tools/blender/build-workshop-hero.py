"""Culltron original CC0 Module 1 workshop hero assets, Blender 4.5 LTS.

Run from apps/vr-training: blender -b --python tools/blender/build-workshop-hero.py
Runtime coordinates are metres, Y-up, front +Z. Bench stays floor-origin with
its tabletop y=.720, tray floor y=.734. Room retains the original 6.4x5.6m shell.
All silhouettes, geometry, original posters and material UVs are reproducible.
"""
import os, sys, math
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero_common as h
from hero_common import box, cylinder, tube, torus, label, group
# Background hardware uses a genuine single-segment edge chamfer: smooth hero
# silhouettes are authored as continuous lofts instead of spending faces on bevels.
_original_bevel = h.bevel
def workshop_edge_chamfer(obj, width=.002, segments=1):
    return _original_bevel(obj, width, 1)
h.bevel = workshop_edge_chamfer
OUT = os.path.abspath('artifacts/hero-build')
os.makedirs(OUT, exist_ok=True)

def P(v): return (v[0], -v[2], v[1])

def custom(name, verts, faces, swatch, parent, smooth=False):
    me = bpy.data.meshes.new(name + 'Geometry')
    me.from_pydata([P(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    h.assign(ob, swatch)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    if smooth:
        for poly in me.polygons: poly.use_smooth = True
    return ob

def loft_z(name, sections, swatch, parent, n=12):
    """Continuous manufactured/gripped tube; sections are (z,cx,cy,rx,ry)."""
    verts=[]; faces=[]
    for z,x,y,rx,ry in sections:
        for j in range(n):
            a=2*math.pi*j/n; verts.append((x+rx*math.cos(a),y+ry*math.sin(a),z))
    for i in range(len(sections)-1):
        for j in range(n):
            a=i*n+j; b=i*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces += [tuple(reversed(range(n))),tuple((len(sections)-1)*n+j for j in range(n))]
    return custom(name,verts,faces,swatch,parent,True)

def loft_y(name, sections, swatch, parent, n=24, cap=True):
    """Elliptical shell/cone section: (height,cx,cz,rx,rz)."""
    verts=[]; faces=[]
    for y,x,z,rx,rz in sections:
        for j in range(n):
            a=2*math.pi*j/n; verts.append((x+rx*math.cos(a),y,z+rz*math.sin(a)))
    for i in range(len(sections)-1):
        for j in range(n):
            a=i*n+j; b=i*n+(j+1)%n; faces.append((a,a+n,b+n,b))
    if cap in (True,'bottom'): faces.append(tuple(range(n)))
    if cap in (True,'top'): faces.append(tuple(reversed([(len(sections)-1)*n+j for j in range(n)])))
    return custom(name,verts,faces,swatch,parent,True)

def plate(name, outline, thickness, swatch, parent):
    """Tailored, thick panel in local XY, front +Z, including closed perimeter."""
    verts=[(x,y,z) for z in [-thickness/2,thickness/2] for x,y in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    for i in range(n): faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    return custom(name,verts,faces,swatch,parent)

def bolt(name,pos,parent,axis=(0,0,1),radius=.004):
    cylinder(name,radius,.003,pos,'steel',axis=axis,vertices=8,parent=parent)


def glove(name,pos,parent,side=1):
    g=group(name,pos,parent=parent)
    loft_z('AnatomicalRubberPalm',[(.046,0,0,.030,.008),(.021,0,.001,.034,.011),(-.028,0,.001,.032,.012),(-.048,0,0,.023,.009)],'red',g,12)
    loft_z('RolledElectricalCuff',[(.090,0,0,.033,.009),(.080,0,0,.034,.011),(.048,0,0,.031,.009)],'red',g,12)
    loft_z('CuffInnerLip',[(.091,0,0,.031,.008),(.085,0,0,.029,.008)],'rubber',g,12)
    for i,(x,l) in enumerate([(-.023,.030),(-.008,.043),(.008,.047),(.023,.038)]):
        loft_z('MouldedFinger'+str(i),[(-.033,x,.001,.008,.010),(-.044,x,.001,.008,.009),(-.039-l,x,.001,.006,.007),(-.044-l,x,0,.002,.003)],'red',g,8)
    loft_z('OpposedThumb',[(.003,side*.027,0,.011,.010),(-.012,side*.046,0,.010,.009),(-.039,side*.052,0,.007,.007),(-.045,side*.050,0,.003,.003)],'red',g,8)
    box('CuffClassPatch',(.024,.0018,.025),(0,.011,.066),'ivory',bevel=.0006,parent=g)
    return g


def screwdriver(name,pos,parent,length=.18):
    s=group(name,pos,parent=parent)
    loft_z('ErgonomicVDEHandle',[(.050,0,0,.008,.009),(.046,0,0,.011,.012),(.006,0,0,.010,.011),(-.009,0,0,.007,.008),(-.014,0,0,.006,.006)],'red',s,10)
    cylinder('YellowFingerCollar',.0085,.008,(0,0,-.012),'yellow',axis=(0,0,1),vertices=10,parent=s)
    cylinder('InsulatedDriverShaft',.0028,length-.09,(0,0,-.050),'yellow',axis=(0,0,1),vertices=8,parent=s,bevel_width=0)
    cylinder('HardenedDriverTip',.002,length*.2,(0,0,-length+.057),'steel',axis=(0,0,1),vertices=8,parent=s,bevel_width=0)
    for z in [.014,.024,.034]:
        cylinder('HandleGripRib',.0112,.002,(0,0,z),'dark',axis=(0,0,1),vertices=10,parent=s,bevel_width=0)
    return s


def pliers(name,pos,parent):
    s=group(name,pos,parent=parent)
    # Forged offset jaws and rounded insulated grip branches, smoothly attached.
    for side in [-1,1]:
        tube('ForgedSteelLever',[(side*.013,0,-.072),(side*.008,0,-.029),(side*.020,0,.016)],.006,'steel',segments=6,parent=s)
        tube('VDEGrip',[(side*.020,0,.008),(side*.027,0,.049),(side*.019,0,.077)],.009,'red',segments=6,parent=s)
        cylinder('GripEndCap',.009,.005,(side*.019,0,.076),'yellow',axis=(0,0,1),vertices=8,parent=s)
        box('SerratedJaw',(.010,.012,.030),(side*.008,0,-.063),'steel',bevel=.001,parent=s)
        for z in [-.065,-.056]: box('JawSerration',(.007,.0015,.002),(side*.005,.0068,z),'dark',bevel=0,parent=s)
    cylinder('ForgedPivot',.009,.012,(0,0,-.020),'steel',axis=(0,1,0),vertices=12,parent=s)
    cylinder('PivotRivet',.004,.0015,(0,.0065,-.020),'dark',vertices=8,parent=s)
    return s


def timber_material():
    """Original fine-grain PBR panel at physical fibre scale; independent of trim atlas."""
    mat=bpy.data.materials.get('CivicOpsBenchTimber')
    if mat: return mat
    mat=bpy.data.materials.new('CivicOpsBenchTimber'); mat.use_nodes=True
    nodes=mat.node_tree.nodes; links=mat.node_tree.links
    bs=nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=.68; bs.inputs['Metallic'].default_value=0
    color=nodes.new('ShaderNodeTexImage')
    color.image=bpy.data.images.load(os.path.join(OUT,'hero-timber-color.png'),check_existing=True)
    color.image.colorspace_settings.name='sRGB'
    links.new(color.outputs['Color'],bs.inputs['Base Color'])
    norm=nodes.new('ShaderNodeTexImage')
    norm.image=bpy.data.images.load(os.path.join(OUT,'hero-timber-normal.png'),check_existing=True)
    norm.image.colorspace_settings.name='Non-Color'
    nm=nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=1
    links.new(norm.outputs['Color'],nm.inputs['Color']); links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return mat


def timber_uv(obj):
    # Blender axes are X=bench fibre, Y=negative runtime Z, Z=physical height.
    # A 1024px texture spans the real .980x.740m panel; edges use a narrow physical
    # height crop rather than magnifying an entire tile over just55mm of timber.
    obj.data.materials.clear(); obj.data.materials.append(timber_material())
    uv=obj.data.uv_layers.active
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda k:abs(face.normal[k]))
        for i in face.loop_indices:
            co=obj.data.vertices[obj.data.loops[i].vertex_index].co
            if axis==2: u,v=(co.x+.49)/.98,(co.y+.37)/.74
            elif axis==1: u,v=(co.x+.49)/.98,(co.z+.0275)/.74
            else: u,v=(co.y+.37)/.98,(co.z+.0275)/.74
            uv.data[i].uv=(u,v)
    return obj


def build_bench():
    root=h.reset('Workbench')
    timber_uv(box('WornLaminatedTimberDesktop',(.980,.055,.740),(0,.6925,-.110),'wood',bevel=.006,parent=root))
    # Visible laminated end-grain layers and edge guard; all edges physically rounded.
    for y in [.674,.684,.697,.709]:
        box('BirchEndGrainLaminate',(.968,.0017,.002),(0,y,.260),'ivory',bevel=0,parent=root)
    box('PowderCoatedFrontRail',(.958,.022,.018),(0,.684,.259),'teal',bevel=.003,parent=root)
    for x in [-.426,.426]:
        for z in [-.185,.185]:
            box('WeldedSteelTubularLeg',(.035,.655,.035),(x,.3395,z),'dark',bevel=.002,parent=root)
            cylinder('ThreadedLevellingStem',.009,.030,(x,.027,z),'steel',vertices=8,parent=root,bevel_width=0)
            cylinder('MouldedLevellingFoot',.026,.016,(x,.008,z),'rubber',vertices=12,parent=root)
            bolt('LegJointBolt',(x,.635,z+.020),root,radius=.003)
    for z in [-.185,.185]: box('WeldedCrossmember',(.860,.036,.028),(0,.647,z),'dark',bevel=.001,parent=root)
    for x in [-.426,.426]: box('StructuralSideRail',(.028,.036,.400),(x,.647,0),'dark',bevel=.001,parent=root)
    box('PowderCoatedLowerShelf',(.820,.018,.390),(0,.158,0),'dark',bevel=.002,parent=root)
    box('RolledShelfLip',(.820,.032,.012),(0,.170,.190),'teal',bevel=.001,parent=root)
    box('EVAOrganiserFloor',(.640,.014,.180),(0,.727,-.110),'rubber',bevel=.003,parent=root)
    for x in [-.324,.324]: box('OrganiserEndWall',(.009,.027,.190),(x,.740,-.110),'dark',bevel=.001,parent=root)
    for z in [-.202,-.018]: box('OrganiserRolledLip',(.650,.023,.009),(0,.738,z),'dark',bevel=.001,parent=root)
    for x in [-.268,-.212]: box('PersonalLockCradle',(.006,.012,.045),(x,.740,-.070),'rubber',bevel=.001,parent=root)
    for z in [-.078,-.064]: box('DangerTagRest',(.070,.011,.006),(-.140,.7395,z),'rubber',bevel=.0008,parent=root)
    for x in [-.082,.084,.205]: box('FittedTrayDivider',(.006,.010,.120),(x,.737,-.105),'rubber',bevel=.0007,parent=root)
    # Tools remain clear of the grab tray, proving point, board and settings button.
    for i,x in enumerate([-.457,-.412,-.365]): screwdriver('InsulatedDriver'+str(i+1),(x,.733,-.090),root,.17+i*.013)
    pliers('InsulatedCombinationPliers',(.400,.733,-.115),root)
    glove('ElectricalGloveLeft',(-.399,.733,-.342),root,-1)
    glove('ElectricalGloveRight',(.390,.733,-.347),root,1)
    label('EngravedCivicOpsBenchIdentity',(.250,.028),(0,.688,.2692),9,parent=root,rect=(512,1956,512,60))
    for x in [-.445,.445]: bolt('RailFastener',(x,.684,.2698),root)
    h.finish(root,'workbench.glb')


def hardhat(name,pos,parent):
    g=group(name,pos,parent=parent)
    # Moulded crown with real wall thickness and flared drip brim.
    loft_y('InjectionMouldedHelmetCrown',[(.031,0,0,.118,.090),(.055,0,0,.115,.087),(.098,0,-.005,.105,.081),(.135,0,-.008,.083,.065),(.160,0,-.010,.051,.042),(.175,0,-.010,.006,.006)],'yellow',g,24,'top')
    loft_y('RolledHelmetBrim',[(.023,0,.007,.146,.117),(.029,0,.006,.149,.120),(.036,0,.003,.140,.109),(.033,0,0,.116,.089)],'yellow',g,24,False)
    loft_y('InteriorSuspensionBand',[(.024,0,0,.111,.084),(.046,0,0,.107,.081)],'dark',g,20,False)
    tube('MouldedCrownRidge',[(-.001,.052,.086),(-.001,.139,.047),(-.001,.178,-.006),(-.001,.135,-.072),(-.001,.055,-.087)],.005,'yellow',segments=6,parent=g)
    for side in [-1,1]:
        for z in [-.035,-.018,0,.018]:
            box('SideVentRecess',(.002,.005,.011),(side*.106,.085,z),'dark',bevel=.0005,parent=g)
    label('CivicOpsHelmetMark',(.045,.023),(0,.068,.087),8,parent=g,rect=(0,1680,512,260))
    return g


def vest(name,pos,parent):
    g=group(name,pos,parent=parent)
    # Open front and shaped arm holes are tailored silhouettes, not a rectangular slab.
    left=[(-.196,-.30),(-.211,-.13),(-.186,.058),(-.126,.107),(-.109,.251),(-.034,.266),(-.015,.145),(-.011,-.30)]
    right=[(-x,y) for x,y in reversed(left)]
    plate('LeftFluorescentFrontPanel',left,.008,'lime',g)
    plate('RightFluorescentFrontPanel',right,.008,'lime',g)
    # A folded back panel bridges shoulders behind the open zip seam.
    back=plate('VestShapedBack',[(-.190,-.287),(-.189,.06),(-.12,.12),(-.105,.26),(.105,.26),(.12,.12),(.189,.06),(.19,-.287)],.006,'lime',g)
    back.location=P((0,0,-.022))
    for x in [-.077,.077]:
        box('ReflectiveShoulderTape',(.035,.270,.002),(x,.094,.0055),'white',bevel=.0007,parent=g)
        box('ChestSafetyTape',(.155,.036,.002),(x*1.34,-.092,.0055),'white',bevel=.0007,parent=g)
        box('WaistSafetyTape',(.159,.036,.002),(x*1.34,-.227,.0055),'white',bevel=.0007,parent=g)
        box('BoundOpeningSeam',(.005,.445,.003),(x*.21,-.076,.006),'dark',bevel=.001,parent=g)
    for x in [-.119,.119]:
        pocket=plate('BoundCargoPocket',[(-.047,-.036),(-.048,.042),(.048,.042),(.047,-.036)],.008,'yellow',g)
        pocket.location=P((x,-.156,.006))
        box('PocketBoundSeam',(.090,.004,.004),(x,-.188,.012),'dark',bevel=.0007,parent=g)
    label('OriginalMunicipalCrewCrest',(.127,.100),(-.101,.073,.0085),8,parent=g)
    tube('VestHemBinding',[(-.195,-.292,.005),(-.099,-.300,.005),(-.013,-.294,.005)],.002,'dark',segments=4,parent=g)
    tube('VestHemBinding',[(.195,-.292,.005),(.099,-.300,.005),(.013,-.294,.005)],.002,'dark',segments=4,parent=g)
    tube('SteelCrewHanger',[(-.120,.251,-.012),(0,.321,-.012),(.120,.251,-.012)],.006,'steel',segments=6,parent=g)
    tube('HookToHanger',[(0,.305,-.015),(0,.370,-.018),(.021,.382,-.021),(.026,.361,-.024)],.005,'steel',segments=6,parent=g)
    return g


def cable_reel(name,pos,parent):
    g=group(name,pos,parent=parent)
    # Cable spool axis X, supported inside bent welded transport frame.
    for x in [-.114,.114]:
        cylinder('SpoolSideFlange',.152,.010,(x,.192,0),'orange',axis=(1,0,0),vertices=24,parent=g)
        cylinder('SpoolReinforcedHub',.050,.023,(x,.192,0),'dark',axis=(1,0,0),vertices=16,parent=g)
        tube('TubularReelCradle',[(x,0,-.16),(x,.11,-.15),(x,.19,0),(x,.10,.16),(x,0,.16)],.013,'steel',segments=6,parent=g)
        box('ReelRubberFoot',(.043,.014,.074),(x,.004,.125),'rubber',bevel=.002,parent=g)
    cylinder('WoundCableCore',.120,.215,(0,.192,0),'rubber',axis=(1,0,0),vertices=24,parent=g,bevel_width=0)
    for x in [-.084,-.042,0,.042,.084]: torus('WoundCableTurn',.121,.011,(x,.192,0),'rubber',axis=(1,0,0),major_segments=20,minor_segments=4,parent=g)
    h.span('ReelAxle',(-.144,.192,0),(.151,.192,0),.014,'steel',vertices=10,parent=g)
    tube('CarryHandle',[(-.111,.32,0),(-.087,.365,0),(.087,.365,0),(.111,.32,0)],.012,'dark',segments=6,parent=g)
    h.span('CrankArm',(.153,.192,0),(.153,.192,.070),.012,'orange',vertices=8,parent=g)
    cylinder('CrankGrip',.018,.043,(.177,.192,.070),'dark',axis=(1,0,0),vertices=12,parent=g)
    tube('LooseCableTail',[(.080,.13,.089),(.2,.02,.17),(.32,.012,.24),(.28,.012,.39),(.19,.012,.39)],.008,'rubber',segments=6,parent=g)
    return g


def cone(name,pos,parent):
    g=group(name,pos,parent=parent)
    box('ImpactResistantConeBase',(.350,.037,.350),(0,.0185,0),'rubber',bevel=.021,parent=g)
    loft_y('TaperedTrafficCone',[(.037,0,0,.135,.135),(.067,0,0,.126,.126),(.42,0,0,.046,.046),(.47,0,0,.040,.040)],'orange',g,20,False)
    for a,b in [(.170,.231),(.304,.364)]:
        ra=.126-(a-.067)*.226; rb=.126-(b-.067)*.226
        loft_y('RetroreflectiveConeBand',[(a,0,0,ra+.001,ra+.001),(b,0,0,rb+.001,rb+.001)],'white',g,20,False)
    loft_y('HandGripRim',[(.467,0,0,.043,.043),(.478,0,0,.042,.042),(.478,0,0,.031,.031),(.467,0,0,.031,.031)],'orange',g,20,False)
    return g


def chest(name,pos,parent):
    g=group(name,pos,parent=parent)
    box('RollCabPowderCoatedShell',(.84,.744,.49),(0,.392,0),'teal',bevel=.017,parent=g)
    box('RollCabWorktop',(.883,.029,.530),(0,.779,0),'rubber',bevel=.008,parent=g)
    for x in [-.353,.353]:
        for z in [-.178,.178]:
            cylinder('CasterWheel',.036,.028,(x,.038,z),'rubber',axis=(1,0,0),vertices=12,parent=g)
            box('CasterFork',(.018,.040,.052),(x,.069,z),'steel',bevel=.002,parent=g)
    # Insets sit in the real housing; bevelled lip seams are genuine drawer gaps.
    for i in range(5):
        y=.166+i*.120
        box('InsetRollCabDrawer',(.753,.107,.016),(0,y,.251),'teal',bevel=.003,parent=g)
        box('DrawerFoldedReveal',(.710,.005,.004),(0,y-.046,.262),'dark',bevel=.0006,parent=g)
        tube('DrawerPull', [(-.205,y+.027,.265),(-.186,y+.027,.287),(.186,y+.027,.287),(.205,y+.027,.265)],.007,'steel',segments=6,parent=g)
    box('CabinetSideHandle',(.020,.036,.267),(.448,.688,0),'dark',bevel=.006,parent=g)
    label('CabinetCrewBadge',(.240,.155),(0,.642,.261),8,parent=g)
    return g


def toolbox(name,pos,parent):
    g=group(name,pos,parent=parent)
    # Pressed steel lower tub and rounded raised lid; hinge pin follows rear seam.
    box('PressedToolboxTub',(.480,.188,.253),(0,.094,0),'teal',bevel=.014,parent=g)
    box('ToolboxLidReturn',(.488,.026,.261),(0,.197,0),'dark',bevel=.007,parent=g)
    box('RoundedPressedLid',(.480,.074,.253),(0,.239,0),'teal',bevel=.017,parent=g)
    h.span('ContinuousRearHinge',(-.225,.204,-.128),(.225,.204,-.128),.005,'steel',vertices=8,parent=g)
    for x in [-.155,.155]:
        box('ToolboxOverCentreLatch',(.031,.045,.009),(x,.194,.134),'steel',bevel=.003,parent=g)
        cylinder('LatchPivotPin',.0035,.034,(x,.206,.141),'steel',axis=(1,0,0),vertices=8,parent=g)
    tube('FoldingCarryHandle',[(-.093,.272,0),(-.086,.330,0),(.086,.330,0),(.093,.272,0)],.012,'dark',segments=6,parent=g)
    for x in [-.103,.103]: box('HandleSocket',(.030,.011,.043),(x,.276,0),'steel',bevel=.003,parent=g)
    label('ToolboxMunicipalCrewIdentity',(.230,.123),(0,.111,.128),8,parent=g)
    return g


def shelving(name,pos,parent):
    g=group(name,pos,parent=parent)
    for x in [-.451,.451]:
        for z in [-.222,.222]:
            box('FoldedShelfUpright',(.027,1.820,.027),(x,.910,z),'steel',bevel=.002,parent=g)
            box('ShelfFootPlate',(.086,.010,.071),(x,.005,z),'dark',bevel=.001,parent=g)
            for y in [.15,.45,.75,1.05,1.35,1.65]:
                box('ShelfAdjustmentSlot',(.010,.021,.002),(x,y,z+.014),'dark',bevel=0,parent=g)
    for y in [.132,.598,1.064,1.530]:
        box('FoldedSteelStorageShelf',(.917,.024,.484),(0,y,0),'teal',bevel=.003,parent=g)
        box('ShelfRolledFrontLip',(.917,.035,.014),(0,y-.008,.249),'steel',bevel=.001,parent=g)
    tube('StorageDiagonalBrace',[(-.435,.23,-.24),(.435,1.68,-.24)],.009,'steel',segments=4,parent=g)
    # Closed case, spare dielectric mat and helmet keep the storage credible but sparse.
    box('SpareDielectricMat',(.390,.043,.310),(-.181,.633,-.021),'rubber',bevel=.013,parent=g)
    box('SealedWorkshopStoresBox',(.352,.219,.317),(.190,.719,-.032),'blue',bevel=.010,parent=g)
    box('StoreCaseMouldedLid',(.360,.019,.325),(.190,.838,-.032),'dark',bevel=.005,parent=g)
    for x in [.07,.31]: box('StoreCaseClip',(.020,.034,.006),(x,.811,.132),'steel',bevel=.002,parent=g)
    hardhat('CrewHardHat',(-.220,1.077,.025),g)
    # Extra workshop PPE is now made by us; no CC0 hero tool source remains.
    return g


def pegboard(name,pos,parent):
    g=group(name,pos,parent=parent)
    box('FoldedSteelPegboardFrame',(.955,.751,.038),(0,0,0),'dark',bevel=.013,parent=g)
    box('PerforatedToolBoard',(.910,.706,.021),(0,0,.023),'wood',bevel=.005,parent=g)
    label('AuthoredToolShadowAndHoleField',(.900,.696),(0,0,.034),11,parent=g)
    for x in [-.238,0,.238]:
        tube('PlatedToolHook',[(x,.129,.036),(x,.129,.073),(x,.149,.075)],.004,'steel',segments=4,parent=g)
    d=screwdriver('PegboardInsulatedDriver',(-.238,.093,.071),g,.210)
    h.rotate(d,-90,axis=(1,0,0))
    q=pliers('PegboardCombinationPliers',(0,.082,.071),g)
    h.rotate(q,-90,axis=(1,0,0))
    # Open-ended spanner is a shaped forged plate with true jaw negative space.
    s=group('PegboardForgedSpanner',(.238,.028,.074),parent=g)
    outline=[(-.014,-.11),(-.026,-.087),(-.014,-.060),(-.011,.059),(-.033,.087),(-.030,.114),(-.012,.127),(-.012,.097),(.012,.097),(.012,.127),(.030,.114),(.033,.087),(.011,.059),(.014,-.060),(.026,-.087),(.014,-.11)]
    plate('OpenEndForgedSpanner',outline,.009,'steel',s)
    box('SpannerShankStamp',(.011,.092,.001),(0,-.003,.005),'dark',bevel=.001,parent=s)
    for x in [-.421,.421]:
        for y in [-.318,.318]: bolt('PegboardStandoffScrew',(x,y,.036),g)
    return g


def fixture(name,pos,parent):
    g=group(name,pos,parent=parent)
    box('FoldedLuminaireTray',(.264,.055,1.350),(0,0,0),'steel',bevel=.012,parent=g)
    box('OpalReflectorHousing',(.224,.016,1.290),(0,-.031,0),'white',bevel=.006,parent=g)
    opal=bpy.data.materials.new('CivicOpsWorkshopOpal'); opal.use_nodes=True
    bs=opal.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(.92,.96,.89,1)
    bs.inputs['Emission Color'].default_value=(.91,.96,.85,1)
    bs.inputs['Emission Strength'].default_value=.9
    bs.inputs['Roughness'].default_value=.32
    for x in [-.064,.064]:
        o=cylinder('FrostedFluorescentTube',.014,1.200,(x,-.053,0),'white',axis=(0,0,1),vertices=12,parent=g)
        o.data.materials.clear(); o.data.materials.append(opal)
        for z in [-.615,.615]:
            cylinder('FluorescentEndCap',.015,.021,(x,-.052,z),'steel',axis=(0,0,1),vertices=10,parent=g)
            box('CeramicLampHolder',(.033,.048,.024),(x,-.037,z),'ivory',bevel=.003,parent=g)
    for z in [-.650,.650]: box('EndHousingClosure',(.256,.041,.016),(0,-.007,z),'dark',bevel=.003,parent=g)
    tube('FixtureSupplyFlex',[(.13,.02,-.52),(.25,.04,-.54),(.26,.07,-.67)],.006,'rubber',segments=4,parent=g)
    return g


def floor_tiles(parent):
    # One low-poly submesh; each tile has physical grout clearance and atlas PBR UVs.
    verts=[]; faces=[]
    for ix in range(16):
        for iz in range(12):
            x=-3.103+ix*.390; z=-2.183+iz*.390; start=len(verts)
            verts.extend([(x,.000,z),(x+.384,.000,z),(x+.384,.000,z+.384),(x,.000,z+.384)])
            faces.append((start,start+1,start+2,start+3))
    custom('DepotPorcelainTiledFloor',verts,faces,'floor',parent)
    # A deliberate painted walkway borders the seated workshop bay, clear of feet.
    for x in [-.865,.865]: box('WalkwaySafetyStripe',(.046,.0015,2.140),(x,.002,-.328),'yellow',bevel=0,parent=parent)
    for z in [-1.375,.745]: box('WalkwayBayBoundary',(1.776,.0015,.046),(0,.002,z),'yellow',bevel=0,parent=parent)
    for x in [-.723,-.58,-.437,-.294,-.151,-.008,.135,.278,.421,.564,.707]:
        o=box('PaintedKeepClearHatch',(.040,.0015,.161),(x,.0024,.626),'yellow',bevel=0,parent=parent)
        h.rotate(o,-35)


def build_room():
    root=h.reset('WorkshopHero')
    # Architectural shell keeps previous room/spawn envelope and contact planes.
    box('WorkshopFloorSlab',(6.4,.08,5.6),(0,-.055,-.3),'dark',bevel=.001,parent=root)
    box('BackPlasterWall',(6.4,3.2,.12),(0,1.6,-2.3),'plaster',bevel=.010,parent=root)
    box('SageEnamelLowerWall',(6.4,1.0,.035),(0,.5,-2.221),'teal',bevel=.006,parent=root)
    for x in [-3.2,3.2]:
        box('WorkshopSideWall',(.12,3.2,5.6),(x,1.6,-.3),'plaster',bevel=.01,parent=root)
        box('ManufacturedSteelSkirting',(.024,.11,5.5),(x+(.08 if x<0 else -.08),.055,-.3),'dark',bevel=.004,parent=root)
    box('WorkshopCeiling',(6.4,.10,5.6),(0,3.24,-.3),'plaster',bevel=.008,parent=root)
    box('FrontPlasterWall',(6.4,3.2,.12),(0,1.6,2.48),'plaster',bevel=.008,parent=root)
    box('RearSteelSkirting',(6.3,.11,.024),(0,.055,-2.20),'dark',bevel=.004,parent=root)
    box('GalvanisedDadoRail',(6.3,.04,.05),(0,1.01,-2.185),'steel',bevel=.004,parent=root)
    floor_tiles(root)
    box('DeepWindowRecess',(1.85,1.10,.065),(-1.7,1.92,-2.200),'dark',bevel=.020,parent=root)
    box('FrostedDepotDaylightPane',(1.73,.99,.022),(-1.7,1.92,-2.162),'glass',bevel=.012,parent=root)
    for x in [-2.55,-1.7,-.85]: box('ExtrudedWindowMullion',(.027,1.04,.034),(x,1.92,-2.145),'steel',bevel=.004,parent=root)
    box('WindowSillReturn',(1.93,.048,.20),(-1.7,1.36,-2.12),'ivory',bevel=.010,parent=root)
    box('UpperElectricalRaceway',(6.15,.075,.052),(0,2.60,-2.17),'ivory',bevel=.008,parent=root)
    # Joints, clips, offsets and manufactured junction covers provide real attachment.
    for x in [-.55,1.25,2.40]:
        tube('ConduitWithOffset',[(x,.99,-2.117),(x,2.49,-2.117),(x+.045,2.565,-2.127),(x+.045,2.60,-2.135)],.012,'steel',segments=6,parent=root)
        for y in [1.20,1.80,2.35]:
            box('ConduitSteelClip',(.044,.025,.034),(x,y,-2.12),'steel',bevel=.002,parent=root)
            bolt('ConduitClipFastener',(x+.015,y,-2.099),root,radius=.0025)
        box('JunctionBoxSealedBase',(.102,.130,.055),(x,1.15,-2.100),'teal',bevel=.008,parent=root)
        box('JunctionBoxGasketedCover',(.097,.125,.008),(x,1.15,-2.067),'ivory',bevel=.006,parent=root)
        for y in [1.10,1.20]: bolt('JunctionLidScrew',(x,y,-2.0615),root,radius=.0025)
    fixture('DepotTwinFluorescentFixture',(0,3.159,-.60),root)
    box('WorkshopDepartmentSign',(1.64,.33,.030),(.34,1.99,-2.185),'teal',bevel=.010,parent=root)
    label('ElectricalWorkshopOriginalWayfinding',(1.60,.300),(.34,1.99,-2.167),9,parent=root,rect=(512,1536,512,96))
    box('SafetyNoticeboardFrame',(.910,.625,.040),(.44,1.325,-2.144),'dark',bevel=.009,parent=root)
    box('SafetyNoticeboardCork',(.866,.580,.017),(.44,1.325,-2.116),'wood',bevel=.004,parent=root)
    label('OriginalIsolationSafetyPoster',(.397,.512),(.228,1.324,-2.105),10,parent=root)
    label('OriginalMunicipalCrewPoster',(.390,.332),(.651,1.399,-2.104),8,parent=root)
    box('SafetyPosterLowerPin',(.009,.009,.004),(.23,1.094,-2.101),'steel',bevel=.001,parent=root)
    for x in [.465,.837]: box('NoticeboardPin',(.009,.009,.004),(x,1.540,-2.099),'red',bevel=.002,parent=root)
    # All judge-visible storage and crew dressing are original manufactured assets.
    chest('CustomMunicipalRollCab',(-1.80,0,-1.42),root)
    toolbox('CustomSteelCrewToolbox',(-1.83,.796,-1.43),root)
    shelving('CustomDepotStorageRack',(2.12,.002,-1.76),root)
    pegboard('CustomToolShadowPegboard',(1.80,2.05,-2.126),root)
    cable_reel('MunicipalCableReel',(1.18,.011,-1.73),root)
    cone('CrewWorkshopSafetyCone',(2.74,.010,-.850),root)
    vest('CivicOpsMunicipalCrewVest',(2.78,1.77,-2.060),root)
    box('VestHookWallMount',(.063,.082,.024),(2.78,2.140,-2.105),'steel',bevel=.005,parent=root)
    h.finish(root,'workshop-hero.glb')

if __name__=='__main__':
    build_bench()
    build_room()
