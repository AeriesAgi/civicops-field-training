"""Build all four street assets with their original functional geometry intact."""
from pathlib import Path
import sys,runpy,importlib.util,bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));APP=HERE.parents[1]
for filename,function in [('build-fullscale-street.py','main'),('build-water-hero.py','water_road'),('build-roads-hero.py','street_scene'),('build-fire-hero.py','street')]:
 if '--' in sys.argv and sys.argv[sys.argv.index('--')+1:] and filename not in sys.argv[sys.argv.index('--')+1:]:continue
 print('REALISM_BUILD',filename,flush=True)
 spec=importlib.util.spec_from_file_location('field_builder',HERE/filename);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);getattr(module,function)()
from street_realism import export_actors
export_actors()
# Small outdoor HDRI used both for IBL and the visible sky, replacing workshop reflections.
source=Path('asset-src/polyhaven/street/kloofendal_48d_partly_cloudy_puresky-hdri.hdr')
im=bpy.data.images.load(str(source));im.scale(512,256);im.file_format='HDR';im.filepath_raw=str(APP/'public/textures/street-sky.hdr');im.save()
print('REALISM_BUILD_DONE',flush=True)
