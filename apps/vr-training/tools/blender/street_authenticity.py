"""Original unbranded rank and municipal fault details. Runtime metres, +Y up.
No identification, operator names, logos or borrowed vehicle designs.
"""
import math

def lettering(k, name, text, position, size=.18, tile='paint'):
    curve=k.bpy.data.curves.new(name,'FONT');curve.body=text;curve.size=size
    curve.align_x='CENTER';curve.align_y='CENTER';curve.resolution_u=2
    obj=k.bpy.data.objects.new(name,curve);k.bpy.context.collection.objects.link(obj)
    obj.location=k.p(*position);obj.rotation_euler=(math.pi/2,0,0)
    k.bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    k.bpy.context.view_layer.objects.active=obj;k.bpy.ops.object.convert(target='MESH')
    return k.adopt(k.bpy.context.object,name,tile)

def taxi_details(k):
    # Sliding passenger door: upper/lower running tracks and a complete panel seam.
    for side in [-1,1]:
        for y in [1.03,2.07]:
            k.span('SlidingDoorRunner',(side*.991,y,-1.32),(side*.991,y,.56),.008,'steel',4)
        k.span('SlidingDoorRearSeam',(side*.992,.99,-1.34),(side*.992,2.07,-1.34),.004,'dark',4)
    # Rack feet bear on the roof rails, rather than floating above the shell.
    for side in [-1,1]:
        for z in [-1.58,-.20,.80]:
            k.span('RoofRackFoot',(side*.72,2.175,z),(side*.72,2.28,z),.026,'steel',6)
        k.span('RoofRackSideRail',(side*.82,2.30,-1.86),(side*.82,2.30,1.02),.022,'steel',6)
    for z in [-1.86,-1.3,-.74,-.18,.38,1.02]:
        k.span('RoofRackCrossbar',(-.82,2.285,z),(.82,2.285,z),.019,'steel',6)
    # A removable destination board at the lower windscreen. Generic place only.
    k.box('GenericDestinationBoard',(.74,.20,.028),(0,1.475,2.16),'dark',.009)
    lettering(k,'DestinationCBD','CBD',(0,1.475,2.179),.15)
    k.ROOT['routeDestination']='CBD';k.ROOT['slidingDoor']=True;k.ROOT['roofRack']=True

def district_details(k, half):
    # Rank-side shelter: modest steel frame, corrugated cover and a bench.
    u,v=-3,-(half+2.3)
    for du in [-1.9,1.9]:
        for dv in [-.55,.55]:k.ss('TaxiRankShelterPost',(u+du,.05,v+dv),(u+du,2.52,v+dv),.035,'steel',6)
    k.sb('RankCorrugatedCanopy',(4.25,.07,1.8),(u,2.55,v),'roof')
    k.sb('RankWaitingBench',(3.3,.09,.45),(u,.52,v),'block')
    for du in [-1.35,1.35]:k.sb('RankBenchLeg',(.11,.5,.37),(u+du,.25,v),'steel')
    k.sb('MunicipalRankRouteBoard',(1.5,.45,.05),(u,2.16,v+.58),'dark')
    text=lettering(k,'RankDestinationCBD','CBD / RANK',k.at(u,2.16,v+.62),.20)
    if k.KIND!='roads':text.rotation_euler.z=math.pi/2
    # The electrical scene's visible fault is deliberately left unverified.
    # Workers do not repair illegal wiring in the simulation; they exclude/report it.
    if k.KIND=='electrical':
        u,v=1,half+1.2
        for cable in range(9):
            points=[]
            for j in range(15):
                a=j*math.tau/14
                points.append((u+.30*math.sin(a)+cable*.035,6.15+.48*math.cos(a)-cable*.055,v+.16*math.sin(a*2)))
            for a,b in zip(points,points[1:]):k.ss('UnverifiedServiceCableBundle',a,b,.015,'dark',5)
        for i in range(4):
            points=[(u+j*.30,6.35-j*.30-i*.08,v+.12*math.sin(j)) for j in range(10)]
            for a,b in zip(points,points[1:]):k.ss('UnverifiedInformalServiceDrop',a,b,.013,'dark',5)
        u,v=5.6,half+1.4
        k.sb('FaultCabinetPlinth',(1.35,.16,.90),(u,.08,v),'block')
        k.sb('FaultCabinetShell',(1.08,1.42,.66),(u,.87,v),'green',.035)
        k.sb('AjarCabinetDarkInterior',(.92,1.25,.027),(u,.89,v-.345),'dark',0)
        door=k.sb('AjarMunicipalCabinetDoor',(.92,1.29,.055),(u-.67,.89,v-.64),'green',.025)
        # Whole rigid door rotates around its own vertical axis, no loose surface detail.
        door.rotation_euler.z=math.radians(38)
        for i in range(3):k.ss('CabinetUnverifiedConductors',(u-.24+i*.24,.43,v-.37),(u-.24+i*.24,1.32,v-.37),.022,'rust',6)
        k.sb('CabinetExclusionRail',(2.15,.10,.09),(u,.78,v-1.15),'paint')
        for du in [-1,1]:k.ss('CabinetRailFoot',(u+du,.03,v-1.15),(u+du,.85,v-1.15),.037,'terracotta',6)
    # Refuse, patch seams and wash stains are context, never additional departments.
    for u in [-11,17]:
        v=half+1.55
        if k.KIND=='roads' and u==-11:u=-15.5
        k.sb('UnbrandedWheelieBin',(.55,.90,.59),(u,.47,v),'green',.06)
        k.sb('WheelieBinLid',(.61,.07,.64),(u,.96,v),'dark',.025)
        for du in [-.24,.24]:k.ss('BinWheel',(u+du,.12,v+.28),(u+du+.04,.12,v+.28),.105,'tyre',8)
