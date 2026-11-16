"""Custom Module 1 lockout/test equipment; exact interaction contacts retained.
Reproduce after atlas build: blender -b --python tools/blender/build-tools.py
Author Culltron MSc. Original geometry/artwork dedicated CC0.
"""
import sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import hero_common as H
_original_bevel=H.bevel
H.bevel=lambda obj,width=.002,segments=2: _original_bevel(obj,width,1)

def screw(name,pos,normal=(0,0,1),radius=.0025):
    H.cylinder(name+'Head',radius,.0016,pos,'steel',normal,8)
    # Machined recessed cross, on top/front canonical manufactured faces.
    x,y,z=pos
    if normal==(0,1,0):
        H.box(name+'Slot',(.0037,.00015,.00065),(x,y+.00086,z),'dark',bevel=.00005)
    else: H.box(name+'Slot',(.0037,.00065,.00015),(x,y,z+.00086),'dark',bevel=.00005)

def build_padlock():
    root=H.reset('PersonalPadlock')
    H.box('InjectionMouldedLockBody',(.048,.054,.023),(0,0,0),'red',bevel=.005)
    H.box('MouldPartingSeam',(.047,.001,.0234),(0,-.015,0),'dark',bevel=.0002)
    H.box('TopShackleCollar',(.043,.004,.020),(0,.024,0),'red',bevel=.001)
    H.tube('HardenedSteelShackle',[(-.018,.020,0),(-.018,.045,0),(-.012,.057,0),(0,.061,0),(.012,.057,0),(.018,.045,0),(.018,.020,0)],.00325,'steel',segments=6,resolution=3)
    for x in [-.018,.018]: H.cylinder('ShackleSeal',.0046,.002,(x,.025,0),'rubber',vertices=10)
    H.box('OwnerLabelRecess',(.039,.037,.0016),(0,-.001,.0118),'dark',bevel=.002)
    H.label('PersonalIdentification',(.037,.035),(0,-.001,.01265),4)
    H.cylinder('ChromeKeyBarrel',.0065,.0015,(0,-.0273,0),'steel',axis=(0,-1,0),vertices=12)
    H.box('Keyway',(.009,.0002,.0019),(0,-.0282,0),'dark',bevel=.0001)
    for x in [-.021,.021]:
        for y in [-.014,-.009,-.004,.001,.006]: H.box('SideFingerRib',(.0016,.0014,.019),(x,y,0),'red',bevel=.0003)
    H.finish(root,'padlock.glb')

def build_tag():
    root=H.reset('DangerTag')
    xy=[(-.0305,-.0435),(.0305,-.0435),(.0305,.026),(.021,.0435),(-.021,.0435),(-.0305,.026)]
    verts=[(x,y,z) for z in [-.001,.001] for x,y in xy]; n=len(xy)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    H.mesh('DieCutLaminatedCard',verts,faces,'white')
    H.label('PrintedDangerNotice',(.058,.073),(0,-.004,.00112),5)
    H.torus('ReinforcedBrassEyelet',.0036,.00085,(0,.035,.0012),'copper',major_segments=16,minor_segments=6)
    H.cylinder('EyeletDarkOpening',.0027,.0002,(0,.035,.0014),'dark',axis=(0,0,1),vertices=12)
    H.tube('TagAttachmentTie',[(0,.035,-.001),(-.010,.052,-.003),(0,.058,-.004),(.012,.051,-.003),(.007,.035,-.001)],.00075,'rubber',resolution=3)
    H.box('TieRatchetHousing',(.003,.0037,.003),(.007,.034,-.001),'dark',bevel=.0005)
    H.finish(root,'danger-tag.glb')

def build_tester():
    root=H.reset('VoltageTester')
    H.loft('ErgonomicMouldedTesterHousing',[(-.043,.018,.013,.014,3),(-.030,.022,.018,.016,3),(.030,.022,.018,.016,3),(.055,.018,.016,.015,3),(.068,.011,.012,.011,3)],'yellow',segments=12)
    H.loft('SoftElastomerLowerGrip',[(-.032,.0218,.003,.0168,3),(.030,.0218,.003,.0168,3),(.054,.0178,.003,.0158,3)],'rubber',segments=10)
    H.box('FrontFingerGuard',(.055,.045,.009),(0,0,-.043),'dark',bevel=.002)
    H.span('PrimaryContactProbe',(0,0,-.0475),(0,0,-.10),.002,'steel',vertices=10)
    H.cylinder('ProbeRootInsulation',.0039,.015,(0,0,-.054),'yellow',axis=(0,0,1),vertices=10)
    H.box('DisplayWindowBezel',(.037,.003,.033),(0,.017,.010),'dark',bevel=.002)
    H.box('RecessedLCDGlass',(.033,.0004,.023),(0,.0187,.010),'glass',bevel=.001)
    readout=H.group('VoltageReadout')
    for i,name in enumerate(['230','000','idle']):
        H.label('VoltageReadout-'+name,(.030,.017),(0,.01901,.010),6,normal=(0,1,0),parent=readout,rect=(1024,1024+i*128,512,128))
    H.label('TesterSafetyRatings',(.030,.011),(0,.01825,.044),6,normal=(0,1,0),rect=(1024,1408,512,128))
    for x in [-.020,.020]:
        for z in [-.022,-.011,0,.011,.022]: H.box('SoftGripRib',(.0025,.009,.0025),(x,-.006,z),'rubber',bevel=.0005)
    for x in [-.011,.011]: H.cylinder('TestActivationButton',.0041,.0018,(x,.017,.030),'red',vertices=10)
    H.cylinder('StatusLED',.0017,.0008,(.013,.0187,-.016),'lime',vertices=10)
    second=H.loft('SecondProbeInsulatedGrip',[(-.018,.0095,.008,.009,3),(.008,.011,.010,.010,3),(.050,.009,.009,.009,3),(.060,.006,.006,.006,3)],'rubber',segments=10)
    # The second pole is fixed to the tether, at the preserved organiser-side envelope.
    second.location=H.p(.064,-.011,0)
    H.box('SecondProbeFingerCollar',(.029,.026,.008),(.064,-.011,-.018),'yellow',bevel=.0015)
    H.span('SecondContactProbe',(.064,-.011,-.022),(.064,-.011,-.073),.0018,'steel',vertices=8)
    H.cylinder('LeadStrainRelief',.004,.015,(0,-.004,.068),'rubber',axis=(0,0,1),vertices=10)
    H.tube('FlexibleSiliconeLead',[(0,-.004,.073),(.029,-.019,.091),(.080,-.019,.091),(.093,-.016,.059),(.064,-.011,.058)],.0022,'rubber',resolution=4)
    H.finish(root,'voltage-tester.glb',exclude=['VoltageReadout'])

def build_prover():
    root=H.reset('ProvingUnit')
    H.box('PowderCoatedProverHousing',(.071,.048,.070),(0,.009,0),'teal',bevel=.004)
    H.box('SplitHousingSeam',(.070,.0012,.069),(0,.001,0),'dark',bevel=.0002)
    H.box('AntiSlipBase',(.063,.006,.061),(0,-.012,0),'rubber',bevel=.001)
    for x in [-.027,.027]:
        for z in [-.024,.024]: H.cylinder('SoftRubberFoot',.004,.002,(x,-.016,z),'rubber',vertices=8)
    H.cylinder('TestSocketInsulator',.0118,.004,(0,.034,0),'dark',vertices=16)
    H.torus('BrassSocketRim',.010,.0016,(0,.037,0),'copper',axis=(0,1,0),major_segments=16,minor_segments=6)
    H.cylinder('RecessedLiveContact',.003,.001,(0,.0362,0),'copper',vertices=10)
    H.label('ProvingUnitPlate',(.061,.028),(0,.009,.03511),7,rect=(1536,1024,512,256))
    H.label('KnownLiveSourceMark',(.046,.012),(0,.03315,-.022),7,normal=(0,1,0),rect=(1536,1216,512,64))
    H.cylinder('ProverPowerIndicator',.002,.001,(.024,.0332,.022),'lime',vertices=10)
    for x in [-.026,.026]: screw('TopCoverFastener',(x,.0334,-.027),(0,1,0),.0022)
    for x in [-.03,.03]:
        for y in [.004,.010,.016]: H.box('CoolingVent',(.0008,.0015,.018),(x,y,0),'dark',bevel=.0002)
    H.group('KnownLiveContact',(0,.037,0)); H.finish(root,'proving-unit.glb')

def build_terminals():
    root=H.reset('CircuitTerminals')
    H.box('DINMountingFoot',(.080,.006,.050),(0,-.012,0),'dark',bevel=.001)
    H.box('InsulatedTerminalBase',(.087,.030,.066),(0,0,0),'ivory',bevel=.003)
    H.box('RaisedPoleDivider',(.004,.041,.060),(0,.005,0),'ivory',bevel=.001)
    for x in [-.023,.023]:
        H.box('TerminalWell',(.028,.008,.035),(x,.018,0),'dark',bevel=.002)
        H.cylinder('BrassTestTerminal',.0085,.011,(x,.024,0),'copper',vertices=12)
        H.cylinder('MachinedContactCrown',.0067,.001,(x,.0298,0),'steel',vertices=10)
        H.box('ContactScrewdriverSlot',(.0095,.0002,.0018),(x,.0304,0),'dark',bevel=.0001)
        H.box('CableEntrySleeve',(.017,.016,.007),(x,.004,.032),'dark',bevel=.001)
        H.tube('InsulatedTerminalLead',[(x,.001,.034),(x,-.004,.044),(x+(-.006 if x<0 else .006),-.010,.054)],.0035,'red' if x<0 else 'blue',resolution=3)
        H.group('LineContact' if x<0 else 'NeutralContact',(x,.024,0))
    H.label('TerminalIdentifiers',(.078,.012),(0,.007,.03365),7,rect=(1536,1280,512,140))
    for x in [-.039,.039]: screw('MountingBolt',(x,.0158,-.022),(0,1,0),.002)
    H.finish(root,'terminals.glb')

def build_hasp():
    root=H.reset('LockoutSnapZone')
    H.box('StampedHaspMountingPlate',(.074,.027,.006),(0,.023,-.012),'steel',bevel=.002)
    for x in [-.026,.026]: screw('HaspMountingScrew',(x,.023,-.0085))
    H.span('HaspHingePin',(-.018,.017,-.001),(.018,.017,-.001),.0038,'steel',vertices=12)
    for x in [-.018,.018]: H.cylinder('HingeRivetCap',.005,.0015,(x,.017,-.001),'steel',axis=(1,0,0),vertices=10)
    # Folded horizontal locking eyelet: the padlock's left vertical shackle passes
    # through its real negative space at the exact shared snap origin.
    H.torus('WorkingLockingEyelet',.0065,.0015,(-.018,.036,0),'steel',axis=(0,1,0),major_segments=16,minor_segments=6)
    H.box('StampedHaspFrontJaw',(.010,.019,.007),(-.014,.024,-.008),'steel',bevel=.001)
    H.box('StampedHaspRearJaw',(.010,.019,.006),(-.014,.024,.008),'steel',bevel=.001)
    H.box('InterlockingHaspBridge',(.022,.003,.010),(-.003,.034,-.006),'steel',bevel=.001)
    H.box('SafetyRedGripSleeve',(.052,.016,.011),(0,.042,-.015),'red',bevel=.003)
    H.torus('SnapGuide',.0108,.0011,(0,.026,.010),'teal',major_segments=16,minor_segments=5)
    H.finish(root,'lock-zone.glb')

def build_tagzone():
    root=H.reset('TagSnapZone')
    H.tube('TagGuide',[(-.003,.030,0),(-.006,.035,0),(0,.042,0),(.006,.037,0),(.004,.034,0)],.00125,'steel',segments=6,resolution=3)
    H.finish(root,'tag-zone.glb')

for builder in [build_padlock,build_tag,build_tester,build_prover,build_terminals,build_hasp,build_tagzone]: builder()
