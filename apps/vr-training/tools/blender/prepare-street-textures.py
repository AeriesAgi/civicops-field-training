"""Reproducible CC0 scanned road / plaster trims plus original street artwork."""
from pathlib import Path
import json, urllib.request, random, math
import sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'artifacts/street-build';OUT.mkdir(parents=True,exist_ok=True)
SRC=Path('asset-src/polyhaven/street');SRC.mkdir(parents=True,exist_ok=True)
HEAD={'User-Agent':'CulltronCivicOpsVR/0.1 (support@culltron.app)'}
def get(url):return urllib.request.urlopen(urllib.request.Request(url,headers=HEAD),timeout=60).read()
if '--cached' in sys.argv:
 sources=json.loads((SRC/'SOURCES.json').read_text())
else:
 sources={}
 for asset in ['asphalt_02','plastered_wall_02','kloofendal_48d_partly_cloudy_puresky']:
  files=json.loads(get('https://api.polyhaven.com/files/'+asset)); info=json.loads(get('https://api.polyhaven.com/info/'+asset));sources[asset]={'url':'https://polyhaven.com/a/'+asset,'license':'CC0','authors':info.get('authors',{}),'files':{}}
  for key in (['hdri'] if asset.startswith('kloof') else ['Diffuse','nor_gl','arm']):
   ext='hdr' if key=='hdri' else ('jpg' if key=='Diffuse' else 'png');res='2k' if key=='hdri' else '1k'
   available=files[key][res];entry=available.get(ext,next(iter(available.values())));dst=SRC/(asset+'-'+key+'.'+entry['url'].split('.')[-1])
   if not dst.exists():dst.write_bytes(get(entry['url']))
   sources[asset]['files'][key]={'path':str(dst),'url':entry['url'],'md5':entry.get('md5')}
 (SRC/'SOURCES.json').write_text(json.dumps(sources,indent=2)+'\n')
for key,suffix in [('Diffuse','color'),('nor_gl','normal'),('arm','orm')]:
 p=Path(sources['asphalt_02']['files'][key]['path']);Image.open(p).convert('RGB').resize((512,512),Image.Resampling.LANCZOS).save(OUT/('street-asphalt-'+suffix+'.png'))
rng=random.Random(20261019)
plaster=Image.open(sources['plastered_wall_02']['files']['Diffuse']['path']).convert('RGB').resize((256,256))
atlas=Image.new('RGB',(1024,1024));orm=Image.new('RGB',(1024,1024),(255,210,0));normal=Image.new('RGB',(1024,1024),(128,128,255))
colors=[(194,175,143),(129,150,136),(157,99,76),(150,145,128),(111,119,119),(142,94,67),(81,88,85),(38,55,64),(211,198,159),(30,31,29),(35,40,38),(213,211,192),(74,85,47),(122,108,78),(221,205,157),(102,114,95)]
for i,c in enumerate(colors):
 tile=Image.new('RGB',(256,256),c);d=ImageDraw.Draw(tile)
 if i<4:
  arr=np.asarray(plaster).astype(float);arr=arr/np.mean(arr,axis=(0,1))*np.array(c);tile=Image.fromarray(np.uint8(np.clip(arr,0,255)));d=ImageDraw.Draw(tile)
  pn=Image.open(sources['plastered_wall_02']['files']['nor_gl']['path']).convert('RGB').resize((256,256));normal.paste(pn,((i%4)*256,(i//4)*256))
 for k in range(2800):
  x,y=rng.randrange(256),rng.randrange(256);a=rng.randint(-16,12);d.point((x,y),fill=tuple(max(0,min(255,v+a)) for v in c))
 if i in (4,5):
  for x in range(0,256,16):
   d.rectangle((x,0,x+3,255),fill=tuple(min(255,v+23) for v in c));d.line((x+12,0,x+12,255),fill=tuple(max(0,v-29) for v in c),width=2)
  for k in range(50):
   x,y=rng.randrange(256),rng.randrange(256);d.ellipse((x,y,x+rng.randrange(2,15),y+3),fill=(110,68,41))
 if i==3:
  for y in range(0,256,48):
   d.line((0,y,255,y),fill=(85,83,77),width=2)
   for x in range((-32 if y%96 else 0),256,64):d.line((x,y,x,y+48),fill=(85,83,77),width=2)
 if i==7:
  for y in range(256):d.line((0,y,255,y),fill=(int(39+y*.06),int(55+y*.05),int(67+y*.06)))
  d.polygon([(0,210),(256,45),(256,63),(0,227)],fill=(80,99,106))
 if i in (0,1,2,3):
  for k in range(35):
   x=rng.randrange(256);y=rng.randrange(215,255);d.line((x,y,x+rng.randrange(-4,5),255),fill=tuple(max(0,v-35) for v in c),width=rng.randrange(1,4))
 if i==8:
  for k in range(430):
   x,y=rng.randrange(256),rng.randrange(256);d.ellipse((x,y,x+3,y+5),fill=(98,94,82))
 if i==9:
  for x in range(0,256,22):d.line((x,0,x-30,255),fill=(47,47,43),width=5)
 if i==14:
  d.rectangle((4,5,251,250),fill=(36,66,59));font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26)
  for y,s in [(30,'GENERAL'),(66,'DEALER'),(143,'DAILY'),(179,'ESSENTIALS')]:d.text((128,y),s,font=font,anchor='mt',fill=(230,217,174))
 atlas.paste(tile,((i%4)*256,(i//4)*256))
 od=ImageDraw.Draw(orm);od.rectangle(((i%4)*256,(i//4)*256,(i%4+1)*256-1,(i//4+1)*256-1),fill=(255,65 if i==7 else 180 if i in (4,5,6) else 228,190 if i in (4,6) else 0))
atlas.save(OUT/'street-trim-color.png');normal.resize((512,512)).save(OUT/'street-trim-normal.png');orm.resize((512,512)).save(OUT/'street-trim-orm.png')
print('STREET_SOURCE',json.dumps(sources))
# Original airy compound-leaf tile, alpha tested rather than a solid canopy mass.
# Every other trim tile remains opaque. Colour and opacity share the same KTX2.
atlas=atlas.convert('RGBA')
leaf=Image.new('RGBA',(256,256),(49,66,29,0));ld=ImageDraw.Draw(leaf)
frng=random.Random(371)
for branch in range(8):
 x0,y0=128,242; x1=frng.uniform(18,238);y1=frng.uniform(15,160)
 ld.line((x0,y0,x1,y1),fill=(72,73,39,255),width=2)
 dx,dy=x1-x0,y1-y0;length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length
 for j in range(3,15):
  t=j/15;cx,cy=x0+dx*t,y0+dy*t
  for sign in [-1,1]:
   size=frng.uniform(7,13)*(1-t*.4);w=frng.uniform(2.7,4.5)
   tip=(cx+nx*size*sign-dx/length*size*.35,cy+ny*size*sign-dy/length*size*.35)
   mid=((cx+tip[0])*.5,(cy+tip[1])*.5)
   shade=frng.randrange(26)
   ld.polygon([(cx,cy),(mid[0]+dx/length*w,mid[1]+dy/length*w),tip,(mid[0]-dx/length*w,mid[1]-dy/length*w)],fill=(65+shade,81+shade,30+shade//2,255))
atlas.paste(leaf,(0,768))
atlas.save(OUT/'street-trim-color.png')
