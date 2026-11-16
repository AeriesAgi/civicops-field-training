# CivicOps Field Training

Hands-on municipal safety practice in WebXR for Meta Quest, built on Meta's
Immersive Web SDK (IWSDK). Field crews rehearse high-risk jobs in full-scale South
African street scenes before they do them for real:

- **Electrical isolation** (lock-out / tag-out, prove dead)
- **Water** burst-main isolation and repair readiness
- **Roads** work-zone protection (cones, signs, stop/go marshals)
- **Fire/EMS** crash-scene safety and triage
- **On-site Assist** (AR): room-anchored checklists, STOP gates and a hash-chained step log

CivicOps Field Training is a brand-new experience (Meta VR Start, *New Experience*
division). The work orders, crews and incidents in it are **sample, synthetic
training data**. Practice certificates are local learning evidence, not permission
to perform real work; employer SOPs and authorised supervision govern real work.

- **Try it:** <https://fieldtraining.culltron.app> (Quest Browser → Enter VR, or a desktop browser)
- **Video:** <https://youtu.be/1I882MbsXVc>

## Try it without a headset

Open the live link in a desktop browser and choose **Try on desktop**. Electrical
isolation is fully playable with mouse and keyboard: drag to look, WASD to step,
wheel to lean, click tools and breakers, hold Space to confirm, H for a hint, Esc to
put a tool back. Water, Roads and Fire/EMS use a headset or the built-in Meta Quest
emulator (**Enter VR** on the title screen). Append `?module=elec-loto` (and
`&title=0` to skip the title screen) for a direct replay.

## Run locally

Requires Node 22.12+ (see `apps/vr-training/.nvmrc`).

```sh
cd apps/vr-training
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run typecheck
npm test
npm run build
npm run dev        # IWSDK dev server with the Meta Quest emulator
```

Stop the dev server with `npm run dev:down`. `npm run dev:runtime` starts plain Vite.
The CUDA flag only skips an optional ONNX Runtime download; no GPU is needed.

## Tech

- [Meta Immersive Web SDK](https://github.com/facebook/immersive-web-sdk) (ECS, grabbing,
  locomotion, spatial UI), WebXR hand tracking, IWER emulator
- TypeScript, three.js (super-three), @pmndrs/uikit, Vite, Vitest
- Original Blender-built CC0 art, meshopt + KTX2 compression
- Live AI instructor: in the hosted judge build, trainee "why" questions are answered
  by Meta's Muse Spark model through the Meta AI API, via a server-side Azure Static
  Web Apps function at `/api/instructor/ask` (`apps/vr-training/api/instructor-ask`).
  The key is a server-side app setting (`META_API_KEY`) and is not included in this
  repository or the browser bundle. Without it, or on any error, the scripted
  instructor lines are used.
- Captions, scoring and results run entirely in the browser

## Repository layout

- `apps/vr-training/` – the WebXR app ([app guide](apps/vr-training/README.md),
  [asset provenance](apps/vr-training/ASSETS.md), [accessibility](apps/vr-training/ACCESSIBILITY.md))
- `contracts/` – JSON Schemas for training attempts and field step logs
- `docs/` – training programme scope, On-site Assist and [responsible AI](docs/RESPONSIBLE_AI.md)

## Licence and credits

Code is released under the [MIT licence](LICENSE). Original artwork is CC0 1.0.
Third-party CC0 / CC BY 4.0 assets are credited in
[ASSETS.md](apps/vr-training/ASSETS.md) and in the app.

**Assets removed from this repository.** The hosted judge build and the demo
video use licensed Adobe Mixamo character animation (the street crew and the
Roads marshal). Mixamo's terms allow that animation to be used and shown inside
the app, but not redistributed as standalone files, so the animated models have
been removed from this public repository. The models here are the same
characters without their animation clips. Everything else needed to build and
test the app is included.

Built by **Culltron, South Africa**, by a solo founder working with AI coding and
media tools.
