# Accessibility

Verified in the IWER Quest 3 emulator (desktop browser) and by unit tests. Physical
comfort and text legibility on a real headset still need a hardware pass.

Legend: ✅ done · 🟡 partial · ⬜ to do

| Feature | Electrical | Water | Roads | Fire/EMS | On-site Assist |
|---|---|---|---|---|---|
| Hands-only, no controller | ✅ | ✅ | ✅ | ✅ | ✅ |
| Poke-only operation | ✅ | ✅ | ✅ | 🟡 placement needs pinch | ✅ |
| Gaze + pinch (ray) on panels | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dwell select (1.2 s) | ⬜ | ⬜ | ⬜ | ⬜ | ✅ (SOS keeps a 2 s hold) |
| One-handed / left-handed panel swap | ✅ | ✅ | ✅ | ✅ | ✅ |
| Captions on by default, can be turned off | ✅ | ✅ | ✅ | ✅ | ✅ |
| Caption size M / L / XL (panels grow) | ✅ | ✅ | ✅ | ✅ | ✅ |
| High contrast | ✅ | ✅ | ✅ | ✅ | ✅ (STOP / No stays red) |
| Colour + shape + text, never colour alone | ✅ | ✅ | ✅ | ✅ triage tags | ✅ |
| Reduced motion (steady beacons, no sway, held background actors) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Seated reach ≤ 0.55 m | ✅ bench | 🟡 | 🟡 | 🟡 | ✅ |
| Persisted settings (`civicops.accessibility.v1`) | ✅ | ✅ | ✅ | ✅ | ✅ |

URL overrides: `contrast=high`, `motion=reduced`, `captions=L` or `XL`, `hand=left`,
`quickstart=1` (force the first-run card) or `quickstart=0` (skip it).

Automatic coaching never reduces the score for reading time or slower hand movement;
requested hints cost five points. Practice certificates are local learning evidence,
not permission to perform real work.
