"""Original Culltron CC0 full-scale Roads street kit. Metres, +Y up, vehicle front +X.
Diorama contact y=0, asphalt y=.025. Movable assets use bottom-contact pivots.
Generic training faces do not reproduce legal road signs. No facial identity detail.
"""
import sys, math, random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
import hero_common as h
OUT=h.OUT

def roads_material():
 if h.MAT:return h.MAT
 m=bpy.data.materials.new('CivicOpsRoadsAtlas');m.use_nodes=True
 t=m.node_tree;b=t.nodes.get('Principled BSDF')
 for suffix,path in [('color',OUT/'roads-color.png'),('orm',OUT/'hero-orm.png'),('normal',OUT/'hero-normal.png')]:
  im=bpy.data.images.load(str(path),check_existing=True);im.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
  tex=t.nodes.new('ShaderNodeTexImage');tex.image=im
  if suffix=='color':t.links.new(tex.outputs['Color'],b.inputs['Base Color'])
  elif suffix=='orm':
   split=t.nodes.new('ShaderNodeSeparateColor');t.links.new(tex.outputs['Color'],split.inputs['Color']);t.links.new(split.outputs['Green'],b.inputs['Roughness']);t.links.new(split.outputs['Blue'],b.inputs['Metallic'])
   group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
   if len(group.interface.items_tree)==0:group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
   ao=t.nodes.new('ShaderNodeGroup');ao.node_tree=group;t.links.new(split.outputs['Red'],ao.inputs['Occlusion'])
  else:
   n=t.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.22;t.links.new(tex.outputs['Color'],n.inputs['Color']);t.links.new(n.outputs['Normal'],b.inputs['Normal'])
 h.MAT=m;return m
h.atlas_material=roads_material

def box(name,dims,pos,sw='ivory',bevel=.0007,parent=None):
 o=h.box(name,dims,pos,sw,0,parent);h.bevel(o,min(bevel,min(dims)*.28),1);h.assign(o,sw);return o

def face(name,size,pos,slot,parent=None,normal=(0,0,1)):
 if abs(normal[0])<.9:return h.label(name,size,pos,slot,parent=parent,normal=normal)
 n=Vector(normal);tangent=Vector((0,0,-1 if n.x>0 else 1));bitangent=n.cross(tangent);center=Vector(pos);w,hh=size
 verts=[tuple(center+tangent*x*w*.5+bitangent*y*hh*.5) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 o=h.mesh(name,verts,[(0,1,2,3)],'white',parent);x=(slot%4)*512;y=512+(slot//4)*512
 for j,uv in enumerate([((x+4)/2048,1-(y+508)/2048),((x+508)/2048,1-(y+508)/2048),((x+508)/2048,1-(y+4)/2048),((x+4)/2048,1-(y+4)/2048)]):o.data.uv_layers.active.data[j].uv=uv
 return o

def closed_profile(name,profile,depth,pos,sw='ivory',parent=None):
 # Continuous extruded panel with authored silhouette and finite thickness.
 verts=[(x+pos[0],y+pos[1],pos[2]+side*depth*.5) for side in [-1,1] for x,y in profile];n=len(profile)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
 faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
 o=h.mesh(name,verts,faces,sw,parent);h.bevel(o,min(.0008,depth*.2),1);h.assign(o,sw);return o

def ring_cone(name,sw,parent=None):
 sections=[(.003,.010),(.006,.010),(.014,.0075),(.019,.0062),(.026,.0045),(.031,.0035),(.035,.0027)]
 # Rings share vertices; two reflective collars use original atlas palette UVs.
 verts=[];faces=[];N=12
 for yy,rr in sections:
  for i in range(N):a=math.tau*i/N;verts.append((math.cos(a)*rr,yy,math.sin(a)*rr))
 for j in range(len(sections)-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;faces.append((a,b,b+N,a+N))
 faces.append(tuple(range(N-1,-1,-1)));faces.append(tuple((len(sections)-1)*N+i for i in range(N)))
 o=h.mesh(name,verts,faces,sw,parent,True)
 for p in o.data.polygons:
  if p.index//N in [2,4]:
   for loop in p.loop_indices:o.data.uv_layers.active.data[loop].uv=(.70,.82)
 return o

def cone():
 root=h.reset('RoadCone');box('WeightedMouldedFoot',(.027,.004,.027),(0,.002,0),'rubber',.0016)
 ring_cone('TaperedReflectiveCone','orange');h.cylinder('ConeTip',.0027,.003,(0,.0365,0),'orange',vertices=12,bevel_width=0)
 h.group('Grip',(0,.025,0));root['contactPlaneY']=0;root.scale=(28.15,20.0,28.15);h.finish(root,'roads-cone.glb')

def delineator():
 root=h.reset('RoadDelineator');box('WeightedFoot',(.025,.004,.027),(0,.002,0),'rubber',.0015)
 closed_profile('TaperedPost',[(-.006,.004),(.006,.004),(.005,.045),(-.005,.045)],.012,(0,0,0),'orange')
 box('ReflectiveFace',(.009,.017,.001),(0,.030,.0067),'white',.0002)
 h.group('Grip',(0,.036,0));root['contactPlaneY']=0;root.scale=(14.0,22.2,7.4);h.finish(root,'roads-delineator.glb')

def barrier():
 root=h.reset('RoadBarrier')
 for x in [-.059,.059]:
  box('RubberAntiSlipFoot',(.015,.005,.016),(x,.0025,0),'rubber',.001)
  h.span('TubularLeg',(x,.005,-.006),(x,.039,0),.0015,'steel',vertices=8)
  h.span('TubularLeg',(x,.005,.006),(x,.039,0),.0015,'steel',vertices=8)
 box('MouldedCrossRail',(.136,.015,.005),(0,.031,0),'orange',.001)
 face('AlternatingTrainingChevron',(.132,.012),(0,.031,.0027),7)
 for x in [-.052,.052]:h.cylinder('RailRivet',.0012,.0054,(x,.031,0),'steel',axis=(0,0,1),vertices=6,bevel_width=0)
 h.group('Grip',(-.45/14.0,.039,0));root['contactPlaneY']=0;root.scale=(14.0,19.1,19.1);h.finish(root,'roads-barrier.glb')

def sign(name,slot):
 root=h.reset(name)
 for z in [-.012,.012]:
  h.span('FoldingStandLeg',(-.012,.0015,z),(-.012,.044,0),.0015,'steel',vertices=8)
  h.span('FoldingStandLeg',(.012,.0015,z),(.012,.044,0),.0015,'steel',vertices=8)
 h.span('StandLowerBrace',(-.012,.013,-.008),(.012,.013,-.008),.0012,'steel',vertices=6)
 box('FoldedSignBack',(.034,.041,.003),(0,.0455,0),'steel',.0025)
 face('GenericTrainingFace',(.031,.038),(0,.0455,.0017),slot)
 h.cylinder('TopStandHinge',.0018,.033,(0,.043,-.003),'steel',axis=(1,0,0),vertices=8)
 h.group('Grip',(0,.054,0));h.group('SignFace',(0,.0455,.0017));root['contactPlaneY']=0
 root.scale=(26.5,24.7,9.5);h.finish(root,'roads-'+('warning' if slot==0 else 'keep-left')+'.glb')

def training_board(parent=None,origin=(0,0,0),size=.028,stem=.040):
 g=h.group('HeldTrainingBoard',origin,parent)
 h.cylinder('BoardHandle',.0015,stem,(0,stem*.5,0),'steel',vertices=8,parent=g)
 box('RoundedBoardRim',(size,size,.002),(0,stem+size*.3,0),'dark',.0027,g)
 for name,slot,zz,normal in [('StopFace',2,.0012,(0,0,1)),('GoFace',3,-.0012,(0,0,-1))]:
  plane=h.group(name,(0,stem+size*.3,zz),g)
  face('GenericBoardMessage',(size-.002,size-.002),(0,0,0),slot,plane,normal)
 return g

def stop_go():
 root=h.reset('StopGoTrainingBoard');box('BoardStandFoot',(.020,.004,.020),(0,.002,0),'rubber',.0015)
 training_board(origin=(0,.004,0),size=.027,stem=.039);root['contactPlaneY']=0
 root.scale=(22.2,23.2,8.0)
 h.group('Grip',(0,.030,0));h.finish(root,'roads-stop-go.glb',exclude=('StopFace','GoFace'))

def vertical_form(name,rings,sw,parent=None,N=10):
 verts=[];faces=[]
 for y,rx,rz in rings:
  for i in range(N):a=math.tau*i/N;verts.append((math.cos(a)*rx,y,math.sin(a)*rz))
 for j in range(len(rings)-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;faces.append((a,b,b+N,a+N))
 faces.extend([tuple(range(N-1,-1,-1)),tuple((len(rings)-1)*N+i for i in range(N))])
 return h.mesh(name,verts,faces,sw,parent,True)

def marshal():
 root=h.reset('RoadMarshal');body=h.group('GenericSafetyFigure')
 for x in [-.0045,.0045]:
  box('MouldedWorkBoot',(.008,.004,.014),(x,.002,.002),'rubber',.0015,body)
  h.span('TailoredTrouserLeg',(x,.004,-.001),(x,.035,0),.0039,'blue',vertices=8,parent=body,radius2=.0051)
  box('TrouserReflectiveBand',(.008,.002,.010),(x,.016,.0007),'white',.0002,body)
 vertical_form('ConnectedTorso',[(.033,.007,.0045),(.038,.0075,.005),(.050,.010,.0055),(.057,.009,.0045),(.060,.004,.003)],'lime',body)
 # Reflective safety vest bands wrap the front; radio rests against the shoulder.
 for x in [-.0045,.0045]:box('VestReflector',(.002,.019,.001),(x,.048,.0055),'white',.0002,body)
 box('VestWaistBand',(.014,.002,.001),(0,.039,.005),'white',.0002,body)
 box('ChestRadio',(.003,.006,.002),(-.006,.054,.006),'dark',.0004,body)
 h.tube('LeftSleeve',[(-.008,.055,0),(-.012,.047,0),(-.010,.037,.005)],.0031,'blue',segments=6,parent=body,resolution=2)
 h.tube('BoardArm',[(.008,.055,0),(.014,.049,.002),(.016,.039,.006)],.0031,'blue',segments=6,parent=body,resolution=2)
 for x,y,z in [(-.010,.037,.005),(.016,.039,.006)]:
  h.cylinder('FeaturelessGlove',.0032,.007,(x,y,z),'ivory',vertices=8,parent=body)
 h.cylinder('Neck',.003,.005,(0,.062,0),'ivory',vertices=8,parent=body)
 vertical_form('FeaturelessHead',[(.063,.0048,.0044),(.065,.0058,.0051),(.073,.0055,.005),(.077,.0037,.0036)],'ivory',body)
 # Plain visor carries no eyes, face detection markings, identity or person label.
 box('BlankProtectiveVisor',(.009,.006,.0015),(0,.070,.005),'glass',.0012,body)
 h.cylinder('SafetyHelmet',.007,.009,(0,.078,0),'yellow',radius2=.0035,vertices=12,parent=body)
 h.cylinder('HelmetBrim',.0085,.0018,(0,.0745,.001),'yellow',vertices=12,parent=body)
 training_board(parent=body,origin=(.016,.016,.008),size=.022,stem=.026)
 h.group('Grip',(0,.050,0));h.group('RefugeContact',(0,0,0));root['contactPlaneY']=0;root['noIdentityFeatures']=True
 root.scale=(15.0,21.8,21.8)
 h.finish(root,'roads-marshal.glb',exclude=('StopFace','GoFace'))

def swept_body(name,sections,sw,parent=None,N=12):
 # Rounded rectangular rings with explicit upper/lower levels, preserving contacts.
 verts=[];faces=[]
 for z,w,up,low,power in sections:
  center=(up+low)*.5;half=(up-low)*.5
  for i in range(N):
   a=math.tau*i/N;ca=math.cos(a);sa=math.sin(a)
   verts.append((w*math.copysign(abs(ca)**(2/power),ca),center+half*math.copysign(abs(sa)**(2/power),sa),z))
 for j in range(len(sections)-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;faces.append((a,b,b+N,a+N))
 faces.extend([tuple(range(N-1,-1,-1)),tuple((len(sections)-1)*N+i for i in range(N))])
 return h.mesh(name,verts,faces,sw,parent,True)

def vehicle(kind,parent=None,origin=(0,0,0)):
 g=h.group('VehicleForm',origin,parent);h.rotate(g,90)
 truck=kind=='bakkie';half=.0186 if truck else .016;length=.052 if truck else .044
 shell='ivory' if truck else 'teal';rad=.0105 if truck else .009
 # Rounded pressed-metal hull and cabin with designed tapered noses and shoulders.
 swept_body('ContinuousPressedBody',[(-length,half*.74,.018,.008,4),(-length*.88,half,.023,.009,4),(length*.65,half,.023,.009,4),(length,half*.80,.017,.008,4)],shell,parent=g)
 for x in [-half,half]:
  for z in [-length*.65,length*.65]:
   h.cylinder('MouldedTyre',rad,.006,(x,rad,z),'rubber',axis=(1,0,0),vertices=12,parent=g,bevel_width=.0006)
   h.cylinder('RecessedAlloyHub',rad*.54,.0064,(x,rad,z),'steel',axis=(1,0,0),vertices=10,parent=g,bevel_width=.0003)
   h.cylinder('WheelAxleCap',rad*.17,.0068,(x,rad,z),'dark',axis=(1,0,0),vertices=8,parent=g,bevel_width=0)
 if truck:
  # Open cargo bed: actual liner, side walls, tailgate thickness and visible rims.
  box('OpenCargoLiner',(.036,.002,.032),(0,.025,-.031),'rubber',.0006,g)
  for x in [-.020,.020]:box('FoldedCargoSide',(.004,.010,.038),(x,.030,-.029),'ivory',.0007,g)
  box('Tailgate',(.040,.010,.003),(0,.030,-.049),'ivory',.0008,g)
  box('TailgateLatch',(.011,.002,.001),(0,.030,-.0507),'dark',.0003,g)
  cab=[(-.012,.017,.026,.022,4),(-.003,.017,.043,.022,4),(.018,.016,.043,.022,4),(.033,.016,.024,.021,4)]
 else:
  cab=[(-.031,.014,.023,.019,4),(-.016,.016,.034,.020,4),(.012,.015,.034,.020,4),(.028,.014,.023,.019,4)]
 swept_body('IntegratedPassengerCabin',cab,shell,parent=g)
 # The sloping glass quadrilateral follows the cabin profile rather than floating.
 if truck:wind=[(-.011,.040,.019),(.011,.040,.019),(.014,.026,.031),(-.014,.026,.031)]
 else:wind=[(-.011,.032,.013),(.011,.032,.013),(.012,.024,.026),(-.012,.024,.026)]
 h.mesh('InsetWindscreen',wind,[(0,1,2,3)],'glass',g)
 for side in [-1,1]:
  xx=side*(.0172 if truck else .0156)
  z0,z1=(-.003,.017) if truck else (-.015,.012)
  yy=.038 if truck else .030
  verts=[(xx,.025,z0),(xx,.025,z1),(xx*.93,yy,z1),(xx*.93,yy,z0)]
  h.mesh('SideWindow',verts,[(0,1,2,3) if side<0 else (3,2,1,0)],'glass',g)
  box('DoorHandle',(.001,.0018,.007),(side*half*.97,.023,.003),'dark',.0002,g)
  h.span('MirrorStem',(side*.017,.030,.020),(side*.019,.030,.020),.0008,'steel',vertices=6,parent=g)
  box('MirrorHousing',(.004,.003,.004),(side*.020,.030,.020),'dark',.0006,g)
 for z in [-length-.0005,length+.0005]:box('WrappedBumper',(.035,.004,.003),(0,.012,z),'steel',.0006,g)
 for x in [-half*.67,half*.67]:
  box('Headlamp',(.007,.004,.001),(x,.020,length*.97),'white',.0005,g)
  box('RearLamp',(.004,.004,.001),(x,.020,-length*.98),'red',.0005,g)
 box('RadiatorInset',(.016,.006,.001),(0,.018,length+.0005),'dark',.0005,g)
 for x in [-.005,0,.005]:box('GrilleSlat',(.001,.005,.0012),(x,.018,length+.001),'steel',.0001,g)
 if truck:
  face('FleetTrainingMark',(.023,.008),(.0221,.025,.007),4,g,normal=(1,0,0))
  box('BeaconSeat',(.012,.002,.008),(0,.0435,.004),'rubber',.0005,g)
  beacon=h.group('Beacon',(0,.045,.004),g)
  h.cylinder('AmberBeaconLens',.0048,.007,(0,.0035,0),'yellow',radius2=.0037,vertices=12,parent=beacon)
  for a in [0,math.pi/2]:h.span('LensMoulding',(-math.cos(a)*.0042,.001,-math.sin(a)*.0042),(math.cos(a)*.0042,.001,math.sin(a)*.0042),.0004,'orange',vertices=6,parent=beacon)
 return g

def bakkie():
 root=h.reset('RoadServicesBakkie');vehicle('bakkie');h.group('Grip',(0,.029,0));h.group('VehicleContact',(0,0,0));root['contactPlaneY']=0;root['forwardAxis']='+X'
 root.scale=(36.5,50.0,41.8)
 h.finish(root,'roads-bakkie.glb',exclude=('Beacon',))

def car():
 root=h.reset('TrafficCar');vehicle('car');h.group('VehicleContact',(0,0,0));root['contactPlaneY']=0;root['forwardAxis']='+X'
 root.scale=(40.9,47.3,48.9)
 h.finish(root,'roads-car.glb')

def building(x,z,w,depth,height,color='plaster'):
 g=h.group('CivicStreetBuilding',(x,.026,z))
 box('MasonryPlinth',(w+.008,.008,depth+.008),(0,.004,0),'steel',.001,g)
 box('RenderedWalls',(w,height,depth),(0,height*.5+.008,0),color,.002,g)
 # Bevelled pitched roof is a continuous extruded pentagon, with real eave thickness.
 closed_profile('PitchedRoof',[(-w*.53,height+.007),(w*.53,height+.007),(w*.53,height+.020),(0,height+.043),(-w*.53,height+.020)],depth+.014,(0,0,0),'teal',g)
 box('DoorRecess',(.018,height*.55,.001),(0,height*.29+.008,depth*.5+.0005),'dark',.0004,g)
 box('DoorFrame',(.021,.003,.003),(0,height*.575+.009,depth*.5+.001),'ivory',.0004,g)
 for xx in [-w*.29,w*.29]:
  box('WindowRecess',(.020,.019,.001),(xx,height*.61+.008,depth*.5+.0005),'glass',.0007,g)
  box('WindowSill',(.024,.002,.004),(xx,height*.61-.002,depth*.5+.001),'ivory',.0003,g)
  box('WindowMullion',(.001,.018,.0015),(xx,height*.61+.008,depth*.5+.001),'steel',.0001,g)
 return g

def tree(x,z,height=.09):
 g=h.group('SculptedStreetTree',(x,.025,z))
 h.cylinder('TaperedTrunk',.003,height*.65,(0,height*.325,0),'wood',radius2=.0019,vertices=6,parent=g)
 for xx,yy,zz,rr in [(-.012,.067,0,.025),(.014,.075,.008,.026),(0,.097,-.004,.024)]:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=rr,location=h.p(xx,yy,zz))
  o=bpy.context.object;o.scale=(1,.9,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);h.attach(o,'AuthoredFacetedCanopy','teal',g)
 box('TreeGrate',(.040,.001,.040),(0,.0006,0),'dark',.001,g)
 for dx in [-.009,0,.009]:box('TreeGrateSlot',(.002,.0003,.035),(dx,.0013,0),'steel',0,g)

def bend_corner():
 # Authored corner planting is a situation-only sight-line occluder, outside the lane.
 corner=h.group('BendOccluder')
 planter=h.group('CornerPlanter',(-.369,.026,-.165),corner)
 box('StonePlantingBed',(.054,.008,.041),(0,.004,0),'plaster',.0015,planter)
 vertical_form('SculptedCornerHedge',[(.008,.020,.014),(.025,.024,.017),(.067,.024,.017),(.103,.022,.016),(.127,.014,.011),(.137,.002,.002)],'teal',planter,N=10)
 for xx in [-.011,.011]:h.span('LivingHedgeStem',(xx,.006,0),(xx*.5,.080,0),.0017,'wood',vertices=6,parent=planter)
 # This optional paint indicates the curved approach of the blind-bend drill.
 points=[(-.395,-.075),(-.387,-.052),(-.373,-.023),(-.352,.007),(-.329,.034),(-.308,.052)]
 verts=[];faces=[]
 for i,(xx,zz) in enumerate(points):
  a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)];dx=b[0]-a[0];dz=b[1]-a[1];ll=math.hypot(dx,dz);ox=-dz/ll*.0015;oz=dx/ll*.0015
  verts.extend([(xx+ox,.0257,zz+oz),(xx-ox,.0257,zz-oz)])
  if i:faces.append((2*i-2,2*i-1,2*i+1,2*i))
 h.mesh('CurvedApproachGuide',verts,faces,'white',corner)
 corner['standardHidden']=True;corner['drill']='blind-bend';return corner

def _street_block(name, dims, pos, sw='floor', bevel=.03, parent=None):
    """Full-scale street construction helper. All dimensions are metres."""
    return box(name, dims, pos, sw, bevel, parent)

def street_scene():
    """Full-scale municipal road scene (metres, +Y up, +X traffic travel).

    The asset intentionally has no tray, presentation base or tabletop. It is a
    walkable 80 m road segment with a 7 m two-lane carriageway, 1:1 trench,
    kerbs, sidewalks, verges, buildings and 8 m streetlights.
    """
    root=h.reset('RoadTrafficZoneStreet')
    # Ground and a long asphalt carriageway. Keep the origin on finished asphalt
    # so the player starts on a real road plane, never inside a plinth.
    _street_block('StreetGround',(92,.18,28),(0,-.09,0),'copper',.04)
    _street_block('AsphaltCarriageway',(82,.10,7.0),(0,.02,0),'floor',.025)
    _street_block('KerbNorth',(82,.22,.32),(0,.16,3.66),'plaster',.04)
    _street_block('KerbSouth',(82,.22,.32),(0,.16,-3.66),'plaster',.04)
    _street_block('SidewalkNorth',(82,.16,3.55),(0,.33,5.58),'plaster',.03)
    _street_block('SidewalkSouth',(82,.16,3.55),(0,.33,-5.58),'plaster',.03)
    # Work excavation: 10 m long x 3 m wide x 0.9 m deep, cut into asphalt.
    _street_block('ExcavationBed',(10,.08,3.0),(13,.05,1.65),'copper',.015)
    _street_block('TrenchNorthWall',(10,.95,.12),(13,-.40,.20),'steel',.01)
    _street_block('TrenchSouthWall',(10,.95,.12),(13,-.40,3.10),'steel',.01)
    _street_block('TrenchEndWest',(0.12,.95,2.9),(7.94,-.40,1.65),'steel',.01)
    _street_block('TrenchEndEast',(0.12,.95,2.9),(18.06,-.40,1.65),'steel',.01)
    # A recessed valve chamber and lid give the water/road work context a real
    # readable depth without adding dynamic shadows.
    _street_block('ValveChamber',(1.6,.04,1.2),(13,.11,1.65),'dark',.02)
    _street_block('ValveLid',(1.3,.06,.9),(13,.16,1.65),'steel',.03)
    # Long lane centre/edge markings, physical paint films at road level.
    for xx in range(-38,39,6):
        _street_block('LaneCentreDash',(3.2,.012,.12),(xx,.085,0),'white',.01)
    for zz in (-3.18,3.18):
        _street_block('RoadEdgePaint',(82,.014,.12),(0,.086,zz),'white',.01)
    # A continuous pedestrian route remains behind the kerb, with crossing stripes.
    for zz in (-5.6,-5.0,-4.4,-3.8):
        _street_block('CrossingStripe',(4.0,.018,.34),(-9,.43,zz),'white',.015)
    # Full-size barriers close the excavation perimeter. They are visual set dressing;
    # grabbable barrier props are placed by the scene at matching dimensions.
    for xx in (8.0,10.0,12.0,14.0,16.0,18.0):
        _street_block('WorkBarrierRail',(1.75,.75,.08),(xx,.56,.12),'orange',.025)
        _street_block('WorkBarrierRail',(1.75,.75,.08),(xx,.56,3.18),'orange',.025)
    for zz in (.8,1.8,2.8):
        _street_block('WorkBarrierEnd',(.08,.75,1.0),(7.98,.56,zz),'orange',.025)
        _street_block('WorkBarrierEnd',(.08,.75,1.0),(18.02,.56,zz),'orange',.025)
    # Two high-visibility refuge bays for marshals, outside live lanes.
    for xx in (4.4,22.0):
        _street_block('MarshalSafeRefugePad',(3.2,.03,1.2),(xx,.45,4.7),'teal',.06)
        _street_block('MarshalRefugeEdge',(3.0,.02,.06),(xx,.48,4.1),'yellow',.01)
        _street_block('MarshalRefugeEdge',(3.0,.02,.06),(xx,.48,5.3),'yellow',.01)
    # Buildings/verges establish a real place to the horizon. They are low-poly
    # silhouettes with authored windows and roofs, not a miniature backdrop.
    # h.p is the only runtime-to-Blender map. A raw (x, up, forward) location
    # puts these houses 10 m in the air. North verge is +Z, south verge is -Z.
    for xx,w,hgt in [(-31,9,5.8),(-18,7,7.2),(26,10,6.2),(39,8,8.0)]:
        g=building(0,0,w/30,4/30,hgt/30,'ivory')
        g.location=h.p((xx,0.0,10.4)); g.scale=(30,30,30)
    for xx,w,hgt in [(-28,8,6.5),(-12,9,5.5),(28,7,7.4),(39,9,6.0)]:
        g=building(0,0,w/30,4/30,hgt/30,'plaster')
        g.location=h.p((xx,0.0,-10.4)); g.scale=(30,30,30)
    # 8 m streetlight poles at a believable 30 m spacing, each with a simple arm.
    for xx in (-34,-4,26):
        for zz in (-5.0,5.0):
            g=h.group('StreetlightPole',(xx,.45,zz))
            h.cylinder('Pole',.11,8.0,(0,4.0,0),'steel',vertices=8,parent=g)
            h.span('LuminaireArm',(0,7.6,0),(0,7.6,-1.3),.08,'steel',vertices=8,parent=g)
            h.cylinder('Luminaire',.18,.45,(0,7.57,-1.45),'yellow',axis=(0,1,0),vertices=8,parent=g)
    # Native-scale verge trees and a distant bend occluder for the blind-bend drill.
    for xx,zz in [(-34,-8.5),(-22,-8.5),(-2,-8.5),(21,-8.5),(34,8.5)]:
        g=h.group('StreetTree',(xx,.45,zz))
        h.cylinder('TreeTrunk',.16,4.0,(0,2,0),'wood',vertices=8,parent=g)
        for ox,oy,oz,rr in [(-.9,4.2,0,1.7),(.8,4.6,.3,1.9),(0,5.2,-.2,1.6)]:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=rr,location=h.p(xx+ox,.45+oy,zz+oz));o=bpy.context.object;h.attach(o,'TreeCanopy','teal',g)
    # Semantic anchors consumed by RoadsTrainingSystem and scale/locomotion tests.
    for name,pos in [('RoadPlane',(0,.10,0)),('WorkArea',(13,.10,1.65)),('PedestrianRoute',(0,.42,5.58)),('AdvanceApproach',(-30,.10,0)),('UpstreamRefuge',(4.4,.45,4.7)),('DownstreamRefuge',(22,.45,4.7))]:
        h.group(name,pos)
    root['author']='Culltron CivicOps';root['license']='CC0-1.0';root['contactPlaneY']=0
    root['scaleMeters']={'laneWidth':3.5,'carriagewayWidth':7.0,'trenchLength':10.0,'trenchDepth':0.9,'streetlightHeight':8.0}
    root['trainingObjectsOnly']=True
    bend=h.group('BendOccluder',(34,.45,0));_street_block('BendSafetyWall',(2.0,3.5,2.0),(0,1.75,0),'plaster',.12,bend)
    root['standardHidden']=True;root['drill']='blind-bend'
    from street_realism import enhance
    templates=enhance(root,'roads')
    h.finish(root,'roads-street.glb',exclude=templates)

if __name__=='__main__':
    only=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if not only or 'street' in only: street_scene()
    if not only:
        cone();delineator();barrier();sign('RoadAdvanceWarning',0);sign('RoadKeepLeft',1);stop_go();marshal();bakkie();car()
