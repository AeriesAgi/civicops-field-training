"""Downsample a CC0 South African overcast HDRI; retain HDR lighting range."""
import bpy,pathlib
src=pathlib.Path('asset-src/library/hdri/kloofendal_misty_morning_1k.hdr')
im=bpy.data.images.load(str(src));im.scale(512,256);im.filepath_raw=str(pathlib.Path('public/textures/storm-sky.hdr').resolve());im.file_format='HDR';im.save()
print('STORM SKY',pathlib.Path(im.filepath_raw).stat().st_size,flush=True)
