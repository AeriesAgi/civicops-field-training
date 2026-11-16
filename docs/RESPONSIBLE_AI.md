# Responsible AI and on-site assistance

Culltron CivicOps Field Training VR uses synthetic municipal jobs. Procedures are
illustrative training based on generic municipal practice; follow your employer's
SOPs. A human decides every police, safety and work action. The application may
advise, gate a training step and record its structured outcome. It never authorises
real work, trench entry, police action, patient care or emergency response.

## Hard boundaries

- No facial recognition, biometric identification, face detection or matching,
  person identification, or plate-to-person lookup. Camera and passthrough work
  may detect or annotate objects and situations only: hazards, vehicles, fire,
  smoke, water, cones, lines, trenches and utility assets.
- No person-level risk, threat or criminality scores and no predictive policing.
  Police and EMS guidance may describe lane exposure, hazards, unit positions and
  ETAs. It must never label a person as suspicious or infer criminality.
- No recording or covert surveillance. On-site assistance processes on-device
  and records no video, audio or passthrough frames. Its step log holds structured
  outcomes only. There is no continuous tracking. Any future location sharing
  must be on-shift, explicitly consented and visibly active.
- A worker, officer, supervisor or authorised responder makes the action decision.
  Guidance is training and decision support, never a replacement for SOPs, an
  authorised person or emergency services.

## Enforcement in this repository

`src/training/assist-contract.ts` is the shared on-site assist boundary. Annotation
types allow object kinds and situational hazard codes only, without identity,
biometric, plate or person-score fields. `parseAssistObjectAnnotation` checks exact
allowed fields and rejects any extra property. `validAssistPolicy` accepts only
on-device processing, recording off, continuous tracking off and human decisions.
On-shift sharing is rejected unless consent and visibility are both true.

`AssistStepLog` has exactly seven fields: schema, option, step, outcome, hazards,
decision and elapsed time. Steps and hazards use closed vocabularies. The parser
rejects extra fields, nested payloads, media, coordinates, identifiers and free-form
notes. A confirmed step requires explicit human confirmation. Parsers return copied
data, so a caller cannot add data to a validated object by mutating its source.
Guard tests reject media and identity fields, person annotations, risk labels,
background tracking, unconsented/invisible location sharing and automatic decisions.

Module reducers are pure and run locally. The water lesson protects its synthetic
hospital supply valve C, stops unsafe closure and entry attempts, and states that
an authorised person makes the final readiness decision. The electrical lesson
requires its existing isolation and prove-test-prove gates. Roads checks only
object geometry: warning distance, taper, barrier clearance and safe marshal
positions. The marshal figures are synthetic training props without facial
detail or identity fields; no person is detected, identified or scored. The
worker explicitly chooses Zone check and Run traffic. The simulation never
authorises real traffic control or work. The scene is presented at 1:1 field
scale; operational spacing and traffic control remain governed by employer SOPs.

The Fire and EMS lesson uses the same outcome engine on a full-scale arterial
crash. Casualties are anonymous synthetic mannequins with numbered vests and
featureless visors. Status cards show walking, breathing, pulse and command
cues only. Triage tags carry a colour, a shape and a printed word. The handover
card stores category counts, hazard ids, requested units and
`cableStatus: treat-as-live`. It has no name, vest-to-person link, photograph,
media or location. Treat the downed line as live until Electricity confirms it
dead; that confirmation is the electrical isolation lesson, logged as a
cross-agency training outcome. A human decides every safety, medical and work
action. The drill is illustrative training and decision support. It does not
replace SOPs, an authorised person or emergency services, and it records no
video, audio or passthrough frames.

All four lessons feed one shared
outcome, scoring and certification engine. Simulated customer notification is a
local training outcome; no message is sent by this offline build.

## On-site assist (AR), vr06

- All three assist options run on the device. Nothing is captured, stored or sent from camera frames, audio or video.
- Hazards come from manual placement or a mocked control feed. There is no detection.
- The police / EMS overlay shows own units only. It never identifies people, labels suspects or tracks bystanders.
- STOP gates and the SOS button are decision support. SOS in the demo is simulated and always shows the national emergency numbers.
- The field step log holds structured outcomes, a pseudonymous worker id and a hash chain, with no media, location or free text. Guard tests enforce this (`field-assist.test.ts`, `field-step-log.test.ts`).

## Current capability and future changes

This round's on-site assist entry is an offline options and safety preview. It
does not implement camera sensing, object detection, geolocation, location sharing
or media capture. The contracts constrain future implementation; they are not a
claim that those capabilities already exist. Any future sensing integration must
use these strict parsing/storage boundaries and extend the guard tests before it
is enabled. Local training certificates are practice evidence, never professional
authorisation or a replacement for external/field assessments in the catalogue.

Roads guard tests whitelist `RoadsPlacement` fields (`id`, `x`, `z`, `yaw`) as
temporary prop placement, and reject sensing/recording/location APIs or
identity/risk fields in the Roads runtime. Existing strict assist parsers
continue rejecting media and identity additions at the storage boundary.
Instructor audio is generated or local browser speech, never captured.

## vr14 pre-shift decisions

Each field module now gates entry behind a human-authority briefing, site hazards
and PPE/equipment readiness questions. Unsafe choices stop and save a failed
practice attempt; uncertainty or a corrected answer never authorises live work.
The app does not sense whether actual PPE is worn or inspect a real installation.
Preparation evidence contains only fixed step identifiers, outcomes, timestamps
and scripted feedback in the existing strict training contract. No media or
person-identity fields are introduced. Safety precedes accuracy; time is reviewed
last and does not reward rushing. Conditional practice awards no new pass.

## Round 4 native room anchoring

The AR compositor supplies passthrough; the app does not read its pixels. Native
planes/poses are transient placement inputs. The room store accepts exactly a
version and an opaque persistent-anchor handle, rejecting additional fields. No
room scan, polygon, pose, audio or image is stored by the app. Field logs retain
the original strict object/situation and human-decision contract. Real lanes must
be calibrated by the human; synthetic street coordinates are not mapped onto a
real room. Native anchor restore, unsupported APIs and unavailable storage have
tests. Repeat pin/manual-fallback interaction remains unverified in full runtime.
