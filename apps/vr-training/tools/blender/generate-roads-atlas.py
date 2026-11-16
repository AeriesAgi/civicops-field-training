"""Original Culltron CC0 Roads trim atlas. Deterministic artwork; no downloads."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random, math
OUT=Path(__file__).resolve().parent.parent.parent/'artifacts'/'hero-build'
OUT.mkdir(parents=True,exist_ok=True)
S=1024
im=Image.new('RGB',(S,S),(22,33,39)); d=ImageDraw.Draw(im)
colors=[(231,231,209),(136,153,151),(40,53,56),(20,28,31),(183,42,40),(246,193,47),(38,110,112),(147,98,57),(133,112,77),(201,224,66),(206,208,193),(65,70,72),(236,107,33),(245,246,228),(67,124,150),(47,74,80)]
rng=random.Random(50502)
for i,c in enumerate(colors):
 x=(i%8)*128; y=(i//8)*128; d.rectangle((x,y,x+127,y+127),fill=c)
 for _ in range(1600):
  px=x+rng.randrange(4,124);py=y+rng.randrange(4,124);a=rng.randint(-7,7)
  d.point((px,py),fill=tuple(max(0,min(255,v+a)) for v in c))
 if i==11:
  for _ in range(90):
   xx=x+rng.randrange(6,120);yy=y+rng.randrange(6,120)
   d.ellipse((xx,yy,xx+2,yy+2),fill=(92,96,91))
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def f(n,heavy=False):return ImageFont.truetype(bold if heavy else font,n)
def text(s,x,y,n=20,c=(246,245,224),heavy=True):
 ff=f(n,heavy);bb=d.textbbox((0,0),s,font=ff);d.text((x-(bb[2]-bb[0])/2,y),s,font=ff,fill=c)
def tile(n,bg=(29,55,61)):
 x=n%4*256;y=256+n//4*256;d.rectangle((x,y,x+255,y+255),fill=bg);return x,y
# These are generic training symbols, not legal road-sign reproductions.
x,y=tile(0,(245,191,47)); ink=(26,42,42)
d.rounded_rectangle((x+10,y+10,x+245,y+245),radius=19,outline=ink,width=8)
d.polygon([(x+51,y+132),(x+86,y+54),(x+165,y+54),(x+204,y+132)],fill=ink)
d.line((x+78,y+149,x+179,y+149),fill=ink,width=11)
text('PREPARE',x+128,y+173,27,ink);text('WORK AHEAD',x+128,y+211,17,ink)
x,y=tile(1,(35,102,112));d.rounded_rectangle((x+10,y+10,x+245,y+245),radius=23,outline=(244,247,230),width=6)
d.line((x+191,y+167,x+72,y+74),fill=(244,247,230),width=30)
d.polygon([(x+42,y+43),(x+134,y+51),(x+60,y+129)],fill=(244,247,230))
text('PASS LEFT',x+128,y+207,20)
x,y=tile(2,(181,39,42));d.rounded_rectangle((x+8,y+8,x+248,y+248),radius=38,outline=(252,244,213),width=10)
text('HOLD',x+128,y+77,54);text('TRAINING',x+128,y+168,19)
x,y=tile(3,(32,108,102));d.rounded_rectangle((x+8,y+8,x+248,y+248),radius=38,outline=(243,247,222),width=10)
text('PROCEED',x+128,y+87,34);text('WHEN ADVISED',x+128,y+151,18)
x,y=tile(4,(29,55,61));text('CIVICOPS',x+128,y+40,34);text('ROAD SERVICES',x+128,y+101,22);text('TRAINING UNIT 03',x+128,y+164,16)
d.line((x+36,y+216,x+220,y+216),fill=(237,183,49),width=7)
x,y=tile(5,(245,191,47));text('ZONE LAB',x+128,y+43,36,ink);text('LAY OUT · CHECK',x+128,y+110,18,ink);text('HUMAN DECIDES',x+128,y+161,21,ink);text('ILLUSTRATIVE TRAINING',x+128,y+215,13,ink)
x,y=tile(6,(205,212,193));text('PEDESTRIAN',x+128,y+25,23,ink);text('ROUTE',x+128,y+65,30,ink)
d.line((x+39,y+146,x+196,y+146),fill=(35,105,103),width=16);d.polygon([(x+212,y+146),(x+174,y+119),(x+174,y+173)],fill=(35,105,103))
text('KEEP CLEAR',x+128,y+200,23,ink)
x,y=tile(7,(237,109,30));d.rectangle((x+6,y+6,x+249,y+249),outline=ink,width=7)
for k in range(-2,5):d.polygon([(x+k*85,y+7),(x+k*85+31,y+7),(x+k*85+116,y+249),(x+k*85+85,y+249)],fill=ink)
x,y=tile(8,(35,84,87));text('FIELD',x+128,y+48,48);text('CREW',x+128,y+115,49);text('TRAINING',x+128,y+203,17)
x,y=tile(9,(240,241,218));text('DEPOT',x+128,y+42,42,ink);text('WORKSHOP',x+128,y+110,28,ink);text('STREET 03',x+128,y+186,24,ink)
x,y=tile(10,(239,240,219));text('60 / 80',x+128,y+40,45,ink);text('SCENARIO',x+128,y+116,25,ink);text('ILLUSTRATIVE ONLY',x+128,y+196,15,ink)
x,y=tile(11,(29,55,61));text('TOOLS',x+128,y+35,46);text('PINCH · PLACE',x+128,y+104,25);text('TWIST TO TURN',x+128,y+157,22);text('CLEAR ROUTE',x+128,y+210,18)
im.resize((512,512),Image.Resampling.LANCZOS).save(OUT/'roads-color.png')
print('ROADS_ATLAS',OUT/'roads-color.png')
