import { configureRoomEntry } from './ar-entry.js';
import { ACESFilmicToneMapping, GrabSystem, LocomotionSystem, SRGBColorSpace, TeleportSystem, TurnSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { configureMeshoptDecoder } from './meshopt-loader.js';
import { configureLocalAssetDecoders } from './asset-loader-config.js';
import { ModuleBoardSystem } from './module-board-system.js';
import { FieldSkySystem } from './field-sky-system.js';
import { StreetLifeSystem } from './street-life-system.js';
import { HandVisualSystem } from './hand-visual-system.js';
import { DesktopControlsSystem } from './desktop-controls-system.js';
import { TitleScreen } from './ui/title-screen.js';
import { DesktopHud } from './ui/desktop-hud.js';

configureMeshoptDecoder();
configureLocalAssetDecoders();

configureRoomEntry(projectOptions, location.search);

// The title screen appears at once and covers loading; the world attaches when ready.
const title = new TitleScreen();
new DesktopHud(title);

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then(async (world) => {
    world.renderer.toneMapping = ACESFilmicToneMapping;
    world.renderer.outputColorSpace = SRGBColorSpace;
    // MSDF text stays crisp at native XR resolution; avoid a forced 25% fill-rate overhead.
    world.renderer.setPixelRatio(Math.min(1.5, Math.max(1, window.devicePixelRatio)));
    world.renderer.xr.setFramebufferScaleFactor(1.0);
    world.renderer.xr.setFoveation(1.0);
    world.renderer.shadowMap.enabled = false;
    world.getSystem(GrabSystem)!.config.useHandPinchForGrab.value = true;
    // IWSDK's locomotor uses the same action provider for controllers and
    // tracked hands. Enable its hand micro-gesture path explicitly so a right
    // hand thumb tap aims/commits teleport and a swipe drives snap turn;
    // no controller or joystick is required. The private child systems are
    // created asynchronously after the locomotor worker initialises, so apply
    // the flag once now and once on the next task without adding frame work.
    const enableHandLocomotion = () => {
      const locomotion = world.getSystem(LocomotionSystem) as unknown as {
        teleportSystem?: { config: { microGestureControlsEnabled: { value: boolean } } };
        turnSystem?: { config: { microGestureControlsEnabled: { value: boolean } } };
      } | undefined;
      locomotion?.teleportSystem?.config.microGestureControlsEnabled && (locomotion.teleportSystem.config.microGestureControlsEnabled.value = true);
      locomotion?.turnSystem?.config.microGestureControlsEnabled && (locomotion.turnSystem.config.microGestureControlsEnabled.value = true);
      // Retrieval also proves both SDK systems are active in the managed app.
      void world.getSystem(TeleportSystem);
      void world.getSystem(TurnSystem);
    };
    enableHandLocomotion();
    setTimeout(enableHandLocomotion, 0);
    world.registerSystem(HandVisualSystem);
    world.registerSystem(FieldSkySystem);
    world.registerSystem(StreetLifeSystem);
    world.registerSystem(ModuleBoardSystem);
    world.registerSystem(DesktopControlsSystem);
    const { QuickStartSystem } = await import('./quick-start-system.js');
    world.registerSystem(QuickStartSystem);
    void title.attach(world);
    if (import.meta.env.DEV) {
      const { PerformanceSystem } = await import('./performance-system.js');
      world.registerSystem(PerformanceSystem);
    }
  })
  .catch((error: unknown) => {
    console.error('Training scene could not start', error);
    title.failed();
  });
