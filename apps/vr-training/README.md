# CivicOps Field Training – app

WebXR training app built with Meta's Immersive Web SDK (IWSDK). See the
[repository README](../../README.md) for the overview, live link and video.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install (set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`) |
| `npm run dev` | IWSDK dev server with the managed Meta Quest emulator |
| `npm run dev:runtime` | Plain Vite dev server (port `VR_PORT`, default 8081) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest unit and playthrough tests |
| `npm run build` | Production build to `dist/` |
| `npm run e2e:xr` | Hand-input end-to-end paths in the emulator (needs the IWSDK CLI's Chromium) |

## Modules and deep links

| Module | Query |
|---|---|
| Electrical isolation (desktop + XR) | `?module=elec-loto` |
| Water burst main | `?module=water-burst` |
| Roads work zone | `?module=roads-zone` |
| Fire/EMS scene safety | `?module=scene-safety` |
| On-site Assist (AR) | `?mode=assist` |

Add `&title=0` to skip the title screen. Accessibility overrides are listed in
[ACCESSIBILITY.md](ACCESSIBILITY.md).

## Layout

- `src/` – ECS systems (`*-system.ts`), procedures and scoring (`src/training/`),
  title/menu/HUD (`src/ui/`), procedural scene assets (`src/scene-assets/`)
- `public/scenes/` – IWSDK scene JSON; `public/ui/` – UIKitML panels;
  `public/models/`, `public/textures/` – compressed CC0 / CC BY art
- `scripts/` – emulator end-to-end drivers, build report, asset optimisers
- `tools/blender/` – original Blender build scripts for the CC0 art

## Data and privacy

Work orders are sample, synthetic training data
(`src/training/catalog/work-orders.snapshot.json`). Practice results and Assist step
logs stay in the browser's local storage. The app records no audio or video and
contacts no live municipal system; simulated notifications go nowhere.

## Assets

See [ASSETS.md](ASSETS.md). Licensed character animation clips used by the hosted
build are not redistributed here; the app runs without them.
