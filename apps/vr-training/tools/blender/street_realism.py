"""Original South African streetscape kit. Metres, runtime +Y up, vehicles +Z.
Scanned CC0 road/plaster, original trim atlas, mesh-baked vertex AO. No brands.
"""
import bpy, bmesh, math, random
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
BUILD=Path(__file__).resolve().parents[2]/'artifacts/street-build'
MATS={};ROOT=None;KIND='';RNG=random.Random(1910)
COLORS={'plaster':0,'green':1,'terracotta':2,'block':3,'roof':4,'rust':5,'steel':6,'glass':7,'paint':8,'tyre':9,'dark':10,'white':11,'leaf':12,'soil':13,'shop':14,'fabric':15}
def p(x,y,z):return Vector((x,-z,y))
def mat(name):
 if name in MATS:return MATS[name]
 m=bpy.data.materials.new(name);m.use_nodes=True;t=m.node_tree;b=t.nodes.get('Principled BSDF')
 for suffix in ['color','normal','orm']:
  im=bpy.data.images.load(str(BUILD/(name+'-'+suffix+'.png')),check_existing=True);im.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color'
  tex=t.nodes.new('ShaderNodeTexImage');tex.image=im
  if suffix=='color':
   t.links.new(tex.outputs['Color'],b.inputs['Base Color'])
   if name=='street-trim':t.links.new(tex.outputs['Alpha'],b.inputs['Alpha'])
  elif suffix=='normal':
   n=t.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65;t.links.new(tex.outputs['Color'],n.inputs['Color']);t.links.new(n.outputs['Normal'],b.inputs['Normal'])
  else:
   s=t.nodes.new('ShaderNodeSeparateColor');t.links.new(tex.outputs['Color'],s.inputs['Color']);t.links.new(s.outputs['Green'],b.inputs['Roughness']);t.links.new(s.outputs['Blue'],b.inputs['Metallic'])
   g=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
   if not len(g.interface.items_tree):g.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
   ao=t.nodes.new('ShaderNodeGroup');ao.node_tree=g;t.links.new(s.outputs['Red'],ao.inputs['Occlusion'])
 MATS[name]=m;return m
def assign(o,tile='plaster',road=False):
 original_slots=[slot.name.rsplit('_',1)[-1] for slot in o.data.materials]
 o.data.materials.clear();o.data.materials.append(mat('street-asphalt' if road else 'street-trim'))
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap');idx=COLORS[tile] if isinstance(tile,str) else 0
 for f in o.data.polygons:
  if isinstance(tile,dict):idx=COLORS[tile.get(original_slots[min(f.material_index,len(original_slots)-1)],'steel')]
  f.material_index=0
  axis=max(range(3),key=lambda a:abs(f.normal[a]));axes=[a for a in range(3) if a!=axis]
  coords=[o.data.vertices[o.data.loops[j].vertex_index].co for j in f.loop_indices]
  lo=[min(v[a] for v in coords) for a in axes];hi=[max(v[a] for v in coords) for a in axes]
  for j,v in zip(f.loop_indices,coords):
   if road:
    w=o.matrix_world@v;uv.data[j].uv=(w.x/3,w.y/3)
   else:
    u=(v[axes[0]]-lo[0])/max(hi[0]-lo[0],1e-6);vv=(v[axes[1]]-lo[1])/max(hi[1]-lo[1],1e-6)
    uv.data[j].uv=((idx%4+.015+u*.97)/4,1-(idx//4+.015+vv*.97)/4)
 return o
def adopt(o,name,tile):
 o.name=name;o.parent=ROOT;o.matrix_parent_inverse=ROOT.matrix_world.inverted();assign(o,tile);return o
def box(name,dims,pos,tile='plaster',bevel=.015):
 # Native mesh construction avoids thousands of dependency-graph operator updates.
 w,h,d=[n/2 for n in dims]
 verts=[(-w,-h,-d),(w,-h,-d),(w,h,-d),(-w,h,-d),(-w,-h,d),(w,-h,d),(w,h,d),(-w,h,d)]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
 me=bpy.data.meshes.new(name);me.from_pydata([p(*v) for v in verts],[],faces);me.update()
 if bevel and min(dims)>.09:
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(dims)*.25),segments=1,affect='EDGES');bm.normal_update();bm.to_mesh(me);bm.free();me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=p(*pos)
 return adopt(o,name,tile)
def mesh(name,verts,faces,tile='plaster'):
 me=bpy.data.meshes.new(name);me.from_pydata([p(*v) for v in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return adopt(o,name,tile)
def span(name,a,b,r,tile='steel',n=8,r2=None):
 a,b=p(*a),p(*b);direction=(b-a).normalized();tangent=direction.orthogonal().normalized();bitangent=direction.cross(tangent);center=(a+b)/2
 verts=[]
 for point,radius in [(a,r),(b,r if r2 is None else r2)]:
  for j in range(n):verts.append(point-center+radius*(tangent*math.cos(j*math.tau/n)+bitangent*math.sin(j*math.tau/n)))
 faces=[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]+[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=center
 for f in me.polygons:f.use_smooth=f.index<n
 return adopt(o,name,tile)
def ellipsoid(name,pos,scale,tile='leaf'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=p(*pos));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return adopt(o,name,tile)
def at(u,y,v):return (u,y,v) if KIND=='roads' else (v,y,-u)
def sb(name,dims,pos,tile='plaster',bevel=.015):
 if KIND!='roads':dims=(dims[2],dims[1],dims[0])
 return box(name,dims,at(*pos),tile,bevel)
def ss(name,a,b,r,tile='steel',n=8):return span(name,at(*a),at(*b),r,tile,n)
def building(u,v,width,depth,height,tile,shop=False):
 side=1 if v>0 else -1;front=v-side*depth/2
 sb('DistrictPlasteredWalls',(width,height,depth),(u,height/2,v),tile,.035)
 sb('DistrictDampPlinth',(width,.34,.10),(u,.17,front-side*.025),'block')
 # Pitched corrugated roof: continuous pitched shell and deep eaves.
 a,b=u-width/2-.3,u+width/2+.3;v0,v1=v-depth/2-.3,v+depth/2+.3
 verts=[at(a,height,v0),at(b,height,v0),at(b,height,v1),at(a,height,v1),at(a,height+.75,v),at(b,height+.75,v)]
 mesh('DistrictPitchedRoof',verts,[(0,1,5,4),(4,5,2,3),(0,4,3),(1,2,5)],'roof')
 ss('Gutter', (a,height-.08,front-side*.24),(b,height-.08,front-side*.24),.045)
 ss('RainwaterDownpipe',(a+.2,height-.08,front-side*.25),(a+.2,.1,front-side*.25),.035)
 for du in [-width*.29,width*.26]:
  sb('WindowRecess',(1.42,1.32,.12),(u+du,height*.56,front-side*.065),'dark')
  sb('ReflectiveWindow',(1.22,1.12,.04),(u+du,height*.56,front-side*.14),'glass')
  for ddu in [-.7,0,.7]:sb('SecurityBurglarBar',(.035,1.4,.045),(u+du+ddu,height*.56,front-side*.19),'steel',.004)
  sb('WindowSill',(1.58,.1,.24),(u+du,height*.56-.7,front-side*.12),'block')
 sb('DoorRecess',(1.08,2.12,.16),(u,.99,front-side*.06),'dark')
 sb('DoorPanel',(.91,1.96,.04),(u,.98,front-side*.155),'rust')
 sb('DoorLintel',(1.3,.16,.14),(u,2.15,front-side*.13),'block')
 if shop:
  sb('GeneralDealerFascia',(width*.88,.85,.08),(u,height-.58,front-side*.12),'shop')
  sb('ShopAwning',(width+.5,.11,1.6),(u,2.55,front-side*.8),'rust')
  for du in [-width/2,width/2]:ss('AwningPost',(u+du,.05,front-side*1.4),(u+du,2.54,front-side*1.4),.035)
  sb('RollerShutter',(1.8,1.9,.08),(u-width*.30,.95,front-side*.17),'roof')
 # Side boundary walls, recessed gate and piers with caps.
 fence=front-side*1.3
 for du in [-width*.43,width*.43]:
  sb('PrecastBoundaryWall',(width*.30,1.55,.11),(u+du,.78,fence),'block')
  sb('ConcretePier',(.23,1.8,.24),(u+du, .9,fence),'plaster')
  sb('PierCap',(.31,.09,.32),(u+du,1.84,fence),'paint')
 for j in range(19):
  du=-1.55+j*.17
  ss('PalisadeUpright',(u+du,.06,fence),(u+du,1.72,fence),.018,'steel',4)
  ss('PalisadeSpear',(u+du,1.72,fence),(u+du+.045,1.88,fence),.014,'steel',4)
 for y in [.36,1.24]:ss('GateRail',(u-1.6,y,fence),(u+1.6,y,fence),.024)
 # Coiled security wire along the boundary, intentionally thin at this distance.
 points=[(u-width*.5+j*.18,1.91+.10*math.sin(j*1.8),fence+.10*math.cos(j*1.8)) for j in range(int(width/.18))]
 for a,b in zip(points,points[1:]):ss('BoundarySecurityWire',a,b,.006,'steel',4)
def district(half):
 for side in [-1,1]:
  print('STREET_DISTRICT',KIND,side,flush=True)
  # Roads' north-side service bays need full mirror/body and crew clearance.
  # Set the frontage back, keeping the live carriageway and trader footprint intact.
  frontage=half+5.8+(2.0 if KIND=='roads' and side==1 else 0)
  for i,u in enumerate([-21,-7,9,25,40]):building(u,side*frontage,9.4,5.5,3.05+(i%3)*.28,['plaster','green','terracotta'][i%3],shop=(i==2 and side==1))
 # Original informal trader stall, produce crates and a sun-faded canopy.
 u=3;v=half+2.0
 sb('TraderCounter',(2.1,.9,.72),(u,.45,v),'rust');sb('TraderCanopy',(2.8,.08,1.8),(u,2.22,v),'fabric')
 for du in [-1.2,1.2]:
  for dv in [-.7,.7]:ss('StallLeg',(u+du,0,v+dv),(u+du,2.23,v+dv),.027)
 for du in [-.65,0,.65]:
  sb('ProduceCrate',(.54,.23,.56),(u+du,1.02,v),'soil')
  for k in range(4):ellipsoid('GenericProduce',at(u+du-.16+(k%2)*.24,1.19,v-.15+(k//2)*.24),(.1,.08,.1),'green')
 # Timber telecom / electricity poles, ceramic insulators and sagging wire bundles.
 for side in [-1,1]:
  v=side*(half+1.2)
  for u in [-24,1,26]:
   ss('TimberUtilityPole',(u,0,v),(u,8.4,v),.115,'rust',10);ss('UtilityCrossarm',(u-.8,7.75,v),(u+.8,7.75,v),.055,'steel')
   for du in [-.6,0,.6]:ss('CeramicInsulator',(u+du,7.75,v),(u+du,8.05,v),.065,'paint')
  for off in [-.6,0,.6]:
   for start in [-24,1]:
    points=[(start+25*j/14+off,8.0-.75*math.sin(math.pi*j/14),v) for j in range(15)]
    for a,b in zip(points,points[1:]):ss('OverheadServiceLine',a,b,.012,'dark',5)
 # Stormwater drains, fragmented resurfacing patches, tar repair seams and litter.
 for u in range(-24,43,12):
  for side in [-1,1]:
   v=side*(half-.12);sb('DrainRecess',(1.0,.014,.43),(u,.087,v),'dark',0)
   for du in [j*.12 for j in range(-4,5)]:sb('StormwaterGrateBar',(.042,.025,.40),(u+du,.105,v),'steel',.002)
 for i in range(26):
  u=RNG.uniform(-26,42);v=RNG.uniform(-half+.35,half-.35);y=.082 if KIND in ('roads','fire') else .012
  if KIND=='water' and abs(u)<2.0 and abs(v)<2.6:continue
  w,d=RNG.uniform(.3,1.4),RNG.uniform(.2,1.4)
  verts=[at(u-w,y,v-d),at(u+w*.8,y,v-d*.7),at(u+w,y,v+d),at(u-w*.8,y,v+d*.8)]
  mesh('WornResurfacingPatch',verts,[(0,3,2,1)],'dark')
  for j in range(3):ss('TarCrackRepair',(u+j*.4,y+.003,v),(u+(j+1)*.4,y+.003,v+RNG.uniform(-.35,.35)),.008,'dark',4)
 for i in range(44):
  u=RNG.uniform(-25,43);v=RNG.choice([-1,1])*RNG.uniform(half+.2,half+1.5)
  sb('PaperLitter',(.12,.008,.19),(u,.13 if KIND!='roads' else .43,v),'paint',0)
 # Airy original foliage with explicit branch structure and alpha-tested leaf sprays.
 from street_foliage import tree
 import sys
 for j,(u,side) in enumerate([(-17,-1),(20,-1),(34,1)]):
  tree(sys.modules[__name__],u,side*(half+(7 if KIND=='roads' and side==1 else 3)),710+j)
def taxi():
 from street_vehicles import minibus
 import sys
 return minibus(sys.modules[__name__])

def pedestrian():
 global ROOT
 parent=ROOT;g=bpy.data.objects.new('StreetPedestrianTemplate',None);bpy.context.collection.objects.link(g);g.parent=ROOT;g.matrix_parent_inverse=ROOT.matrix_world.inverted();ROOT=g
 # Generic clothed adult, deliberately no eyes, face, identity or texture portrait.
 ellipsoid('ClothedTorso',(0,1.14,0),(.23,.34,.15),'fabric')
 ellipsoid('AnonymousHead',(0,1.66,0),(.115,.145,.105),'soil')
 ellipsoid('PlainCap',(0,1.77,.01),(.12,.055,.12),'dark')
 for side in [-1,1]:
  hip=(side*.105,.88,0);knee=(side*.105,.51,side*.08);foot=(side*.105,.12,side*.13)
  span('TrouserThigh',hip,knee,.087,'dark',9,r2=.068);span('TrouserCalf',knee,foot,.066,'dark',8,r2=.046)
  box('WorkShoe',(.15,.12,.27),(side*.105,.06,side*.13+.05),'tyre',.04)
  shoulder=(side*.215,1.36,0);elbow=(side*.29,1.08,.03);hand=(side*.32,.86,.09)
  span('Sleeve',shoulder,elbow,.072,'fabric',9,r2=.06);span('Forearm',elbow,hand,.05,'soil',8,r2=.035)
 ROOT=parent;return g

def baked_vertex_ao():
 """CPU ray-traced static occlusion in COLOR_0; no realtime shadows or extra map."""
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0].name=='street-trim']
 vertices=[];faces=[]
 for o in objects:
  start=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend(tuple(start+i for i in f.vertices) for f in o.data.polygons)
 bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
 for o in objects:
  attr=o.data.color_attributes.new(name='BakedAO',type='FLOAT_COLOR',domain='CORNER');normal_matrix=o.matrix_world.to_3x3()
  for face in o.data.polygons:
   normal=(normal_matrix@face.normal).normalized()
   for loop in face.loop_indices:
    origin=o.matrix_world@o.data.vertices[o.data.loops[loop].vertex_index].co+normal*.035
    blocked=0
    for v in [(1,0,1),(-1,0,1),(0,1,1),(0,-1,1),(1,1,.5),(-1,-1,.5)]:
     ray=(normal+Vector(v)*.7).normalized()
     if ray.dot(normal)<.12:ray=normal
     if bvh.ray_cast(origin,ray,1.8)[0] is not None:blocked+=1
    ao=max(.4,1-blocked*.085);ao*=.83+.17*max(0,normal.z)
    attr.data[loop].color=(ao,ao,ao,1)
 print('STREET_AO',len(objects),len(vertices),'vertices',flush=True)

def enhance(root,kind):
 global ROOT,KIND
 ROOT=root;KIND=kind;bpy.context.view_layer.update()
 # Remove the old placeholder background before it is collapsed to a single mesh.
 prefixes={'electrical':['Street_building','StreetTrees','ElectricalTrainingCar'], 'water':['SuburbanWall','SuburbanRoof'], 'roads':['CivicStreetBuilding','StreetTree'], 'fire':['CivicStreetBuilding','Roof','Door','Trunk','Canopy'] }[kind]
 delete=[]
 for o in list(bpy.context.scene.objects):
  at=o
  while at:
   if any(at.name.startswith(s) for s in prefixes):delete.append(o);break
   at=at.parent
 for o in delete:
  if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
 bpy.context.view_layer.update()
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  name=o.name
  if any(name.startswith(s) for s in ['RoadSurface','FullScaleAsphalt','CentreApproachAsphalt','AsphaltCarriageway']) or (kind=='fire' and name=='Asphalt'):assign(o,road=True)
  elif any(s in name for s in ['Kerb','Curb','Shoulder','Sidewalk']):assign(o,'block')
  elif any(s in name for s in ['GrassVerge','StreetGround','Street_verge']):assign(o,'soil')
  elif kind=='electrical':
   mapping={'cabinet':'green','cabinetLight':'green','steel':'steel','cable':'dark','hazard':'terracotta','warning':'paint','tyre':'tyre','lane':'paint','sidewalk':'block','curb':'block','lamp':'paint','glass':'glass'}
   assign(o,mapping)
 half=3.5 if kind in ('electrical','roads') else 7
 before=set(bpy.context.scene.objects)
 district(half)
 from street_authenticity import district_details
 import sys
 district_details(sys.modules[__name__],half);bpy.context.view_layer.update()
 from street_shadows import bake
 bake(root,kind,BUILD)
 # Keep primary façades, glass and cutout silhouettes intact. Only small secondary
 # hardware is reduced to fit the district budget; a whole-scene decimator tears UVs.
 parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o not in before and o.parent==root]
 protected_prefixes=('District','Window','Reflective','Door','Precast','Concrete','Pier','Shop','Roller','CompoundLeaf','VergeWeed','StreetGroundShadows')
 protected=[o for o in parts if o.name.startswith(protected_prefixes)]
 details=[o for o in parts if o not in protected]
 def count(objects):return sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects)
 original=count(parts);reserved=count(protected)
 def join(objects,name):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;o.select_set(False);return o
 if details:
  detail=join(details,'StreetSecondaryDetail')
  budget=max(1500,14500-reserved);triangles=count([detail])
  if triangles>budget:
   mod=detail.modifiers.new('Quest secondary hardware LOD','DECIMATE');mod.ratio=budget/triangles;mod.use_collapse_triangulate=True
   bpy.context.view_layer.objects.active=detail;bpy.ops.object.modifier_apply(modifier=mod.name)
  protected.append(detail)
 if protected:join(protected,'StreetDistrictBakedMesh')
 print('STREET_DISTRICT_LOD',KIND,original,'to',count([bpy.data.objects['StreetDistrictBakedMesh']]),'protected',reserved,flush=True)
 baked_vertex_ao()
 root['streetTrainingContext']='Unbranded taxi rank; municipal service faults; human safety decisions';root['streetRealismVersion']=3;root['streetAssetLicense']='CC0-1.0';root['bakedOcclusion']='CPU BVH rays, COLOR_0';root['noIdentityFeatures']=True
 return ()


def export_actors():
 global ROOT
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 ROOT=bpy.data.objects.new('StreetActors',None);bpy.context.collection.objects.link(ROOT)
 taxi();pedestrian();bpy.context.view_layer.update()
 for name in ['StreetTaxiTemplate','StreetPedestrianTemplate']:
  group=bpy.data.objects[name];parts=[o for o in group.children_recursive if o.type=='MESH']
  bpy.ops.object.select_all(action='DESELECT')
  for o in parts:o.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name+'Mesh';o['streetLifePrototype']=True
 baked_vertex_ao()
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=str(BUILD/'street-actors.glb'),export_format='GLB',export_yup=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_cameras=False,export_lights=False)
