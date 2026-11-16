import type { Object3D, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { CAPTION_SCALE, type AccessibilitySettings, type CaptionSize } from './training/accessibility-settings.js';

/**
 * L and XL text also enlarge the world-anchored controls panel. Scaling the panel keeps its fixed
 * two-button rows laid out exactly as authored, so larger button text can never re-wrap or overflow.
 */
export const CONTROLS_SCALE: Readonly<Record<CaptionSize, number>> = { M: 1, L: 1.15, XL: 1.3 };

export interface ModuleAccessibilityOptions {
  panels: ReadonlyMap<string, UIKitMLAsset>;
  /** Panel holding the `caption` element, and its authored font size / height. */
  captionPanel: string;
  captionFontSize: number;
  captionHeight?: number;
  /** Authored height of the caption panel root, grown so larger captions never overflow. */
  panelHeight?: number;
  /** World-anchored panel objects to swap for a left-handed layout (instructions vs controls). */
  steps?: Object3D;
  controls?: Object3D;
  /** Panels that become white-on-black text for high contrast. */
  contrastPanels?: readonly string[];
}

/** Apply the shared accessibility settings to a module's authored panels. Idempotent per load. */
export function applyModuleAccessibility(settings: AccessibilitySettings, options: ModuleAccessibilityOptions): void {
  const scale = CAPTION_SCALE[settings.captionSize];
  const caption = options.panels.get(options.captionPanel)?.getElementById<UIKit.Text>('caption');
  // Lines get longer as well as taller, so the caption box grows with the square of the font scale.
  const grow = scale * scale;
  caption?.setProperties({ fontSize: options.captionFontSize * scale, ...(options.captionHeight ? { height: options.captionHeight * grow } : {}) });
  if (options.panelHeight && grow > 1) {
    const extra = (options.captionHeight ?? options.panelHeight) * (grow - 1);
    options.panels.get(options.captionPanel)?.getElementById('panel-root')?.setProperties({ height: options.panelHeight + extra });
  }
  if (options.controls) {
    const authored = (options.controls.userData.authoredScale ??= options.controls.scale.x) as number;
    options.controls.scale.setScalar(authored * CONTROLS_SCALE[settings.captionSize]);
  }
  if (!settings.captions) caption?.setProperties({ display: 'none' });
  if (settings.highContrast) {
    for (const [name, panel] of options.panels) {
      if (options.contrastPanels && !options.contrastPanels.includes(name)) continue;
      panel.getElementById('panel-root')?.setProperties({ backgroundColor: '#ffffff', color: '#000000', borderColor: '#000000', borderWidth: 0.6 });
    }
  }
  if (settings.leftHanded && options.steps && options.controls) {
    const a = options.steps.position.clone(); const qa = options.steps.quaternion.clone();
    options.steps.position.copy(options.controls.position); options.steps.quaternion.copy(options.controls.quaternion);
    options.controls.position.copy(a); options.controls.quaternion.copy(qa);
  }
}
