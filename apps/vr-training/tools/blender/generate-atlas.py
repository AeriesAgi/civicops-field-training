"""Original Culltron surface/label artwork, source maps for Cycles atlas baking."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, random
OUT=Path(__file__).resolve().parents[2]/'artifacts'/'hero-build'; OUT.mkdir(parents=True,exist_ok=True)
SIZE=2048
COLORS=['#ddd9cd','#9aa5a4','#263436','#151d21','#be3032','#e8bd41','#1d6662','#a2773d','#9c7152','#b6c955','#d0cfbc','#596560','#dc6b36','#f7f1df','#385678','#8faaa9']
ROUGH=[.60,.34,.48,.80,.48,.5,.5,.3,.68,.6,.86,.88,.54,.52,.54,.2]
METAL=[0,1,.15,0,0,0,.2,1,0,0,0,0,0,0,0,.4]
color=Image.new('RGB',(SIZE,SIZE),'#f3eedf'); orm=Image.new('RGB',(SIZE,SIZE),(255,173,0)); normal=Image.new('RGB',(512,512),(128,128,255))
d=ImageDraw.Draw(color); od=ImageDraw.Draw(orm)
rng=random.Random(3176)
for i,c in enumerate(COLORS):
    x=(i%8)*256; y=(i//8)*256; d.rectangle((x,y,x+255,y+255),fill=c); od.rectangle((x,y,x+255,y+255),fill=(255,int(ROUGH[i]*255),int(METAL[i]*255)))
    base=tuple(int(c[j:j+2],16) for j in (1,3,5))
    for n in range(1400):
        px=x+rng.randrange(256); py=y+rng.randrange(256); change=rng.choice([-6,-3,2,4]); shade=tuple(max(0,min(255,v+change)) for v in base)
        d.point((px,py),fill=shade)
    if i==8:
        for n in range(75):
            yy=y+rng.randrange(256); tone=rng.randrange(-22,14); shade=tuple(max(0,min(255,v+tone)) for v in base)
            points=[(x+q,yy+math.sin(q*.035+n)*rng.uniform(1,4)) for q in range(0,256,5)]; d.line(points,fill=shade,width=rng.choice([1,1,2]))
    elif i in (1,2,6):
        for n in range(10):
            xx=x+rng.randrange(250); yy=y+rng.randrange(250); d.line((xx,yy,xx+rng.randrange(2,12),yy-1),fill=tuple(min(255,v+25) for v in base),width=1)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def text(draw,xy,value,size=32,fill='#203033',bold=False,anchor=None): draw.text(xy,value,font=ImageFont.truetype(BOLD if bold else FONT,size),fill=fill,anchor=anchor)
def card(slot,bg='#f3eedf'):
    im=Image.new('RGB',(512,512),bg); return im,ImageDraw.Draw(im)
def put(slot,im): color.paste(im,((slot%4)*512,512+(slot//4)*512))
def center(draw,y,value,size=32,fill='#203033',bold=False): text(draw,(256,y),value,size,fill,bold,'mt')
def lightning(draw,centerxy,scale=1):
    x,y=centerxy; points=[(-12,-42),(22,-42),(5,-6),(28,-6),(-18,45),(-6,4),(-27,4)]
    draw.polygon([(x+a*scale,y+b*scale) for a,b in points],fill='#203033')
# Slots0-3: board plate, ruled schedule, trilingual hazard, manufactured MCB specification.
im,dd=card(0); dd.rectangle((0,0,511,114),fill='#1d6662'); center(dd,25,'CIVICOPS',60,'#fff6dc',True); center(dd,151,'DISTRIBUTION',47,bold=True); center(dd,236,'DEPOT DB-04',48,bold=True); dd.line((38,322,474,322),fill='#677975',width=3); center(dd,348,'MUNICIPAL SERVICES',29); center(dd,403,'230 V   •   50 Hz',34); put(0,im)
im,dd=card(1); dd.rectangle((0,0,511,100),fill='#263436'); center(dd,30,'CIRCUIT SCHEDULE',36,'#fff6dc',True)
for i,(ref,name) in enumerate([('SL-1','Yard west'),('SL-2','Yard east'),('SL-3','Streetlights'),('SL-4','Service bay')]):
    y=136+i*80; dd.rectangle((20,y-6,492,y+58),fill='#d8e1d5' if i==2 else '#ece8d9'); text(dd,(34,y),ref,33,bold=True); text(dd,(152,y+3),name,24 if i==2 else 29); dd.line((26,y+60,486,y+60),fill='#a6ada4',width=2)
center(dd,470,'TRAINING CIRCUITS',20); put(1,im)
im,dd=card(2,'#e8bd41'); dd.polygon([(256,34),(339,164),(173,164)],fill='#263436'); dd.polygon([(256,50),(317,150),(195,150)],fill='#e8bd41'); lightning(dd,(256,106),.58); center(dd,189,'DANGER',64,bold=True); center(dd,267,'INGOZI / GEVAAR',34,bold=True); dd.line((34,327,478,327),fill='#263436',width=4); center(dd,361,'ISOLATE BEFORE',34,bold=True); center(dd,411,'WORK',48,bold=True); put(2,im)
im,dd=card(3); center(dd,26,'C16',140,bold=True); center(dd,211,'230 V',64); center(dd,312,'6 kA',70,bold=True); center(dd,422,'0   OFF   |   ON   1',29); put(3,im)
# Slots4-7: personal lock, danger tag, LCD state strips and proving/contact plate.
im,dd=card(4); dd.rectangle((0,0,511,110),fill='#be3032'); center(dd,24,'PERSONAL LOCK',39,'#fff6dc',True); center(dd,145,'CIVICOPS',53,bold=True); center(dd,245,'TRAINING',50,bold=True); center(dd,320,'ID  041',56,bold=True); dd.line((32,400,480,400),fill='#203033',width=3); center(dd,426,'ONE PERSON • ONE KEY',24); put(4,im)
im,dd=card(5); dd.rectangle((0,0,511,150),fill='#be3032'); center(dd,32,'DANGER',87,'#fff6dc',True); center(dd,181,'DO NOT',65,bold=True); center(dd,255,'OPERATE',65,bold=True); dd.line((28,344,484,344),fill='#263436',width=4); center(dd,366,'PERSONAL LOCKOUT',29,bold=True); center(dd,418,'TRAINEE 041',37,bold=True); center(dd,472,'FOLLOW YOUR EMPLOYER’S SOP',19); put(5,im)
im,dd=card(6,'#17282a')
for i,value in enumerate(['230 V','000 V','— — —']):
    dd.rectangle((6,6+i*128,506,122+i*128),fill='#19362e'); text(dd,(256,14+i*128),value,110,'#bde5a1',True,'mt')
dd.rectangle((0,384,511,511),fill='#e8bd41'); center(dd,404,'TWO-POLE TESTER',35,bold=True); center(dd,464,'CAT III • 600 V',28); put(6,im)
im,dd=card(7); dd.rectangle((0,0,511,256),fill='#1d6662'); center(dd,24,'PROVING UNIT',43,'#fff6dc',True); center(dd,101,'230 V',76,'#fff6dc',True); center(dd,205,'KNOWN LIVE SOURCE',25,'#fff6dc'); dd.line((0,257,511,257),fill='#263436',width=3); text(dd,(126,281),'L',108,'#be3032',True,'mt'); text(dd,(385,281),'N',108,'#1d6662',True,'mt'); center(dd,428,'CHECK BOTH POLES',29,bold=True); put(7,im)
# Slots8-11: original municipal identity, bench badge, own poster and tool shadows.
im,dd=card(8,'#1d6662'); dd.ellipse((206,30,306,130),outline='#b6c955',width=9); dd.line((227,108,255,59,282,108),fill='#fff6dc',width=10); center(dd,154,'CIVICOPS',67,'#fff6dc',True); center(dd,255,'MUNICIPAL',43,'#fff6dc',True); center(dd,319,'SERVICES',43,'#fff6dc',True); center(dd,432,'FIELD CREW',29,'#b6c955'); put(8,im)
im,dd=card(9,'#1d6662')
# Wide workshop plaque crop512x96: a small own crest and two short lines.
dd.ellipse((16,20,68,72),outline='#b6c955',width=4)
dd.line((29,61,42,34,55,61),fill='#fff6dc',width=4)
text(dd,(82,8),'CIVICOPS',25,'#fff6dc',True)
text(dd,(82,49),'Field Training Depot / 01',21,'#fff6dc',True)
# Existing fitted bench badge occupies an unchanged independent lower crop.
dd.rectangle((0,420,511,480),fill='#1d6662')
center(dd,426,'CIVICOPS / MUNICIPAL SERVICES',26,'#fff6dc',True)
put(9,im)
im,dd=card(10); dd.rectangle((0,0,511,100),fill='#e8bd41'); center(dd,23,'WORK SAFELY',49,bold=True)
for y,n,title,detail in [(132,'1','ISOLATE','Identify the correct circuit'),(250,'2','LOCK','Your lock. Your protection.'),(368,'3','PROVE','Live • Dead • Live')]:
    dd.ellipse((24,y,102,y+78),fill='#1d6662'); text(dd,(63,y+5),n,55,'#fff6dc',True,'mt'); text(dd,(125,y+4),title,38,bold=True); text(dd,(125,y+53),detail,22)
center(dd,478,'FOLLOW YOUR EMPLOYER’S SOP',20); put(10,im)
im,dd=card(11,'#9da69a'); dd.rectangle((0,0,511,62),fill='#263436'); center(dd,13,'RETURN TO TOOL SHADOWS',28,'#fff6dc',True)
for x in [96,218,352]:
    dd.rounded_rectangle((x-22,120,x+22,298),radius=17,fill='#59655e'); dd.rectangle((x-7,298,x+7,449),fill='#59655e')
dd.ellipse((338,324,443,429),fill='#59655e'); dd.ellipse((358,344,424,409),fill='#9da69a'); put(11,im)
# Rectangular crops for manufactured board plaques; square slots retain reusable surrounding space.
im,dd=card(0); dd.rectangle((0,0,511,127),fill='#1d6662'); center(dd,10,'CIVICOPS DISTRIBUTION',34,'#fff6dc',True); center(dd,75,'DEPOT DB-04  •  230 V',28,'#fff6dc'); dd.rectangle((0,256,511,383),fill='#263436'); center(dd,278,'SUPPLY / LIVE',63,'#fff6dc',True); put(0,im)
im,dd=card(2,'#e8bd41'); dd.polygon([(62,22),(108,106),(16,106)],fill='#263436'); dd.polygon([(62,37),(89,95),(35,95)],fill='#e8bd41'); lightning(dd,(62,73),.38); text(dd,(134,13),'DANGER',58,bold=True); text(dd,(134,84),'INGOZI / GEVAAR',29,bold=True); center(dd,155,'ISOLATE BEFORE WORK',34,bold=True); put(2,im)
im,dd=card(3); text(dd,(25,30),'C16',87,bold=True); text(dd,(273,28),'230 V',47,bold=True); text(dd,(273,89),'6 kA',41); center(dd,151,'0  OFF   |   ON  1',25); put(3,im)
# Surface height source is converted to tangent normals by a real Cycles NORMAL bake.
height=Image.new('RGB',(512,512),(128,128,128)); hp=height.load()
for y in range(128):
    for x in range(512):
        tile=(y//64)*8+x//64; lx=x%64; ly=y%64
        if tile==8:
            v=128+18*math.sin(ly*.49+math.sin(lx*.08)*2)+8*math.sin(ly*1.23+lx*.08)
        elif tile==1:
            v=128+7*math.sin(ly*1.9)+3*math.sin(lx*.7+ly*.9)
        else:
            v=128+3*math.sin(lx*2.3)*math.cos(ly*1.7)+rng.uniform(-1,1)
        hp[x,y]=(int(v),)*3
color.save(OUT/'hero-color-source.png'); orm.resize((512,512),Image.Resampling.BOX).save(OUT/'hero-orm-source.png'); height.save(OUT/'hero-height-source.png')
print('Generated original atlas source artwork',OUT)
