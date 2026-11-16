/**
 * Headset-free judging: the IWER Quest 3 emulator is bundled into a production build.
 * IWSDK 1.0.1 reads emulator options only from iwsdk.config.json, so the judge build
 * derives a temporary manifest from the committed one (see build-judge.mjs).
 */
export const JUDGE_EMULATOR = Object.freeze({
  injectOnBuild: true,
  activation: 'always',
  // Quest Browser has native WebXR and real hands; never emulate there.
  userAgentException: Object.freeze({ source: 'OculusBrowser' }),
});

/** Return the manifest text with the judge emulator merged in, keeping the file's line endings. */
export function judgeManifestText(text) {
  const manifest = JSON.parse(text);
  const emulator = { ...(manifest.dev?.emulator ?? {}), ...JUDGE_EMULATOR, userAgentException: { ...JUDGE_EMULATOR.userAgentException } };
  const judged = { ...manifest, dev: { ...(manifest.dev ?? {}), emulator } };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(judged, null, 2).replace(/\n/g, eol) + (/\r?\n$/.test(text) ? eol : '');
}
