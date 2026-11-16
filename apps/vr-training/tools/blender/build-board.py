"""Culltron original CC0 distribution board and articulated MCB, vrart 2026-10-08.

Reproduce: blender -b --python
tools/blender/build-board.py. Geometry is runtime Y-up, front +Z, in metres.
The board mounting centre is world (0,1.1,-.66); the four MCB placements and
Toggle pivot deliberately retain the working training scene's exact anchors.
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hero_common as H

# One real machined bevel segment keeps close-range manufactured edges while
# leaving the stereo scene ample geometry headroom. Weighted normals are retained.
_manufactured_bevel = H.bevel


def budget_bevel(obj, width=.002, segments=1):
    return _manufactured_bevel(obj, width, segments=1)


H.bevel = budget_bevel


def fastener(name, pos, radius=.0026, parent=None, metal='steel'):
    """Captive slotted screw on a +Z-facing panel, not a painted screw dot."""
    H.cylinder(name + '_Head', radius, .0018, pos, metal,
               axis=(0, 0, 1), vertices=8, parent=parent, bevel_width=0)
    H.box(name + '_Slot', (radius * 1.42, radius * .28, .00035),
          (pos[0], pos[1], pos[2] + .00098), 'dark', bevel=0, parent=parent)


def distribution_board():
    root = H.reset('DistributionBoard')
    # Mounting panel remains the exact old contact envelope, with folded hems.
    H.box('InsulatedMountingPanel', (.430, .620, .018), (0, -.070, -.046),
          'ivory', bevel=.004, parent=root)
    for x in (-.207, .207):
        H.box('FoldedMountingHem', (.008, .600, .024), (x, -.070, -.047),
              'dark', bevel=.0018, parent=root)
    for x in (-.184, .184):
        for y in (-.348, .207):
            fastener('PanelCaptiveFixing', (x, y, -.035), parent=root)

    # Thin steel folded enclosure; real open recesses and compressed door seal.
    H.box('SteelRearPan', (.371, .440, .009), (0, -.035, -.020),
          'ivory', bevel=.003, parent=root)
    for x in (-.1835, .1835):
        H.box('FoldedEnclosureReturn', (.013, .449, .057), (x, -.035, .007),
              'ivory', bevel=.0015, parent=root)
        H.box('ContinuousGasket', (.0035, .430, .0035), (x, -.035, .037),
              'rubber', bevel=.0008, parent=root)
    for y in (-.253, .183):
        H.box('FoldedEnclosureCrossReturn', (.365, .012, .057), (0, y, .007),
              'ivory', bevel=.0018, parent=root)
        H.box('CrossReturnGasket', (.351, .0035, .0035), (0, y, .037),
              'rubber', bevel=.0008, parent=root)

    # Upper fixed dead-front and DIN opening; breakers remain separately animated.
    # The plaque clears the preserved breaker-label UI's upper world edge 1.240.
    # Its face is also ahead of the upper return/gasket, rather than printed
    # through that steelwork. All physical interaction anchors remain unchanged.
    H.box('UpperDeadFront', (.349, .067, .011), (0, .169, .035),
          'ivory', bevel=.002, parent=root)
    H.box('CircuitBreakerRecess', (.351, .095, .004), (0, .050, .017),
          'dark', bevel=.001, parent=root)
    H.box('DINRailSpine', (.350, .023, .0035), (0, .050, .022),
          'steel', bevel=.0004, parent=root)
    for y in (.0395, .0605):
        H.box('DINRailRolledFlange', (.350, .004, .003), (0, y, .025),
              'steel', bevel=.0005, parent=root)
    for x in (-.172, .172):
        H.box('DINRailEndStop', (.005, .064, .021), (x, .050, .026),
              'dark', bevel=.0009, parent=root)
    H.box('LowerDeadFrontSeam', (.349, .015, .011), (0, -.011, .031),
          'ivory', bevel=.0015, parent=root)
    H.label('WorkshopBoardIdentity', (.288, .045), (0, .170, .0407),
            slot=0, parent=root, rect=(0, 512, 512, 128))

    # Incoming LIVE remains electrically distinct from downstream isolation.
    H.box('SupplyIndicatorBezel', (.078, .025, .004), (.099, .214, -.034),
          'dark', bevel=.0012, parent=root)
    H.label('IncomingSupplyLivePlate', (.054, .017), (.090, .214, -.0318),
            slot=0, parent=root, rect=(0, 768, 512, 128))
    H.cylinder('SupplyLampSteelRim', .0057, .0015, (.127, .214, -.031),
               'steel', axis=(0, 0, 1), vertices=10, parent=root)
    H.cylinder('BoardSupplyLamp', .0042, .002, (.127, .214, -.0295),
               'red', axis=(0, 0, 1), vertices=10, parent=root)

    # Main isolator is mechanically fitted behind the existing hasp and snap zone.
    H.box('MainIsolatorDINCarrier', (.124, .080, .013), (0, -.110, .013),
          'steel', bevel=.0015, parent=root)
    H.box('MainIsolatorHousing', (.112, .071, .030), (0, -.113, .028),
          'ivory', bevel=.003, parent=root)
    H.box('MainIsolatorSafetyBezel', (.069, .049, .008), (0, -.113, .047),
          'dark', bevel=.0022, parent=root)
    H.box('MainIsolatorLever', (.047, .022, .012), (0, -.116, .054),
          'red', bevel=.002, parent=root)
    for x in (-.041, .041):
        fastener('IsolatorFaceCaptiveScrew', (x, -.133, .045), .002, parent=root)
    H.box('LockoutHaspSupportSeat', (.072, .025, .009), (0, -.092, .046),
          'steel', bevel=.0015, parent=root)

    # Service opening, neutral and earth bars, insulated incoming/outgoing wiring.
    H.box('TerminalBayRecess', (.344, .098, .004), (0, -.200, -.008),
          'dark', bevel=.001, parent=root)
    for x, swatch in ((-.095, 'blue'), (.095, 'lime')):
        H.box('BusbarInsulatedSupport', (.125, .023, .009), (x, -.210, .008),
              swatch, bevel=.0015, parent=root)
        H.box('EarthBar' if x > 0 else 'NeutralBar', (.113, .013, .006),
              (x, -.207, .016), 'copper', bevel=.0007, parent=root)
        for i in range(5):
            fastener('BusbarClamp', (x + (i - 2) * .021, -.207, .020),
                     .0024, parent=root)
    for i, x in enumerate((-.135, -.045, .045, .135)):
        colour = ('red', 'dark', 'blue', 'lime')[i]
        H.tube('OutgoingConductor', [(x, .005, .016), (x, -.045, -.003),
               (x + .011, -.153, -.004), (x + .011, -.234, .012)],
               .0021, colour, segments=6, parent=root)
    for x in (-.079, .079):
        H.tube('IncomingSupplyConductor', [(x, -.317, -.005),
               (x, -.252, -.003), (x * .45, -.170, -.004),
               (x * .45, -.149, .020)], .0033,
               'red' if x < 0 else 'dark', segments=6, parent=root)

    # Removable gland plate with locknuts, strain relief and short cable tails.
    H.box('RemovableGlandPlate', (.310, .011, .052), (0, -.265, -.002),
          'steel', bevel=.0013, parent=root)
    for x in (-.144, .144):
        H.cylinder('GlandPlateFixing', .0025, .002, (x, -.271, -.001),
                   'steel', axis=(0, 1, 0), vertices=8, parent=root)
    for x in (-.118, -.039, .039, .118):
        H.cylinder('CableGlandLocknut', .011, .005, (x, -.271, -.001),
                   'dark', vertices=6, parent=root)
        H.cylinder('CableGlandBody', .0084, .018, (x, -.283, -.001),
                   'ivory', vertices=10, parent=root)
        H.cylinder('CableGlandCompressionCollar', .0094, .006,
                   (x, -.293, -.001), 'dark', vertices=10, parent=root)

    # Lower left service door has its own proper folded steel shell and hinges.
    # A compact split bay avoids the trainee tools, UI and central lockout reach.
    door = H.group('HingedServiceDoor', (-.188, -.1725, .040), parent=root)
    H.box('ServiceDoorFoldedSteel', (.150, .225, .006), (.075, 0, 0),
          'ivory', bevel=.002, parent=door)
    for x in (.004, .146):
        H.box('DoorHemReturn', (.006, .214, .009), (x, 0, -.004),
              'steel', bevel=.001, parent=door)
    for y in (-.108, .108):
        H.box('DoorHemCrossReturn', (.140, .006, .009), (.075, y, -.004),
              'steel', bevel=.001, parent=door)
    H.label('DoorCircuitChart', (.132, .132), (.075, .021, -.0032),
            slot=1, normal=(0, 0, -1), parent=door)
    H.label('TrilingualShockWarning', (.125, .055), (.075, -.078, -.0032),
            slot=2, normal=(0, 0, -1), parent=door,
            rect=(1024, 512, 512, 224))
    H.box('DoorLatchReceiver', (.008, .020, .006), (.138, .030, .005),
          'dark', bevel=.001, parent=door)
    # Runtime +Y is Blender +Z in the shared helper's coordinate convention.
    H.rotate(door, -125)
    for y in (-.250, -.095):
        H.box('WeldedHingeLeaf', (.027, .031, .004), (-.182, y, .037),
              'steel', bevel=.001, parent=root)
        H.cylinder('ServiceDoorHingeBarrel', .0045, .039,
                   (-.188, y, .040), 'steel', vertices=10, parent=root)

    for x in (-.165, .165):
        for y in (-.023, .160):
            z = .042 if y > .1 else .038
            fastener('DeadFrontQuarterTurnScrew', (x, y, z), parent=root)
    H.finish(root, 'distribution-board.glb')


def circuit_breaker():
    root = H.reset('Breaker')
    H.box('MouldedCircuitBreakerCase', (.062, .077, .033), (0, 0, 0),
          'ivory', bevel=.0025, parent=root)
    H.box('DINMountingFoot', (.052, .073, .006), (0, 0, -.017),
          'dark', bevel=.001, parent=root)
    H.box('MouldedFrontShoulder', (.057, .057, .006), (0, .007, .016),
          'ivory', bevel=.0015, parent=root)
    H.box('TerminalCoverSeam', (.059, .0022, .001), (0, -.021, .0174),
          'dark', bevel=0, parent=root)
    for x in (-.018, .018):
        H.box('RecessedTerminalWell', (.014, .010, .002), (x, -.031, .017),
              'dark', bevel=.0005, parent=root)
        fastener('TerminalClampScrew', (x, -.031, .0188), .0026, parent=root)
    H.label('BreakerRating', (.052, .020), (0, .025, .0192),
            slot=3, parent=root, rect=(1536, 512, 512, 192))
    toggle = H.group('Toggle', (0, .005, .023), parent=root)
    H.box('Rocker', (.038, .023, .017), (0, 0, .004),
          'dark', bevel=.002, parent=toggle)
    for y in (-.006, 0, .006):
        H.box('GripRidge', (.032, .0018, .002), (0, y, .0132),
              'rubber', bevel=.0003, parent=toggle)
    H.box('PositionIndicator', (.007, .004, .001), (.012, .001, .014),
          'red', bevel=.0002, parent=toggle)
    H.finish(root, 'breaker.glb', exclude=['Toggle'])


if __name__ == '__main__':
    distribution_board()
    if '--board-only' not in sys.argv:
        circuit_breaker()
