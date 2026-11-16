"""Original generic SA minibus. Metres, floor contact Y=0, forward +Z.
Continuous pressed body, open wheel arches, surface-mounted glazing, no marks.
"""
import math

def minibus(k):
    parent=k.ROOT;g=k.bpy.data.objects.new('StreetTaxiTemplate',None)
    k.bpy.context.collection.objects.link(g);g.parent=parent;k.ROOT=g
    sections=[(-2.60,.82,.90,1.95),(-2.44,.95,.90,2.12),(-1.72,.975,.90,2.18),(.94,.975,.90,2.18),(1.64,.94,.90,2.01),(2.29,.87,.90,1.27),(2.60,.82,.74,1.18)]
    verts=[]
    for z,w,b,t in sections:
        verts.extend([(x,y,z) for x,y in [(-w+.07,b),(-w,b+.09),(-w,t-.10),(-w+.10,t),(w-.10,t),(w,t-.10),(w,b+.09),(w-.07,b)]])
    faces=[]
    for j in range(len(sections)-1):
        for i in range(8):faces.append((j*8+i,(j+1)*8+i,(j+1)*8+(i+1)%8,j*8+(i+1)%8))
    faces.extend([tuple(range(8)),tuple(range(55,47,-1))])
    k.mesh('ContinuousPressedMinibusBody',verts,faces,'white')
    # Side lower panels have genuine concave wheel apertures; axle centres remain open.
    bottom=[(-2.44,.43),(-2.09,.43),(-2.04,.58),(-1.96,.72),(-1.82,.82),(-1.65,.85),(-1.48,.82),(-1.34,.72),(-1.26,.58),(-1.22,.43),(1.18,.43),(1.22,.58),(1.30,.72),(1.44,.82),(1.61,.85),(1.78,.82),(1.92,.72),(2.00,.58),(2.04,.43),(2.42,.43)]
    for side in [-1,1]:
        for (z0,y0),(z1,y1) in zip(bottom,bottom[1:]):
            x0=side*(.969 if abs(z0)<2.05 else .91);x1=side*(.969 if abs(z1)<2.05 else .91)
            k.mesh('PressedArchAndSill',[(x0,y0,z0),(x1,y1,z1),(x1,.995,z1),(x0,.995,z0)],[(0,1,2,3) if side<0 else (3,2,1,0)],'white')
        for z in [-1.81,-.87,.07]:
            k.box('RubberWindowSeal',(.026,.78,.85),(side*.978,1.58,z),'dark',.035)
            k.box('RecessedPassengerGlazing',(.029,.68,.75),(side*.984,1.60,z),'glass',.030)
        # Front cab window matches the actual sloping A pillar.
        points=[(side*.979,1.25,.62),(side*.921,1.25,1.98),(side*.928,1.89,1.63),(side*.976,2.04,.62)]
        k.mesh('CabGlazingGasket',points,[(0,1,2,3) if side<0 else (3,2,1,0)],'dark')
        points=[(side*.984,1.31,.68),(side*.931,1.31,1.89),(side*.937,1.86,1.59),(side*.981,1.98,.68)]
        k.mesh('CabSideGlass',points,[(0,1,2,3) if side<0 else (3,2,1,0)],'glass')
        k.span('CabDoorDivider',(side*.982,1.28,.73),(side*.982,2.0,.73),.014,'dark',6)
        k.box('LowerProtectiveMoulding',(.037,.074,4.68),(side*.983,.98,-.05),'dark',.008)
        k.box('SlidingDoorTrack',(.025,.024,2.20),(side*.989,1.11,-.53),'steel',.004)
        for z in [-1.35,.57]:
            k.box('RecessedHandleCup',(.029,.085,.23),(side*.994,1.19,z),'dark',.018)
            k.box('FlushDoorPull',(.043,.025,.16),(side*1.008,1.20,z),'steel',.008)
        k.span('MirrorBracket',(side*.94,1.48,1.87),(side*1.13,1.48,1.90),.021,'dark',8)
        k.box('MirrorHousing',(.18,.27,.13),(side*1.15,1.52,1.90),'dark',.034)
        k.box('MirrorGlass',(.14,.22,.016),(side*1.15,1.52,1.968),'glass',.02)
        # Thin body seams are deliberately below 8mm at full scale.
        for z in [-2.28,.55]:k.span('DoorSeam',(side*.985,1.02,z),(side*.985,1.99,z),.0035,'dark',4)
    windshield=[(-.765,1.30,2.29),(.765,1.30,2.29),(.827,1.97,1.665),(-.827,1.97,1.665)]
    k.mesh('SlopedWindscreenSeal',windshield,[(0,1,2,3)],'dark')
    k.mesh('InsetSlopedWindscreen',[(-.72,1.34,2.266),(.72,1.34,2.266),(.78,1.93,1.715),(-.78,1.93,1.715)],[(0,1,2,3)],'glass')
    for x in [-.44,.25]:
        k.span('WiperBlade',(x-.18,1.37,2.239),(x+.22,1.44,2.173),.010,'dark',6)
        k.span('WiperArm',(x,1.24,2.354),(x+.12,1.40,2.211),.007,'steel',5)
    k.box('RearWindowSeal',(1.54,.68,.027),(0,1.56,-2.61),'dark',.05)
    k.box('RecessedRearGlass',(1.43,.57,.031),(0,1.57,-2.615),'glass',.04)
    k.span('RearHatchSeam',(0,.61,-2.621),(0,1.22,-2.621),.004,'dark',4)
    k.box('RearHatchPull',(.25,.05,.025),(0,1.17,-2.635),'dark',.008)
    for side in [-1,1]:
        for z in [-1.65,1.61]:
            k.span('RoundedTyreSidewall',(side*.88,.37,z),(side*1.058,.37,z),.365,'tyre',16)
            k.span('WheelRimLip',(side*1.060,.37,z),(side*1.079,.37,z),.225,'steel',16)
            k.span('RecessedWheelDish',(side*1.080,.37,z),(side*1.082,.37,z),.179,'dark',16)
            k.span('PressedSteelHub',(side*1.083,.37,z),(side*1.087,.37,z),.117,'steel',12)
            for j in range(4):
                a=math.tau*j/4
                k.span('WheelVent',(side*1.088,.37+math.cos(a)*.153,z+math.sin(a)*.153),(side*1.092,.37+math.cos(a)*.153,z+math.sin(a)*.153),.027,'tyre',6)
            k.span('AxleCap',(side*1.09,.37,z),(side*1.115,.37,z),.063,'steel',12)
        k.box('HeadlampHousing',(.48,.24,.035),(side*.53,.991,2.606),'steel',.033)
        k.box('HeadlampLens',(.42,.18,.042),(side*.53,1.002,2.618),'paint',.025)
        k.box('FrontIndicator',(.10,.17,.046),(side*.727,1.002,2.622),'rust',.015)
        k.box('RearLightHousing',(.195,.43,.033),(side*.72,.91,-2.616),'dark',.02)
        k.box('RearStopLamp',(.15,.23,.043),(side*.72,1.00,-2.627),'terracotta',.015)
        k.box('RearReverseLens',(.15,.09,.044),(side*.72,.80,-2.628),'paint',.012)
    k.box('RecessedRadiatorGrille',(.87,.28,.035),(0,.75,2.626),'dark',.016)
    for y in [.66,.75,.84]:k.box('RadiatorSlat',(.83,.017,.016),(0,y,2.65),'steel',.003)
    for z in [-2.65,2.65]:
        k.box('WrappedRubberBumper',(1.78,.19,.14),(0,.48,z),'dark',.035)
        k.box('PlainUnletteredPlate',(.38,.105,.019),(0,.48,z+(.08 if z>0 else -.08)),'paint',.008)
    k.box('Underbody',(1.67,.12,4.8),(0,.44,-.02),'dark',.025)
    from street_authenticity import taxi_details
    taxi_details(k)
    g['metresLength']=5.46;g['metresHeight']=2.18;g['forwardAxis']='+Z';g['contactPlaneY']=0
    k.ROOT=parent
    return g
