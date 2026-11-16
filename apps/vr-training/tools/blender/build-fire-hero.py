"""Original Culltron CC0 full-scale Fire/EMS crash kit. Metres, +Y up, vehicle nose +Z.
Synthetic mannequins only: blank visors, numbered vests, no identity detail and no injury mesh.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import hero_common as h

OUT = h.OUT


def roads_material():
    if h.MAT:
        return h.MAT
    material = bpy.data.materials.new('CivicOpsRoadsAtlas')
    material.use_nodes = True
    tree = material.node_tree
    bsdf = tree.nodes.get('Principled BSDF')
    for suffix, path in [('color', OUT / 'roads-color.png'), ('orm', OUT / 'hero-orm.png'), ('normal', OUT / 'hero-normal.png')]:
        image = bpy.data.images.load(str(path), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if suffix == 'color' else 'Non-Color'
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        if suffix == 'color':
            tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        elif suffix == 'orm':
            split = tree.nodes.new('ShaderNodeSeparateColor')
            tree.links.new(tex.outputs['Color'], split.inputs['Color'])
            tree.links.new(split.outputs['Green'], bsdf.inputs['Roughness'])
            tree.links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])
            group = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            if len(group.interface.items_tree) == 0:
                group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
            ao = tree.nodes.new('ShaderNodeGroup')
            ao.node_tree = group
            tree.links.new(split.outputs['Red'], ao.inputs['Occlusion'])
        else:
            normal = tree.nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value = 0.35
            tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
            tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    h.MAT = material
    return material


h.atlas_material = roads_material


def box(name, dims, pos, swatch='ivory', bevel=0.01, parent=None):
    obj = h.box(name, dims, pos, swatch, min(bevel, min(dims) * 0.2), parent)
    return obj


def disc(name, centre, radii, y, swatch, parent=None):
    count = 18
    verts = [(centre[0], y, centre[1])]
    for index in range(count):
        angle = math.tau * index / count
        verts.append((centre[0] + math.cos(angle) * radii[0], y, centre[1] + math.sin(angle) * radii[1]))
    faces = [(0, index, index + 1) for index in range(1, count)]
    faces.append((0, count, 1))
    return h.mesh(name, verts, faces, swatch, parent)


def wheel(name, pos, parent=None):
    h.cylinder(name, 0.38, 0.28, pos, 'rubber', axis=(1, 0, 0), vertices=10, parent=parent, bevel_width=0.004)
    hub = (pos[0], pos[1], pos[2])
    h.cylinder(name + 'Hub', 0.16, 0.3, hub, 'steel', axis=(1, 0, 0), vertices=8, parent=parent, bevel_width=0.002)


def car(name, pos, yaw, swatch, parent):
    body = box(name + 'Body', (1.75, 1.15, 4.15), (pos[0], 0.78, pos[1]), swatch, 0.02, parent)
    h.rotate(body, yaw, (0, 1, 0))
    cabin = box(name + 'Cabin', (1.6, 0.72, 1.7), (pos[0], 1.45, pos[1] + 0.35), 'glass', 0.008, parent)
    h.rotate(cabin, yaw, (0, 1, 0))
    for side in (-0.78, 0.78):
        for along in (-1.25, 1.25):
            wheel(name + f'W{side}{along}', (pos[0] + side, 0.38, pos[1] + along), parent)


def digit(number, parent):
    plate = (0, 1.24, 0.145)
    box('VestPlate', (0.16, 0.18, 0.012), plate, 'white', 0.001, parent)
    z = 0.158
    segments = {
        1: [(0.02, 1.24, 0.028, 0.12)],
        2: [(0, 1.3, 0.1, 0.018), (0.04, 1.25, 0.018, 0.07), (0, 1.2, 0.1, 0.018), (-0.04, 1.15, 0.018, 0.07), (0, 1.1, 0.1, 0.018)],
        3: [(0, 1.3, 0.1, 0.018), (0.04, 1.24, 0.018, 0.1), (0, 1.2, 0.09, 0.016), (0, 1.1, 0.1, 0.018)],
        4: [(-0.035, 1.27, 0.018, 0.08), (0, 1.2, 0.1, 0.016), (0.04, 1.22, 0.018, 0.14)],
    }
    for index, (x, y, w, h) in enumerate(segments[number]):
        box(f'Digit{number}_{index}', (w, h, 0.008), (x, y, z), 'dark', 0.001, parent)


def mannequin(number):
    root = h.reset(f'Casualty{number}')
    root['noIdentityFeatures'] = True
    root['syntheticMannequin'] = True
    root['vest'] = number
    h.group('FeaturelessVisor', (0, 1.62, 0.08))
    box('Pelvis', (0.36, 0.22, 0.2), (0, 0.92, 0), 'dark', 0.008)
    box('Torso', (0.42, 0.48, 0.22), (0, 1.24, 0), 'ivory', 0.01)
    box('Vest', (0.46, 0.42, 0.16), (0, 1.26, 0.04), 'yellow', 0.006)
    digit(number, root)
    for side in (-0.1, 0.1):
        box('Leg', (0.14, 0.78, 0.16), (side, 0.42, 0), 'dark', 0.008)
        box('Boot', (0.15, 0.1, 0.28), (side, 0.06, 0.04), 'rubber', 0.004)
        box('Arm', (0.1, 0.46, 0.1), (side * 3.4, 1.2, 0), 'ivory', 0.006)
        box('Glove', (0.09, 0.08, 0.08), (side * 3.4, 0.94, 0.02), 'yellow', 0.002)
    h.cylinder('Helmet', 0.13, 0.16, (0, 1.66, 0), 'dark', vertices=10, bevel_width=0.004)
    h.cylinder('BlankVisor', 0.1, 0.05, (0, 1.6, 0.08), 'steel', axis=(0, 0, 1), vertices=10, bevel_width=0.002)
    h.finish(root, f'fire-casualty-{number}.glb')


def street():
    root = h.reset('FireStreet')
    root['scaleMeters'] = {'laneWidth': 3.5, 'carriagewayWidth': 14, 'streetlightHeight': 8.2, 'scene': 'scene-safety'}
    root['noIdentityFeatures'] = True
    h.group('RoadPlane', (0, 0, 0))
    h.group('LeaningPole', (-6.2, 0, 2.4))
    h.group('DownedCable', (-6.2, 0.02, 2.4))
    h.group('CrashPair', (-1.7, 0, 0.2))
    box('Asphalt', (14, 0.08, 56), (0, 0.04, 0), 'dark', 0.01)
    box('ShoulderLeft', (3.2, 0.1, 56), (-8.4, 0.05, 0), 'plaster', 0.01)
    box('ShoulderRight', (3.2, 0.1, 56), (8.4, 0.05, 0), 'plaster', 0.01)
    box('KerbLeft', (0.25, 0.16, 56), (-7.05, 0.08, 0), 'ivory', 0.01)
    box('KerbRight', (0.25, 0.16, 56), (7.05, 0.08, 0), 'ivory', 0.01)
    box('CentreLine', (0.12, 0.01, 50), (0, 0.09, 0), 'yellow', 0.001)
    box('EdgeLeft', (0.1, 0.01, 50), (-3.4, 0.09, 0), 'white', 0.001)
    box('EdgeRight', (0.1, 0.01, 50), (3.4, 0.09, 0), 'white', 0.001)
    for index, z in enumerate((-18, -10, -2, 6, 14, 22)):
        box(f'Dash{index}', (0.12, 0.008, 2.2), (-1.7, 0.09, z), 'white', 0.001)
    # Wear and a dark stain under the iridescent spill.
    box('WearPatch', (2.4, 0.008, 6), (1.2, 0.09, 8), 'rubber', 0.001)
    disc('Stain', (-1.5, -3.4), (1.7, 1.15), 0.09, 'dark')
    disc('FuelSpill', (-1.5, -3.4), (1.55, 1.05), 0.11, 'teal')
    for index, (x, z) in enumerate(((-12, -8), (-12, 10), (12, -6), (12, 12))):
        box(f'CivicStreetBuilding{index}', (6.5, 5.5 + (index % 2), 8), (x, 2.8, z), 'plaster', 0.04)
        box(f'Roof{index}', (6.9, 0.28, 8.4), (x, 5.7 + (index % 2), z), 'teal', 0.02)
        box(f'Door{index}', (1.1, 2.2, 0.08), (x - (1.8 if x > 0 else -1.8), 1.1, z), 'dark', 0.01)
    h.cylinder('UprightPole', 0.09, 8.2, (6.4, 4.1, -8), 'yellow', vertices=8, bevel_width=0.01)
    box('UprightLamp', (1.4, 0.12, 0.28), (6.4, 8.15, -8), 'dark', 0.008)
    pole = h.cylinder('LeanPoleMesh', 0.09, 8.4, (-6.2, 3.6, 3.6), 'yellow', vertices=8, bevel_width=0.01)
    h.rotate(pole, 22, (1, 0, 0))
    h.tube('CableMesh', [(-6.2, 7.2, 4.6), (-6.05, 2.4, 3.2), (-6.2, 0.08, 2.4)], 0.03, 'dark', segments=6)
    car('WreckA', (-0.8, 0.8), 22, 'red', root)
    car('WreckB', (-2.5, -1.1), -16, 'teal', root)
    box('DebrisA', (0.7, 0.12, 0.35), (-0.2, 0.12, -0.2), 'steel', 0.004)
    box('DebrisB', (0.28, 0.18, 0.5), (-3.1, 0.14, 0.6), 'dark', 0.004)
    box('DebrisC', (0.45, 0.08, 0.22), (-1.1, 0.1, 1.4), 'orange', 0.002)
    for index, z in enumerate((-16, 0, 16)):
        h.cylinder(f'Trunk{index}', 0.12, 1.4, (-11.2, 0.7, z), 'wood', vertices=6, bevel_width=0.01)
        h.cylinder(f'Canopy{index}', 1.15, 2.2, (-11.2, 2.3, z), 'teal', vertices=8, radius2=0.2, bevel_width=0.01)
    from street_realism import enhance
    templates=enhance(root,'fire')
    h.finish(root, 'fire-street.glb', exclude=templates+('FuelSpill',))


def engine():
    root = h.reset('FireEngine')
    root['syntheticFleet'] = True
    box('Chassis', (2.35, 0.42, 7.1), (0, 0.55, 0), 'dark', 0.02)
    box('CrewCab', (2.28, 1.35, 2.15), (0, 1.4, 2.15), 'red', 0.02)
    box('RearBody', (2.42, 1.5, 4.35), (0, 1.42, -1.15), 'red', 0.02)
    box('Windshield', (2.05, 0.62, 0.08), (0, 1.85, 3.15), 'glass', 0.004)
    box('Grill', (1.5, 0.45, 0.08), (0, 0.95, 3.2), 'steel', 0.004)
    box('Bumper', (2.4, 0.28, 0.25), (0, 0.55, 3.35), 'steel', 0.008)
    box('Stripe', (2.44, 0.16, 4.3), (0, 1.15, -1.15), 'yellow', 0.004)
    for side in (-1.05, 1.05):
        for along in (2.15, -0.2, -2.35):
            wheel('EngineWheel', (side, 0.4, along))
    box('BarRail', (1.35, 0.08, 0.42), (0, 2.22, 1.7), 'dark', 0.004)
    box('LightBarRed', (0.32, 0.14, 0.62), (-0.38, 2.34, 1.7), 'red', 0.004)
    box('LightBarBlue', (0.32, 0.14, 0.62), (0.38, 2.34, 1.7), 'blue', 0.004)
    h.group('Grip', (0, 1.3, 0))
    h.finish(root, 'fire-engine.glb', exclude=('LightBarRed', 'LightBarBlue'))


def ambulance():
    root = h.reset('Ambulance')
    root['syntheticFleet'] = True
    box('Chassis', (2.15, 0.4, 5.6), (0, 0.5, 0), 'dark', 0.015)
    box('Cab', (2.1, 1.25, 1.8), (0, 1.25, 1.7), 'white', 0.015)
    box('BoxBody', (2.2, 1.7, 3.3), (0, 1.35, -0.85), 'white', 0.015)
    box('Windshield', (1.9, 0.55, 0.06), (0, 1.7, 2.55), 'glass', 0.003)
    box('Stripe', (2.22, 0.18, 3.2), (0, 1.15, -0.85), 'red', 0.004)
    box('CrossPanel', (0.55, 0.55, 0.04), (0, 1.7, -2.45), 'red', 0.002)
    for side in (-0.95, 0.95):
        for along in (1.55, -1.45):
            wheel('AmbWheel', (side, 0.38, along))
    box('AmbRail', (1.15, 0.06, 0.36), (0, 2.28, 0.4), 'dark', 0.003)
    box('LightBarRed', (0.28, 0.12, 0.5), (-0.32, 2.38, 0.4), 'red', 0.003)
    box('LightBarBlue', (0.28, 0.12, 0.5), (0.32, 2.38, 0.4), 'blue', 0.003)
    h.finish(root, 'fire-ambulance.glb', exclude=('LightBarRed', 'LightBarBlue'))


def flare():
    root = h.reset('Flare')
    h.cylinder('Stick', 0.012, 0.32, (0, 0.16, 0), 'dark', vertices=6, bevel_width=0.001)
    h.cylinder('FlareGlow', 0.028, 0.09, (0, 0.36, 0), 'orange', vertices=8, bevel_width=0.001)
    h.cylinder('Cap', 0.03, 0.03, (0, 0.02, 0), 'red', vertices=8, bevel_width=0.001)
    h.finish(root, 'fire-flare.glb', exclude=('FlareGlow',))


def mast():
    root = h.reset('SceneMast')
    h.cylinder('MastPole', 0.07, 4.4, (0, 2.2, 0), 'steel', vertices=8, bevel_width=0.006)
    box('MastHead', (1.1, 0.1, 0.28), (0.35, 4.35, 0), 'dark', 0.006)
    box('MastLamp', (0.42, 0.08, 0.2), (0.55, 4.26, 0), 'yellow', 0.003)
    box('Base', (0.45, 0.08, 0.45), (0, 0.04, 0), 'dark', 0.004)
    h.finish(root, 'fire-mast.glb', exclude=('MastLamp',))


def exclusion():
    root = h.reset('ExclusionMarker')
    h.cylinder('Post', 0.035, 1.05, (0, 0.52, 0), 'yellow', vertices=8, bevel_width=0.003)
    h.torus('Ring', 0.42, 0.025, (0, 0.06, 0), 'orange', axis=(0, 1, 0), major_segments=16, minor_segments=6)
    box('Plate', (0.34, 0.22, 0.02), (0, 0.95, 0), 'yellow', 0.002)
    box('Band', (0.22, 0.05, 0.012), (0, 0.95, 0.016), 'dark', 0.001)
    h.finish(root, 'fire-exclusion.glb')


def tag(kind, swatch, shape):
    root = h.reset(f'Tag{kind}')
    root['triageTag'] = kind
    box('Card', (0.18, 0.24, 0.01), (0, 0.14, 0), 'white', 0.001)
    if shape == 'circle':
        h.cylinder('Mark', 0.05, 0.012, (0, 0.15, 0.012), swatch, axis=(0, 0, 1), vertices=14, bevel_width=0.001)
    elif shape == 'triangle':
        h.mesh('Mark', [(0, 0.21, 0.014), (-0.055, 0.09, 0.014), (0.055, 0.09, 0.014)], [(0, 1, 2)], swatch)
    elif shape == 'diamond':
        h.mesh('Mark', [(0, 0.21, 0.014), (0.05, 0.15, 0.014), (0, 0.09, 0.014), (-0.05, 0.15, 0.014)], [(0, 1, 2, 3)], swatch)
    else:
        box('Mark', (0.08, 0.08, 0.012), (0, 0.15, 0.012), swatch, 0.001)
    h.finish(root, f'fire-tag-{kind}.glb')


if __name__ == '__main__':
    street()
    engine()
    ambulance()
    flare()
    mast()
    exclusion()
    for number in (1, 2, 3, 4):
        mannequin(number)
    tag('minor', 'lime', 'circle')
    tag('delayed', 'yellow', 'triangle')
    tag('immediate', 'red', 'diamond')
    tag('expectant', 'ivory', 'square')
    print('FIRE_HERO_DONE')
