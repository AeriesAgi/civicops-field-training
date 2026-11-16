"""Original deterministic CC0 water-module trim atlas, no downloaded imagery."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random, math
HERE=Path(__file__).resolve().parent
OUT=HERE.parent.parent/'artifacts'/'hero-build'
OUT.mkdir(parents=True,exist_ok=True)
S=1024
im=Image.new('RGB',(S,S),(24,35,42)); d=ImageDraw.Draw(im)
colors=[(187,206,203),(141,155,155),(34,43,45),(22,29,31),(162,29,36),(244,186,35),(28,103,105),(111,83,55),(121,104,70),(188,217,65),(160,174,169),(49,55,56),(215,102,34),(230,237,224),(38,118,153),(102,145,145)]
rng=random.Random(505)
for i,color in enumerate(colors):
 x=(i%8)*128; y=(i//8)*128
 d.rectangle((x,y,x+127,y+127),fill=color)
 for j in range(2100):
  px=x+rng.randrange(4,124); py=y+rng.randrange(4,124); amt=rng.randint(-14,14)
  d.point((px,py),fill=tuple(max(0,min(255,c+amt)) for c in color))
 if i==8:
  for k in range(42):
   yy=y+4+k*2.7
   d.line([(x+4,yy),(x+62,yy+rng.randrange(-2,3)),(x+124,yy)],fill=(93,79,53),width=1)
 if i in (1,6,14):
  for k in range(12):
   xx=x+rng.randrange(8,120); yy=y+rng.randrange(8,120)
   d.line((xx,yy,min(x+122,xx+rng.randrange(3,14)),yy+1),fill=tuple(max(0,c-30) for c in color),width=1)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def f(size,heavy=False):return ImageFont.truetype(bold if heavy else font,size)
def centered(txt,x,y,size=19,fill=(231,240,231),heavy=False):
 box=d.textbbox((0,0),txt,font=f(size,heavy));d.text((x-(box[2]-box[0])/2,y),txt,font=f(size,heavy),fill=fill)
def tile(n,bg=(19,39,47)):
 x=n%4*256;y=256+n//4*256;d.rectangle((x,y,x+255,y+255),fill=bg);d.rounded_rectangle((x+9,y+9,x+246,y+246),radius=12,outline=(81,129,143),width=2);return x,y
x,y=tile(0)
centered('WATER',x+128,y+34,34,heavy=True);centered('BURST MAIN',x+128,y+79,22,heavy=True)
d.line((x+32,y+124,x+224,y+124),fill=(31,173,192),width=4)
centered('ISOLATE · VERIFY',x+128,y+147,17);centered('ILLUSTRATIVE TRAINING',x+128,y+181,12)
for n,letter,caption in [(1,'A','WEST ISOLATOR'),(2,'B','EAST ISOLATOR'),(3,'C','CRITICAL ZONE'),(4,'D','ALTERNATIVE')]:
 x,y=tile(n,(79,23,28) if n==3 else (17,49,58))
 centered(letter,x+128,y+20,87,heavy=True);centered(caption,x+128,y+128,17,heavy=True)
 centered('DO NOT CLOSE' if n==3 else 'SLOW OPERATION',x+128,y+169,15,fill=(255,203,121) if n==3 else (199,232,221))
x,y=tile(5,(244,192,51))
d.polygon([(x+128,y+23),(x+51,y+141),(x+205,y+141)],fill=(27,32,28));d.rectangle((x+122,y+60,x+134,y+105),fill=(244,192,51));d.ellipse((x+122,y+113,x+134,y+125),fill=(244,192,51))
centered('DANGER',x+128,y+154,24,fill=(22,30,26),heavy=True);centered('OPEN EXCAVATION',x+128,y+185,17,fill=(22,30,26),heavy=True);centered('INGOZI · GEVAAR',x+128,y+214,13,fill=(22,30,26))
x,y=tile(6,(219,230,217));cx=x+128;cy=y+128
d.ellipse((x+13,y+13,x+243,y+243),fill=(227,237,220),outline=(35,55,55),width=7)
for k in range(31):
 a=math.radians(220-k*6.5);r0=90 if k%5==0 else 99
 d.line((cx+math.cos(a)*r0,cy-math.sin(a)*r0,cx+math.cos(a)*108,cy-math.sin(a)*108),fill=(38,54,49),width=3 if k%5==0 else 1)
for label,a in [('0',220),('2',155),('4',90),('6',25)]:
 aa=math.radians(a);centered(label,cx+math.cos(aa)*74,cy-math.sin(aa)*74-10,18,fill=(27,43,39),heavy=True)
centered('bar',cx,y+155,19,fill=(27,43,39));centered('ZONE PRESSURE',cx,y+191,11,fill=(27,43,39))
x,y=tile(7,(217,230,215));centered('ISOLATION ROUTE',x+128,y+19,17,fill=(24,55,55),heavy=True)
for xx,zz in [(45,112),(211,112),(45,183),(211,65)]:d.ellipse((x+xx-10,y+zz-10,x+xx+10,y+zz+10),fill=(24,121,141))
d.line((x+45,y+112,x+211,y+112),fill=(24,121,141),width=6);d.line((x+45,y+112,x+45,y+183,x+211,y+183,x+211,y+112),fill=(24,121,141),width=3);d.line((x+211,y+112,x+211,y+65),fill=(171,40,50),width=5)
centered('A',x+45,y+82,17,fill=(24,55,55),heavy=True);centered('B',x+211,y+132,17,fill=(24,55,55),heavy=True);centered('C',x+211,y+34,17,fill=(161,33,42),heavy=True);centered('D',x+45,y+197,17,fill=(24,55,55),heavy=True)
d.polygon([(x+114,y+97),(x+127,y+123),(x+140,y+97)],fill=(223,112,30));centered('CRITICAL ZONE: LEAVE OPEN',x+128,y+228,10,fill=(135,31,43),heavy=True)
x,y=tile(8,(214,229,222));centered('CIVICOPS',x+128,y+46,31,fill=(26,75,82),heavy=True);centered('WATER SERVICES',x+128,y+106,20,fill=(26,75,82),heavy=True);centered('TRAINING UNIT 02',x+128,y+166,14,fill=(40,82,83))
x,y=tile(9);centered('PPE',x+128,y+43,54,heavy=True);centered('GLOVES · BOOTS',x+128,y+135,17);centered('HARD HAT',x+128,y+171,20)
x,y=tile(10);centered('WASHOUT',x+128,y+38,27,heavy=True);centered('DRAIN AFTER',x+128,y+105,21);centered('ISOLATION',x+128,y+141,23,heavy=True)
x,y=tile(11);centered('SHORED TRENCH',x+128,y+33,21,heavy=True);centered('LADDER · AIR CHECK',x+128,y+92,17);centered('SPOIL SET BACK',x+128,y+133,18);centered('FOLLOW EMPLOYER SOPs',x+128,y+194,12)
im.resize((512,512),Image.Resampling.LANCZOS).save(OUT/'water-color.png')
print('WATER_ATLAS',OUT/'water-color.png')
