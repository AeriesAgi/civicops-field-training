# Municipal field programmes

Illustrative training based on generic municipal practice; follow your employer's
SOPs. An authorised person decides every work, traffic, medical and safety action.
Local practice certificates are not accreditation or permission for live work.

Every field entry now requires six answered pre-shift checks: authority briefing,
three site hazards, and two PPE/equipment or crew-readiness checks. Correct answers
advance; a correctable mistake holds the same question and records remediation.
An unsafe decision immediately fails and saves a stopped attempt. The trainee
must repeat preparation before entering the site. These are knowledge checks and
human confirmations, not sensing of actual clothing, equipment or qualifications.

After preparation, trainees manipulate the existing full-size field equipment and
complete its procedure gates. Results include preparation evidence, safety-gate
coverage, corrections, pace feedback, debrief, local ladder and retry/hub controls.
An in-session retry retains the same accepted site brief; returning to work orders
and entering again requires fresh preparation. Conditions must be reassessed on site.

| Programme | Preparation + procedure gates | Practice timebox | Current assessed scope |
| --- | --- | --- | --- |
| [Electrical](elec-loto.md) | 6 + 9 | 8 minutes | Identification, isolation, personal lock/tag and prove-test-re-prove |
| [Water](water-burst.md) | 6 + 7 | 10 minutes | Street protection, valve isolation and excavation repair readiness |
| [Roads](roads-zone.md) | 6 + 13 (rain); 6 + 7 (legacy) | 12–15 minutes | Rain incident response, protected traffic layout, tape, motorist decision, job card and repair scheduling |
| [Fire / EMS](scene-safety.md) | 6 + 7 | 8 minutes | Scene protection, hazard recognition, simulated triage and handover |
| [On-site Assist](on-site-assist.md) | Derived job steps + STOP holds | 5–10 minutes | Human checks and structured offline log; room-aware MR unfinished |

## Assessment and repeat practice

Safety is the first decision: unsafe acts and missing or incorrectly performed
critical procedure checks fail regardless of the numeric score. Accuracy follows:
start at 100, subtract 10 for each ordering/preparation correction and 5 for each
requested hint. All procedure gates must be completed and score must be at least
80 for a practice pass. Completing the checks safely below 80 is **conditional**:
repeat with supervision; no practice pass or ladder progress is awarded. Incomplete
or unsafe work is **fail**. Pace is reviewed last against the programme timebox;
there is no speed bonus or slow-user deduction. Employers determine real timings.

One pass earns Bronze; three passes at 80+ earn Silver; five 90+ passes over at
least three distinct days earn Gold (Fire labels these Levels 1–3). Evidence expires
after 12 months and a **refresher is due**; an expired level is never current authority.
Results also suggest a seven-day practice refresher, separate from certificate
expiry. Daily seeded variants and streaks support repeat practice. Scores are practice
outcomes, never person-level risk or suitability predictions.

A supervisor can assign an offline scenario by sharing a prepared local app link,
for example `?module=water-burst&seed=1` for the seized-B/alternative-route drill,
`?module=roads-zone&seed=2` for a blind bend, `?module=elec-loto&seed=1` for a
mislabelled breaker, or `?module=scene-safety&seed=1` for deteriorating casualty
practice. Briefing remains mandatory. No message is sent, no backend assignment
service is implied and no deployment is performed by these examples.

## Validation and boundaries

`npm run test:e2e` covers pure procedure completion, saved evidence and ladder;
`programme-state.test.ts` covers preparation, remediation, unsafe stops and
competency ordering. `npm run e2e:xr -- electrical water roads fire assist` uses
actual IWER tracked-hand input, including every preparation answer. A command
invocation is not a pass; the final round report lists actual outcomes.

Physical Quest FPS/reach, complete runtime coverage and employer validation remain
release gates. Water clamp/torque/recommissioning and actual pothole patching are
not yet implemented; their programmes explicitly stop at their assessed boundaries.
No downloadable artwork or training text claims an operational qualification.
