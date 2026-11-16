# Asset provenance

Everything in this repository is either original Culltron work or third-party content
whose licence allows redistribution. Original artwork (Blender-built equipment, streets,
Fire/EMS vehicles and synthetic mannequins, UI, procedural sound and the Culltron mark)
is dedicated to the public domain under **CC0 1.0**. Code is **MIT** (see `/LICENSE`).
The same credits are shown in the app (`public/credits.html`).

## Third-party artistic content in `public/`

| Content | Used in | Source / author | Licence | Changes |
|---|---|---|---|---|
| Barrier & Traffic Cone Pack (one cone) | `models/roads-cone.glb`, `models/room-rehearsal-kit.glb` | [Sketchfab](https://sketchfab.com/3d-models/23c4dfca76a24bf0b21894847867af2a), Sabri Ayeş | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Single cone selected, metre scale, resized PBR maps, meshopt + KTX2. |
| Low-poly minibus base | `models/street-actors.glb` (taxi), `models/roads-crew-van.glb` | [Sketchfab](https://sketchfab.com/3d-models/low-poly-2013-toyota-hiace-f83b4ed4d8534efb81def77b6c1b642d), Alvin.Woodly | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | All badges and manufacturer marks removed, generic grille, roof rack, generic boards, municipal service finish, reduced geometry. |
| Ultimate Modular Women (generic worker) | `models/street-actors.glb`, `models/roads-marshal.glb` | [Quaternius](https://quaternius.com/packs/ultimatemodularwomen.html) | CC0 1.0 | Hi-vis workwear, connected surfaces, reduced geometry, anonymous variations, original STOP/GO paddle. |
| Utility Box 02 | `models/room-rehearsal-kit.glb` | [Poly Haven](https://polyhaven.com/a/utility_box_02), James Ray Cock | CC0 | Reduced, grounded, compressed. |
| Empty Workshop HDRI | `models/emulator-depot-room.glb` | [Poly Haven](https://polyhaven.com/a/empty_workshop), Sergej Majboroda | CC0 | Tone-mapped panorama; emulator-only simulated passthrough. |
| Asphalt 02, Plastered Wall 02 | `textures/street-*.ktx2` | [Poly Haven](https://polyhaven.com/a/asphalt_02) (Rob Tuytel), [Poly Haven](https://polyhaven.com/a/plastered_wall_02) (Charlotte Baglioni) | CC0 | Resized, packed trim atlas, KTX2. |
| Kloofendal partly cloudy pure sky, Kloofendal misty morning | `textures/street-sky.hdr`, `textures/storm-sky.hdr` | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), Greg Zaal / Jarod Guest | CC0 | Resized HDR. |
| Small Workshop HDRI | `textures/workshop-ibl.hdr` | [Poly Haven](https://polyhaven.com/a/small_workshop), Dimitrios Savva, Jarod Guest | CC0 | Resampled to 512×256. |

## Not included in this repository

The hosted build at <https://fieldtraining.culltron.app> uses baked character motion
(idle, walk, wave, signal clips) licensed for in-app use only, which may not be
redistributed as assets. Those animation clips have been **removed** from
`street-actors.glb` and `roads-marshal.glb` here. The code handles their absence:
marshals stand in their rest pose (STOP/GO signalling still works) and the
wandering background crew is omitted. All training interactions are unaffected.

## Software and fonts

- Meta Immersive Web SDK (IWSDK) and IWER emulator, three.js (super-three),
  @pmndrs/uikit, meshoptimizer: MIT.
- Inter font: SIL Open Font Licence 1.1, via @pmndrs/msdfonts MSDF atlases.
- Tracked hand meshes: [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles), MIT, loaded at runtime.
- Basis Universal transcoder and Google Draco decoder in `public/decoders/`:
  Apache 2.0, licence and notice beside them.

## Rebuilding art

`tools/blender/` and `scripts/optimize-*.mjs` are the original build scripts for the
CC0 artwork. They expect Blender on `PATH` and the CC0 source downloads listed above
under a local, git-ignored `asset-src/` folder. They are not needed to run the app.
