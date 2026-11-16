# Local instructor voice files

The shipped `en/manifest.json` is intentionally empty. English captions and
browser `speechSynthesis` provide the default instructor. Nothing opens a voice
service connection, requests a microphone, or stores a provider key.

To add pre-rendered voice later, place a licensed/self-made rendering at
`en/<lineId>.mp3` (or `.ogg`) and add an entry in `en/manifest.json`:

```json
{
  "schema": "civicops.instructor-audio.v1",
  "language": "en",
  "lines": {
    "apply-lock.why": "apply-lock.why.mp3"
  }
}
```

All IDs and exact text are in `src/training/instructor-script.ts`. Files and
manifest entries can be added without changing code; refresh the application
to pick up the manifest. File URLs stay within this language directory. Every
missing, invalid, or unplayable line falls back to device/browser speech while
its caption remains visible. The shared master volume controls both voices.

The future `ElevenLabsAgentInstructor` is a no-network stub. Its four local
client tools are `get_step_state`, `highlight_object`, `repeat_demo`, and
`explain_why`. No provider renders or external calls are performed in vr04.
