"""CivicOps original CC0 graphic/material art. Rebuild with sourced env.sh."""
from pathlib import Path
import json, math, random, struct, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

APP = Path(__file__).resolve().parents[1]
SRC = Path('asset-src/custom-civicops')
OUT = APP / 'public/textures'
SRC.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
atlas = Image.new('RGB', (1024, 1024), '#edece4')
orm = Image.new('RGB', (1024, 1024), (255, 158, 0))
d = ImageDraw.Draw(atlas)

def text(x, y, wording, size, color='#17252b', bold=False):
    d.text((x, y), wording, fill=color, font=ImageFont.truetype(BOLD if bold else FONT, size))
def centre(x, y, width, wording, size, color='#17252b', bold=False):
    font = ImageFont.truetype(BOLD if bold else FONT, size)
    length = d.textlength(wording, font=font)
    d.text((x + (width-length)/2, y), wording, fill=color, font=font)

# Laminated danger tag: readable hierarchy and a real trainee identification field.
d.rectangle((0, 0, 255, 383), fill='#f7f4e9')
d.rectangle((0, 48, 255, 109), fill='#b42320')
centre(0, 55, 256, 'DANGER', 40, '#ffffff', True)
centre(0, 122, 256, 'DO NOT', 32, bold=True)
centre(0, 162, 256, 'OPERATE', 32, bold=True)
d.line((18, 207, 238, 207), fill='#b42320', width=5)
centre(0, 220, 256, 'EQUIPMENT LOCKED OUT', 15, bold=True)
centre(0, 246, 256, 'FOR YOUR SAFETY', 17, bold=True)
text(17, 271, 'TRAINEE', 17, bold=True)
d.rectangle((17, 290, 238, 323), outline='#586568', width=2)
text(24, 295, 'electricity-01', 20)
text(17, 340, 'CIVICOPS  /  PERSONAL LOCK', 12, bold=True)
d.ellipse((116, 13, 140, 37), fill='#17252b', outline='#d8ddd7', width=4)
# Lock body label and breaker print.
d.rectangle((256, 0, 383, 127), fill='#f2eedf')
centre(256, 7, 128, 'CIVICOPS', 18, bold=True)
centre(256, 38, 128, 'PERSONAL', 15, bold=True)
centre(256, 57, 128, 'SAFETY LOCK', 14, bold=True)
d.line((267, 81, 372, 81), fill='#b42320', width=3)
centre(256, 94, 128, 'E-01', 18, bold=True)
d.rectangle((384, 0, 511, 63), fill='#eeede5')
text(390, 1, 'CIVIC', 12, bold=True)
text(390, 18, 'C16', 25, bold=True)
text(455, 26, '230V', 11)
text(390, 49, 'IEC 60898', 9)
# Enclosure engraved identity plate.
d.rectangle((512, 0, 1023, 63), fill='#eef0e9')
text(530, 2, 'CIVICOPS', 24, bold=True)
text(690, 9, 'ELECTRICAL WORKSHOP', 15, bold=True)
text(532, 37, 'STREETLIGHT DISTRIBUTION  /  230 V  /  BAY 03', 13)
d.line((523, 32, 1011, 32), fill='#217b79', width=2)
# Compact supply indicator plaque occupies a previously unused atlas cell.
d.rectangle((768, 192, 1023, 255), fill='#17252b')
centre(768, 204, 256, 'SUPPLY LIVE', 30, '#fff3e1', True)
# Proving unit and tray wordmarks.
d.rectangle((512, 192, 767, 351), fill='#e9ede8')
centre(512, 205, 256, 'PU230', 34, bold=True)
centre(512, 250, 256, 'PROVING UNIT', 25, bold=True)
centre(512, 286, 256, 'KNOWN LIVE SOURCE', 17)
centre(512, 316, 256, '230 V AC   |   CAT III', 16)
d.rectangle((0, 384, 511, 423), fill='#17252b')
text(15, 390, 'CIVICOPS  /  ELECTRICAL TRAINING', 22, '#f7f4e9', True)
d.rectangle((0, 512, 255, 639), fill='#17252b')
centre(0, 514, 256, 'VT-02', 31, '#e5e5dd', True)
centre(0, 554, 256, 'TWO-POLE TESTER', 18, '#e5e5dd', True)
centre(0, 584, 256, 'CAT III 600 V', 19, '#e5e5dd')
# LED readouts use authored seven-segment lettering with a lightly smoked lens.
segments = {'0':'ABCDEF', '2':'ABGED', '3':'ABGCD', '-':'G'}
for row, reading in ((512, '230'), (576, '000'), (640, '---')):
    d.rectangle((256, row, 383, row+63), fill='#101c19')
    for index, digit in enumerate(reading):
        ox, oy = 263+index*34, row+7
        areas = {'A':(ox+5,oy,ox+23,oy+4), 'B':(ox+23,oy+5,ox+27,oy+23),
          'C':(ox+23,oy+28,ox+27,oy+46), 'D':(ox+5,oy+47,ox+23,oy+51),
          'E':(ox,oy+28,ox+4,oy+46), 'F':(ox,oy+5,ox+4,oy+23),
          'G':(ox+5,oy+24,ox+23,oy+28)}
        for segment, area in areas.items():
            d.rounded_rectangle(area, radius=1, fill='#abe7ad' if segment in segments[digit] else '#263b30')
    text(365, row+39, 'V', 13, '#b3dbba', True)
# Terminal identity, shock warning and a readable one-line schematic.
d.rectangle((512, 384, 767, 415), fill='#eeede5')
text(544, 2+384, 'L', 23, '#b42320', True)
text(676, 2+384, 'N', 23, '#176f86', True)
d.rectangle((768, 384, 1023, 511), fill='#dbb03d')
centre(768, 397, 256, 'CAUTION', 32, bold=True)
centre(768, 446, 256, 'LIVE TERMINALS', 22, bold=True)
d.rectangle((512, 512, 767, 575), fill='#e9ede8')
centre(512, 524, 256, '230 V  /  TEST POINT', 21, bold=True)
d.rectangle((0, 704, 511, 831), fill='#f3f1e5')
text(18, 710, 'SL-3  STREETLIGHT FEEDER', 23, bold=True)
d.line((30, 772, 470, 772), fill='#17252b', width=4)
d.rectangle((170, 754, 235, 791), fill='#f3f1e5', outline='#17252b', width=3)
d.line((180, 780, 225, 756), fill='#17252b', width=4)
text(22, 794, 'SUPPLY', 15, bold=True)
text(170, 794, 'ISOLATOR 3', 15, bold=True)
text(357, 794, 'LOAD / L N', 15, bold=True)
# Surface palette is shared by all static geometry. G = roughness, B = metalness.
palette = [('#bac5cb', .31, .92), ('#17252b', .64, .2), ('#111b20', .93, 0),
  ('#e9e9df', .58, 0), ('#bc3029', .52, 0), ('#dbaa32', .65, 0),
  ('#217b79', .48, .12), ('#ac7445', .4, .88)]
for index, (color, roughness, metallic) in enumerate(palette):
    rect = (index*64, 960, index*64+63, 1023)
    d.rectangle(rect, fill=color)
    ImageDraw.Draw(orm).rectangle(rect, fill=(255, int(255*roughness), int(255*metallic)))
atlas.save(SRC/'custom-labels.png')
orm.save(SRC/'custom-labels-orm.png')
# Subtle finished birch laminate: warm timber, low contrast longitudinal grain.
rng = random.Random(714)
wood = Image.new('RGB', (512, 512))
normal = Image.new('RGB', (512, 512))
for y in range(512):
    for x in range(512):
        grain = math.sin(y*.48 + math.sin(x*.010)*4) * 1.8 + math.sin(y*.12 + x*.001)*2.7
        grain += math.sin(y*.026 + math.sin(x*.009)) * 4
        noise = rng.uniform(-1.0, 1.0)
        wood.putpixel((x,y), (int(194+grain+noise), int(167+grain+noise), int(127+grain+noise)))
        normal.putpixel((x,y), (128, int(128+math.cos(y*.48)*3), 255))
wood.save(SRC/'custom-bench-color.png')
normal.save(SRC/'custom-bench-normal.png')
for stem in ('custom-labels','custom-labels-orm','custom-bench-color','custom-bench-normal'):
    linear = stem.endswith(('orm','normal'))
    command = ['toktx','--t2','--encode','uastc' if stem.endswith('normal') else 'etc1s',
      '--assign_oetf','linear' if linear else 'srgb','--genmipmap']
    if stem.endswith('normal'): command += ['--uastc_quality','2','--zcmp','19','--normal_mode','--input_swizzle','rgb1']
    else: command += ['--clevel','3','--qlevel','200']
    ImageOps.flip(Image.open(SRC/f'{stem}.png')).save(SRC/f'{stem}-upload.png')
    subprocess.run(command + [str(OUT/f'{stem}.ktx2'),str(SRC/f'{stem}-upload.png')], check=True)
# The IWSDK loader supports KTX2 via glTF, so carry the maps in a tiny glTF.
chunks, views = [], []
length = 0

def payload(data):
    global length
    data += bytes((-len(data)) % 4)
    views.append({'buffer':0, 'byteOffset':length, 'byteLength':len(data)})
    chunks.append(data)
    length += len(data)
    return len(views)-1
p = payload(struct.pack('<12f',-.005,0,0,.005,0,0,.005,.01,0,-.005,.01,0))
n = payload(struct.pack('<12f',0,0,1,0,0,1,0,0,1,0,0,1))
u = payload(struct.pack('<8f',0,0,1,0,1,1,0,1))
i = payload(struct.pack('<6H',0,1,2,0,2,3))
image_views = [payload((OUT/f'{stem}.ktx2').read_bytes()) for stem in
  ('custom-labels','custom-labels-orm','custom-bench-color','custom-bench-normal')]
gltf = {
  'asset':{'version':'2.0','generator':'CivicOps original CC0 authored material carrier'},
  'extensionsUsed':['KHR_texture_basisu'],'extensionsRequired':['KHR_texture_basisu'],
  'buffers':[{'byteLength':length}],'bufferViews':views,
  'accessors':[
    {'bufferView':p,'componentType':5126,'count':4,'type':'VEC3','min':[-.005,0,0],'max':[.005,.01,0]},
    {'bufferView':n,'componentType':5126,'count':4,'type':'VEC3'},
    {'bufferView':u,'componentType':5126,'count':4,'type':'VEC2'},
    {'bufferView':i,'componentType':5123,'count':6,'type':'SCALAR'}],
  'images':[{'bufferView':v,'mimeType':'image/ktx2'} for v in image_views],
  'textures':[{'extensions':{'KHR_texture_basisu':{'source':j}}} for j in range(4)],
  'materials':[
    {'name':'CustomPalette','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':1},'metallicFactor':1,'roughnessFactor':1}},
    {'name':'BenchTimber','pbrMetallicRoughness':{'baseColorTexture':{'index':2},'metallicFactor':0,'roughnessFactor':.67},'normalTexture':{'index':3,'scale':.17}}],
  'meshes':[{'name':'MaterialCarrier','primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':3,'material':j} for j in range(2)]}],
  'nodes':[{'mesh':0,'name':'TextureMaterialCarrier'}],'scenes':[{'nodes':[0]}],'scene':0}
js = json.dumps(gltf,separators=(',',':')).encode()
js += b' '*((-len(js))%4)
blob = b''.join(chunks)
carrier = struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(blob)) + struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+blob
(SRC/'custom-materials-source.glb').write_bytes(carrier)
(APP/'public/models').mkdir(parents=True,exist_ok=True)
(APP/'public/models/custom-materials.glb').write_bytes(carrier)
for stem in ('custom-labels','custom-labels-orm','custom-bench-color','custom-bench-normal'):
    (OUT/f'{stem}.ktx2').unlink()
print('Custom CC0 texture carrier:', (APP/'public/models/custom-materials.glb').stat().st_size, 'bytes')
