"""Original Culltron CC0 miniature water network, built for seated hand reach.
Origin is the bench-contact plane; +Y up, +Z toward trainee; metres.
All fixed manufactured parts merge to one atlas mesh. Covers and dial retain pivots.
"""
import sys, math, random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import hero_common as h
from mathutils import Vector

OUT=h.OUT
SEATS={'A':(-.32,.078,.055),'B':(.32,.078,.055),'C':(.32,.078,-.205),'D':(-.32,.078,-.205)}

def water_material():
 if h.MAT:return h.MAT
 m=bpy.data.materials.new('CivicOpsWaterAtlas');m.use_nodes=True
 tree=m.node_tree;bsdf=tree.nodes.get('Principled BSDF')
 for suffix,path,socket in [('color',OUT/'water-color.png','Base Color'),('orm',OUT/'hero-orm.png',None),('normal',OUT/'hero-normal.png',None)]:
  img=bpy.data.images.load(str(path),check_existing=True);img.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
  tex=tree.nodes.new('ShaderNodeTexImage');tex.image=img
  if socket:tree.links.new(tex.outputs['Color'],bsdf.inputs[socket])
  elif suffix=='orm':
   split=tree.nodes.new('ShaderNodeSeparateColor');tree.links.new(tex.outputs['Color'],split.inputs['Color']);tree.links.new(split.outputs['Green'],bsdf.inputs['Roughness']);tree.links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
   group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
   if len(group.interface.items_tree)==0:group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
   ao=tree.nodes.new('ShaderNodeGroup');ao.node_tree=group;tree.links.new(split.outputs['Red'],ao.inputs['Occlusion'])
  else:
   n=tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.35;tree.links.new(tex.outputs['Color'],n.inputs['Color']);tree.links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
 h.MAT=m;return m
h.atlas_material=water_material

def fast_box(name,dims,pos,swatch='steel',bevel=.0008,parent=None):
 o=h.box(name,dims,pos,swatch,0,parent)
 h.bevel(o,min(bevel,min(dims)*.3),1);h.assign(o,swatch);return o
def cap(name,pos,letter):
 cover=h.group(name,pos);h.cylinder('DuctileCover',.035,.005,(0,.0005,0),'steel',vertices=24,parent=cover)
 h.torus('RaisedLiftingEye',.007,.0018,(0,.005,0),'dark',axis=(0,1,0),major_segments=12,minor_segments=4,parent=cover)
 for x in [-.021,.021]:fast_box('AntiSlipRib',(.005,.0015,.041),(x,.0035,0),'dark',.0003,cover)
 h.label('CoverLetter',(.021,.021),(.0,.0033,.012),{'A':1,'B':2,'C':3,'D':4}[letter],normal=(0,1,0),parent=cover)
 return cover

def ground():
 # Full-scale municipal road: two 3.5 m lanes plus shoulders, extending to a 80 m horizon.
 # Construction uses compact source coordinates, then bakes a 10x conversion into
 # the exported metre geometry; no miniature root scale remains at runtime.
 # The carriageway is continuous. Only the burst cut stays open (about 5 m by 3.6 m).
 for x in [-.425, .425]:
  fast_box('FullScaleAsphalt',(.35,.006,8.0),(x,.0705,0),'dark',.001)
 for z in (-2.09, 2.09):
  fast_box('CentreApproachAsphalt',(.50,.006,3.82),(0,.0705,z),'dark',.001)
 # Floor of the cut, 0.52 m below the road datum after the 10x bake and root offset.
 fast_box('ExcavationFloor',(.48,.008,.34),(0,.018,0),'copper',.001)
 for i in range(-8, 9):
  if abs(i) <= 1: continue
  fast_box('CentreLineDash',(.012,.0015,.16),(0,.075,i*.46),'ivory',.0002)
 for x in [-.72,.72]:
  fast_box('RoadKerb',(.025,.12,8.0),(x,.035,0),'plaster',.002)
  fast_box('RoadShoulder',(.22,.008,8.0),(x + (-.12 if x < 0 else .12),.0705,0),'copper',.002)
 # Lane markings and edge lines read at standing height while staying low-poly.
 for x in [-.245, .245]:
  for z in [i*.46 for i in range(-17,18) if i not in (-1,0,1)]:
   fast_box('DashedCentreMark',(.012,.0015,.16),(x,.075,z),'ivory',.0002)
 for x in [-.69,.69]: fast_box('EdgeLine',(.008,.0015,8.0),(x,.075,0),'ivory',.0002)
 # Verge and distant suburban masses establish scale and a horizon without a sky texture.
 for x in [-1.12,1.12]:
  fast_box('GrassVerge',(.55,.16,8.0),(x,-.005,0),'copper',.01)
  for z in [-3.3,-1.1,1.1,3.3]:
   fast_box('SuburbanWall',(.42,.75,.72),(x + (-.15 if x < 0 else .15),.36,z),'ivory',.012)
   fast_box('SuburbanRoof',(.47,.10,.77),(x + (-.15 if x < 0 else .15),.785,z),'red',.01)
 # Ten metre streetlight poles with short outreach arms and compact luminaires.
 for x in [-.63,.63]:
  for z in [-2.8,1.8]:
   h.cylinder('StreetlightPole',.026,.92,(x,.53,z),'steel',vertices=10)
   h.span('StreetlightArm',(x,.97,z),(x + (-.075 if x < 0 else .075),.97,z),.012,'steel',vertices=8)
   fast_box('StreetlightLuminaire',(.10,.035,.04),(x + (-.10 if x < 0 else .10),.955,z),'yellow',.008)
 # A compact synthetic water-services marker anchors the approach to the work zone.
 fast_box('RoadsideMarker',(.05,.24,.03),(.55,.18,-.75),'yellow',.004)
 h.label('WaterServicesMarker',(.11,.12),(.55,.27,-.765),9,normal=(0,1,0))

def pipe_network():
 # A ruptured ductile main with mechanically plausible flange sleeves and exposed walls.
 for a,b in [(-.246,.014),(.05,.246)]:h.span('DuctileMain',(a,.037,0),(b,.037,0),.020,'blue',vertices=20)
 for x in [-.18,.12]:
  h.cylinder('FlangeCoupling',.026,.018,(x,.037,0),'steel',axis=(1,0,0),vertices=20)
  h.torus('FlangeLip',.024,.002,(x-.009,.037,0),'dark',axis=(1,0,0),major_segments=20,minor_segments=4)
  for i in range(6):
   a=math.tau*i/6;h.cylinder('FlangeBolt',.0024,.023,(x,.037+math.cos(a)*.025,math.sin(a)*.025),'steel',axis=(1,0,0),vertices=6,bevel_width=0)
 for x in [.013,.051]:h.torus('BrokenPipeWall',.0178,.0022,(x,.037,0),'dark',axis=(1,0,0),major_segments=20,minor_segments=4)
 h.mesh('RuptureLip',[(.015,.058,-.009),(.024,.062,-.008),(.036,.053,-.006),(.047,.060,-.008),(.051,.053,.009),(.038,.061,.006),(.023,.054,.009)],[(0,1,2),(2,3,4),(2,4,5),(0,2,6)],'blue')
 for letter,(x,y,z) in SEATS.items():
  h.cylinder('SurfaceBoxLip'+letter,.040,.004,(x,.0765,z),'dark',vertices=24)
  h.cylinder('SurfaceBoxRecess'+letter,.031,.011,(x,.070,z),'rubber',vertices=20)
  h.cylinder('BronzeValveBonnet'+letter,.010,.012,(x,.076,z),'copper',vertices=12)
  fast_box('SquareOperatingNut'+letter,(.010,.009,.010),(x,.078,z),'steel',.0007)
  h.group('ValveSeat'+letter,(x,y,z));h.group('ValveSpindle'+letter,(x,y,z))
  cap('ValveCover'+letter,(x,.081,z),letter)
  h.label('ValveGroundID'+letter,(.043,.04),(x-.065,.0757,z),{'A':1,'B':2,'C':3,'D':4}[letter],normal=(0,1,0))
 h.group('BurstOutlet',(.035,.049,0));h.group('WaterJetOrigin',(.035,.049,0));h.group('PoolSurface',(0,.076,.13))
 # Exposed branch diagram inside the cutaway shows the alternative isolation loop.
 h.tube('AlternativeBranch',[(-.245,.034,0),(-.267,.034,-.055),(0,.034,-.055),(.268,.034,-.055),(.245,.034,0)],.008,'teal',segments=6,resolution=2)

def shoring():
 for z in [-.102,.102]:
  for y in [.029,.048,.066]:fast_box('TrenchBoxPanel',(.51,.017,.009),(0,y,z),'teal',.001)
  for x in [-.235,-.09,.09,.235]:
   fast_box('TrenchBoxPost',(.014,.066,.019),(x,.047,z),'steel',.001)
   for y in [.025,.068]:h.cylinder('PanelPin',.003,.020,(x,y,z),'steel',axis=(0,0,1),vertices=8,bevel_width=0)
 for x in [-.18,.175]:h.span('TrenchStrut',(x,.051,-.102),(x,.051,.102),.005,'steel',vertices=8)
 # Ladder leans against the right end and rises above the edge for a real handhold.
 a=(.186,.023,-.012);b=(.221,.119,-.012)
 for zz in [-.018,.018]:h.span('LadderRail',(a[0],a[1],zz),(b[0],b[1],zz),.003,'orange',vertices=8)
 for i in range(7):
  if i==6:continue
  t=i/8;xx=a[0]+(b[0]-a[0])*t;yy=a[1]+(b[1]-a[1])*t
  h.span('LadderNonSlipRung',(xx,yy,-.018),(xx,yy,.018),.0025,'steel',vertices=8)
 # Spoil is visibly outside the trench exclusion rim, along the rear verge.
 rng=random.Random(125)
 for i in range(9):
  x=-.035+rng.uniform(-.09,.09);z=-.257+rng.uniform(-.007,.007);r=rng.uniform(.014,.026)
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=r,location=h.p(x,.091+r*.25,z))
  o=bpy.context.object;o.scale=(1.5,1,.55);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);h.attach(o,'SetBackSpoil','copper')
 h.group('TrenchEntry',(.215,.09,.015))
 entry=h.group('TrenchEntryTarget',(.215,.09,.015))
 h.span('UpperLadderEntryRung',(-.00275,.005,-.033),(-.00275,.005,.003),.0025,'steel',vertices=8,parent=entry)
 fast_box('EntrySafetyPlate',(.060,.004,.052),(.025,0,0),'yellow',.002,entry)
 for z in [-.018,.018]:h.span('PlateMountingBracket',(.044,-.015,z),(.044,-.002,z),.002,'steel',vertices=8,parent=entry)
 h.mesh('EmbossedBootEntrySymbol',[(.018,.0022,-.017),(.032,.0022,-.017),(.035,.0022,-.011),(.031,.0022,.014),(.026,.0022,.020),(.019,.0022,.011)],[(5,4,3,2,1,0)],'dark',entry)
 h.group('ShoringTarget',(0,.068,.105));h.group('LadderTarget',(.215,.095,0));h.group('ShoringCheck',(0,.068,.105));h.group('LadderCheck',(.215,.095,0));h.group('SpoilCheck',(0,.11,-.255));h.group('AtmosphereCheck',(-.08,.052,.0))

def pressure_and_washout():
 x=.16;z=.208
 fast_box('GaugePedestal',(.025,.020,.031),(x,.085,z),'teal',.002)
 h.cylinder('GaugePipe',.006,.041,(x,.112,z),'copper',vertices=10)
 h.cylinder('PressureGaugeBody',.034,.013,(x,.145,z),'steel',axis=(0,0,1),vertices=28)
 h.torus('GaugeBezel',.032,.003,(x,.145,z+.007),'steel',major_segments=28,minor_segments=5)
 h.label('GaugeFace',(.060,.060),(x,.145,z+.0073),6)
 dial=h.group('PressureNeedle',(x,.145,.216));h.mesh('GaugePointer',[(-.0016,-.005,0),(.0016,-.005,0),(.001,.020,0),(0,.025,0),(-.001,.020,0)],[(0,1,2,3,4)],'red',dial)
 h.cylinder('GaugeHub',.0038,.001,(0,0,.0008),'dark',axis=(0,0,1),vertices=12,parent=dial,bevel_width=0)
 h.group('PressureGaugeFace',(x,.145,.217));h.group('GaugeNeedle',(x,.145,.216))
 x=-.13;z=.213
 h.cylinder('WashoutBase',.023,.012,(x,.081,z),'steel',vertices=16)
 h.cylinder('HydrantBarrel',.012,.047,(x,.109,z),'teal',vertices=16)
 h.cylinder('HydrantDome',.015,.013,(x,.136,z),'teal',radius2=.008,vertices=16)
 h.cylinder('WashoutOutlet',.009,.018,(x,.107,z+.016),'copper',axis=(0,0,1),vertices=12)
 h.torus('OutletThread',.009,.001,(x,.107,z+.026),'steel',major_segments=12,minor_segments=4)
 wheel=h.group('WashoutHandle',(x,.150,z))
 h.cylinder('WashoutStem',.003,.006,(0,-.005,0),'steel',vertices=8,parent=wheel)
 h.torus('WashoutHandwheel',.014,.002,(0,0,0),'red',axis=(0,1,0),major_segments=16,minor_segments=4,parent=wheel)
 for a in [0,math.pi/2]:h.span('WheelSpoke',(-math.cos(a)*.013,0,-math.sin(a)*.013),(math.cos(a)*.013,0,math.sin(a)*.013),.0015,'red',vertices=6,parent=wheel)
 h.group('WashoutSeat',(x,.150,z));h.group('WashoutTarget',(x,.150,z));h.label('WashoutPlate',(.045,.034),(x-.066,.0758,z),10,normal=(0,1,0))

def apply_runtime_scale(root, factor=10):
 # Apply the source-to-runtime metre conversion to each direct child. Keeping the
 # exported root at identity makes bounds and scene placement honest to tools that
 # do not evaluate inherited transforms (and prevents a hidden tabletop scale).
 # Blender's transform operator propagates the root matrix through nested empties,
 # preserving articulated pivots while baking positions, scales and mesh bounds.
 descendants=[root, *list(root.children_recursive)]
 # Apply parents before descendants so each nested pivot receives the converted
 # world transform once, then clear every residual scale on the authored nodes.
 for obj in descendants:
  bpy.context.view_layer.objects.active=obj
  bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)

def pump():
 g=h.group('PortablePump',(-.17,.076,-.210))
 for x in [-.028,.028]:
  h.tube('PumpProtectiveFrame',[(x,.001,-.030),(x,.052,-.030),(x,.066,0),(x,.052,.031),(x,.001,.031)],.003,'dark',segments=6,parent=g,resolution=2)
 fast_box('PumpEngine',(.031,.028,.040),(-.008,.027,0),'steel',.004,g)
 h.cylinder('PumpCasing',.018,.026,(.016,.030,.006),'teal',axis=(1,0,0),vertices=16,parent=g)
 h.cylinder('HoseCoupler',.006,.016,(.016,.029,.026),'copper',axis=(0,0,1),vertices=10,parent=g)
 fast_box('FuelTank',(.032,.013,.024),(-.008,.048,-.005),'red',.004,g)
 h.cylinder('FuelCap',.004,.002,(-.008,.056,-.005),'dark',vertices=10,parent=g)
 h.tube('DischargeHose',[(.016,.029,.033),(.046,.02,.055),(.091,.0,.044),(.097,-.030,.16)],.004,'rubber',segments=6,parent=g,resolution=3)
 for i in range(4):fast_box('EngineCoolingFin',(.033,.002,.032),(-.008,.018+i*.004,0),'dark',.0003,g)

def bakkie():
 g=h.group('WaterServicesBakkieEdge',(.075,.095,-.224))
 # Continuous formed lower body and cargo bed with folded rims, not stacked cubes.
 h.loft('FormedBody',[(-.049,.065,.018,-.008,4),(-.043,.073,.021,-.013,4),(.043,.073,.021,-.013,4),(.05,.062,.018,-.008,4)],'ivory',segments=12,parent=g)
 for x in [-.066,.066]:fast_box('CargoBedSide',(.007,.027,.080),(x,.028,0),'ivory',.002,g)
 fast_box('Tailgate',(.13,.027,.006),(0,.028,.042),'ivory',.002,g)
 fast_box('CargoBedLiner',(.125,.004,.073),(0,.024,0),'dark',.001,g)
 fast_box('TailgateHandle',(.025,.005,.002),(0,.030,.046),'dark',.001,g)
 for x in [-.07,.07]:
  for z in [-.03,.03]:
   h.cylinder('VehicleTyre',.019,.010,(x,.001,z),'rubber',axis=(1,0,0),vertices=16,parent=g)
   h.cylinder('WheelHub',.009,.011,(x,.001,z),'steel',axis=(1,0,0),vertices=12,parent=g)
 fast_box('Bumper',(.15,.008,.008),(0,-.002,.052),'steel',.002,g)
 for x in [-.055,.055]:fast_box('TailLight',(.011,.012,.003),(x,.020,.047),'red',.001,g)
 h.label('MunicipalFleetMark',(.053,.022),(.032,.031,.0461),8,parent=g)
def ppe():
 g=h.group('PPETray',(-.317,.078,.222));fast_box('TrayBase',(.19,.003,.09),(0,.0015,0),'dark',.003,g)
 # Tall rubber boots: continuous toe/ankle/calf profiles and moulded sole.
 for x in [-.065,-.028]:
  boot=h.group('Gumboot',(x,.003,.0),g)
  h.loft('MouldedBoot',[(-.025,.013,.022,0,3),(-.016,.014,.048,0,3),(.009,.015,.051,0,3),(.025,.014,.016,0,3),(.032,.010,.013,0,3)],'rubber',segments=10,parent=boot)
  fast_box('HeavySole',(.029,.004,.057),(0,.002,.004),'dark',.002,boot)
  h.torus('BootCuff',.013,.0016,(0,.049,-.004),'yellow',axis=(0,1,0),major_segments=12,minor_segments=4,parent=boot)
 # A real curved hard-hat shell with brim and crown ribs.
 hat=h.group('HardHat',(.055,.003,.005),g);verts=[];faces=[];segments=20
 for r,y in [(.001,.025),(.012,.023),(.024,.015),(.029,.003)]:
  for i in range(segments):a=math.tau*i/segments;verts.append((math.cos(a)*r,y,math.sin(a)*r*.88))
 for j in range(3):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.append(tuple(range(segments-1,-1,-1)))
 h.mesh('HardHatShell',verts,faces,'yellow',hat,True)
 h.cylinder('HardHatBrim',.034,.003,(0,.001,0),'yellow',vertices=20,parent=hat)
 h.tube('CrownRib',[(-.019,.011,0),(0,.026,0),(.019,.011,0)],.0013,'yellow',segments=6,parent=hat,resolution=2)
 # Pair of fitted work gloves; connected palm and individually tapered finger lofts.
 for x,z in [(.012,-.023),(.02,.022)]:
  glove=h.group('Glove',(x,.004,z),g)
  h.loft('GlovePalm',[(-.015,.009,.006,0,3),(-.008,.014,.008,0,3),(.010,.013,.007,0,3),(.017,.009,.005,0,3)],'lime',segments=8,parent=glove)
  for i in range(4):
   xx=-.010+i*.0068;h.tube('GloveFinger',[(xx,.004,.012),(xx,.004,.024),(xx,.004,.031-abs(i-1)*.003)],.0026,'lime',segments=6,parent=glove,resolution=1)
  h.tube('GloveThumb',[(-.010,.004,.0),(-.020,.004,.008),(-.020,.004,.015)],.0033,'lime',segments=6,parent=glove,resolution=1)

def water_road():
 root=h.reset('WaterStreetEnvironment');ground();pipe_network();shoring();pressure_and_washout();pump();bakkie();ppe()
 h.group('BarrierSeat',(0,.075,.13));h.group('SignSeat',(.25,.075,.145));h.group('SchematicSeat',(0,.09,.233))
 # Enlarge authored construction to real metres, then put the asphalt datum at world Y=0.
 # The original cover line is local Y=.0705; this yields a 0.52 m visible excavation depth.
 # hero_common stores Blender coordinates directly on the root empty: Blender Z
 # is runtime Y after export, so this lowers the authored road datum to runtime
 # Y=0 while keeping the approach road centred along runtime Z.
 root.scale=(10,10,10); root.location.z=-.705
 apply_runtime_scale(root)
 root['author']='Culltron CivicOps';root['license']='CC0-1.0';root['metresPerModelMetre']=1;root['scaleApplied']=10;root['sceneKind']='full-scale suburban water road';root['roadWidthMetres']=14;root['laneWidthMetres']=3.5;root['trenchDepthMetres']=.52;root['horizonMetres']=80;root['contactPlaneY']=0
 from street_realism import enhance
 templates=enhance(root,'water')
 h.finish(root,'water-road.glb',exclude=templates+tuple('ValveCover'+l for l in SEATS)+('PressureNeedle','WashoutHandle','TrenchEntryTarget'))

def key():
 root=h.reset('WaterValveKey');h.group('KeyTip',(0,0,0))
 # Steel socket, hollow square entry and welded T-bar with rubber end grips.
 for x in [-.007,.007]:fast_box('SquareSocketWall',(.003,.013,.017),(x,.0065,0),'steel',.0005)
 for z in [-.007,.007]:fast_box('SquareSocketWall',(.011,.013,.003),(0,.0065,z),'steel',.0005)
 h.cylinder('ValveKeyShaft',.0045,.153,(0,.091,0),'steel',vertices=12)
 h.cylinder('TBarWeld',.008,.013,(0,.165,0),'dark',vertices=12)
 h.cylinder('TBar',.0055,.164,(0,.171,0),'steel',axis=(1,0,0),vertices=12)
 for x in [-.067,.067]:
  h.cylinder('RubberGrip',.007,.029,(x,.171,0),'rubber',axis=(1,0,0),vertices=12)
  for offset in [-.008,0,.008]:h.torus('GripRib',.007,.0005,(x+offset,.171,0),'dark',axis=(1,0,0),major_segments=12,minor_segments=4)
 root.scale=(10,10,10);root.location.y=0;apply_runtime_scale(root);root['scaleApplied']=10;root['assetMetres']='full-scale';h.finish(root,'water-valve-key.glb')

def barrier():
 root=h.reset('WaterBarrier');w=.25
 for x in [-w*.5,w*.5]:
  h.cylinder('FencePost',.004,.114,(x,.064,0),'orange',vertices=10)
  fast_box('FenceFoot',(.050,.014,.055),(x,.007,0),'rubber',.003)
  h.cylinder('PostCap',.005,.005,(x,.123,0),'steel',vertices=10)
 for y in [.043,.113]:h.span('FenceRail',(-w*.5,y,0),(w*.5,y,0),.0025,'steel',vertices=8)
 # Welded wire mesh built as ribbons gives a convincing grid for two triangles per wire.
 verts=[];faces=[]
 def wire(a,b,r=.00065):
  n=len(verts);dx=b[0]-a[0];dy=b[1]-a[1];ll=math.hypot(dx,dy);ox=-dy/ll*r;oy=dx/ll*r
  verts.extend([(a[0]+ox,a[1]+oy,.0001),(a[0]-ox,a[1]-oy,.0001),(b[0]-ox,b[1]-oy,.0001),(b[0]+ox,b[1]+oy,.0001)]);faces.append((n,n+1,n+2,n+3))
 for i in range(17):xx=-.12+i*.015;wire((xx,.043),(xx,.113))
 for i in range(6):yy=.043+i*.014;wire((-.12,yy),(.12,yy))
 h.mesh('WeldedMeshFence',verts,faces,'steel')
 fast_box('ReflectiveHazardBand',(.216,.012,.003),(0,.109,.003),'yellow',.0003)
 for x in [-.08,-.04,0,.04,.08]:
  h.mesh('HazardStripe',[(x-.009,.103,.005),(x+.001,.103,.005),(x+.009,.115,.005),(x-.001,.115,.005)],[(0,1,2,3)],'dark')
 h.group('BarrierGrip',(0,.117,0));root.scale=(10,10,10);root.location.y=0;apply_runtime_scale(root);root['scaleApplied']=10;root['assetMetres']='full-scale';h.finish(root,'water-barrier.glb')

def sign():
 root=h.reset('WaterExcavationSign')
 for z in [-.026,.026]:
  for x in [-.024,.024]:h.span('FoldingLeg',(x,0,z),(x,.083,0),.0025,'steel',vertices=8)
 fast_box('WarningPanel',(.09,.09,.004),(0,.086,.001),'yellow',.004)
 h.label('TrilingualExcavationWarning',(.085,.085),(0,.086,.0033),5)
 h.cylinder('HingeBar',.003,.058,(0,.097,0),'steel',axis=(1,0,0),vertices=10)
 h.group('SignGrip',(0,.13,0));root.scale=(10,10,10);root.location.y=0;apply_runtime_scale(root);root['scaleApplied']=10;root['assetMetres']='full-scale';h.finish(root,'water-sign.glb')

if __name__=='__main__':
 extra=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 selected=set(extra) or {'road','key','barrier','sign'}
 if 'road' in selected: water_road()
 if 'key' in selected: key()
 if 'barrier' in selected: barrier()
 if 'sign' in selected: sign()
