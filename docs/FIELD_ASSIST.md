# On-site assist (AR) — CivicOps Field Training

**Purpose.** The same training procedures guide crews and officers on the real job so they "don't mess up". It is decision support only. It never replaces employer SOPs, a supervisor, authorised-person rules or emergency services. A human decides every safety, police, medical and work action.

Open it from the department board (**On-site assist (AR)** tab → *Open on-site assist*) or deep link `?mode=assist&option=crew|hazard|sa&workOrderType=ELECTRICITY|WATER|ROADS|FIRE`. The app requests `immersive-ar` passthrough where available. The native AR path now uses a room-only scene and the IWER synthetic meeting room. The virtual street is not loaded. Floor placement and persistent reload have emulator evidence; full re-pin/manual fallback replay remains a release gate.

Input: gaze + pinch (ray) or poke. Cards lazy-follow about 0.7 m ahead within ±15–20° of the gaze line. A persistent **"Not recording · On-device"** chip is always shown.

## Option 1: Crew job-step guide with STOP gates
- Field steps are **derived from the training module definitions** (`fieldStepsFor`). No procedure data is duplicated.
- Every critical step is a red **"Check before you touch"** gate with a specific check (for example "Tester reads 0 V on every terminal pair?"). The crew answers **Confirmed**, then **pinches and holds for 1 s**.
- **No** or **Not sure** puts the guide into a **Stop-work** state: make safe, call control, log it. The guide only resumes after a re-check, and then the gate needs the hold again. Skipping past a gate is refused.
- Screens: `vr06-crew-step-card`, `vr06-crew-stop-gate`, `vr06-crew-stop-work`.

## Option 2: Hazard callouts
- Markers for live line down (10 m), gas leak (25 m), fuel spill (6 m), open trench (2 m), flooding and fire. These are illustrative default radii; the SOP value always wins.
- Markers are placed by the crew (4 m ahead) or pushed by control through a **mocked feed**. There is no detection and no camera analysis.
- Each marker has a pulsing exclusion ring, a distance readout and a calm "approaching" or "inside" warning (visual plus one tone), plus a "what to do" card.
- Screens: `vr06-hazard-live-line`, `vr06-hazard-gas-trench`, `vr06-hazard-proximity-warning`.

## Option 3: Police / EMS situational awareness
- **Lane exposure:** "You are in a live lane" or "Live lane close by", with a red edge glow. Lanes come from the mocked scene layout or a two-point pinch calibration.
- **Own units only:** a compass ring with unit-type shapes (square police, circle EMS, triangle fire) and distances. **Backup ETA** comes from a mocked dispatch feed.
- **SOS:** hold for 2 s. Releasing early cancels. The demo shows "SOS sent to control (simulated)" and always displays *Life-threatening emergency: call 10111 / 10177 / 112*.
- There is NO face recognition, NO person identification and NO suspect or threat labels. Only lanes, vehicles, hazards and own units are annotated.
- Screens: `vr06-sa-lane-exposure`, `vr06-sa-units-eta`, `vr06-sa-sos`.

## Field step log and data flow
- `FieldStepLogEntry` (`contracts/field/field-step-log.v1.schema.json`) records: work-order ref, type code, a pseudonymous worker id (`wk-xxxxxxxx`) and a structured `civicops.assist.step.v1` outcome.
- Entries form an append-only **SHA-256 hash chain** (WebCrypto). They are verified on load (a tampered tail is dropped), persisted locally and exportable as JSON (`vr06-log-export`).
- Proposed endpoint: `POST /api/v1/field/step-logs` with an idempotency key per entry and an offline queue. This is **a proposal only; it is not implemented in CivicOps**, and sync is disabled in demo mode. No tokens are embedded.

## Tests
`src/training/field-assist.test.ts` covers the gate state machine (skip, wrong order, stop-work, resume), radius and proximity, lane-exposure geometry, unit bearings, SOS hold and a privacy guard. `field-step-log.test.ts` covers the chain, tamper detection and the schema guard.
