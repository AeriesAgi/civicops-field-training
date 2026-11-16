import type { AccessibilitySettings } from './accessibility-settings.js';
import type { AccessibilityProfile, TrainingAttempt } from './contracts.js';

/** Record the settings actually used, keeping the v1 evidence schema unchanged. */
export function attemptAccessibility(settings: AccessibilitySettings): AccessibilityProfile {
  return {
    oneHanded: settings.oneHanded,
    gazePinch: settings.gazePinch,
    highContrast: settings.highContrast,
    captions: settings.captions,
    seated: true,
    benchHeightOffset: settings.benchHeightOffset,
  };
}

/** A headed IWER session is still emulated; a desktop view is not headset evidence. */
export function attemptDevice(
  immersive: boolean,
  host: { readonly IWER_DEVICE?: unknown } = globalThis as { IWER_DEVICE?: unknown },
): TrainingAttempt['device'] {
  const emulated = !immersive || Boolean(host.IWER_DEVICE);
  return {
    runtime: emulated ? 'emulated' : 'native',
    deviceName: emulated ? 'IWSDK browser emulator' : 'WebXR hands',
  };
}
