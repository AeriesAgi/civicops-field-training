/** Site briefings are illustrative practice, never an authority to start live work. */
export interface ProgrammeCheck {
  id: string;
  phase: 'briefing' | 'hazards' | 'ppe';
  prompt: string;
  choices: readonly [string, string];
  correct: 0 | 1;
  remediation: string;
  critical?: boolean;
}
export interface TrainingProgramme {
  moduleId: string;
  title: string;
  context: string;
  minutes: number;
  checks: readonly ProgrammeCheck[];
  competencies: readonly string[];
}
const brief: ProgrammeCheck = {
  id: 'briefing', phase: 'briefing', prompt: 'Who authorises live work after this rehearsal?',
  choices: ['The authorised site supervisor', 'This practice certificate'], correct: 0,
  remediation: 'Your supervisor and employer SOPs govern live work. This is practice evidence.',
};
export const TRAINING_PROGRAMMES: Readonly<Record<string, TrainingProgramme>> = {
  'elec-loto': {
    moduleId: 'elec-loto', title: 'Electrical fault response', minutes: 8,
    context: 'Outage reported. A mini-sub door is open. Unverified connections and a generator may still energise SL-3.',
    competencies: ['Identify supplies', 'Personal lock and tag', 'Prove-test-re-prove', 'Human handover'],
    checks: [brief,
      { id: 'outage', phase: 'hazards', prompt: 'The street lights are out. Is the circuit dead?', choices: ['Yes, the outage proves it', 'No. Identify, isolate and test'], correct: 1, remediation: 'An outage is not isolation. Backfeed and illegal connections can leave conductors live.' },
      { id: 'bundles', phase: 'hazards', prompt: 'Tangled service wires hang from a pole. What now?', choices: ['Keep clear; report to control', 'Pull the loose cable away'], correct: 0, critical: true, remediation: 'Stop. Treat every unverified conductor as live. Keep the public clear and call control.' },
      { id: 'boundary', phase: 'hazards', prompt: 'Who sets the arc-flash boundary and PPE rating?', choices: ['Guess from the cabinet size', 'The approved site risk assessment'], correct: 1, remediation: 'Use the authorised assessment and equipment data. This scene gives no universal safe distance.' },
      { id: 'ppe', phase: 'ppe', prompt: 'Before approaching the isolation point, check:', choices: ['Rated PPE, visor, gloves and boots', 'A high-visibility vest only'], correct: 0, remediation: 'Confirm the electrical PPE specified by the assessment, its condition and rating before work.' },
      { id: 'tools', phase: 'ppe', prompt: 'Your tester or personal lock is damaged.', choices: ['Start and replace it later', 'Stop and replace before work'], correct: 1, critical: true, remediation: 'A damaged tester or lock cannot protect you. Replace it and repeat the pre-use checks.' },
    ],
  },
  'water-burst': {
    moduleId: 'water-burst', title: 'Burst main response', minutes: 10,
    context: 'Muddy water is crossing a live road. The burst is beside an open trench. Branch C supplies a hospital.',
    competencies: ['Protect street and trench', 'Plan isolation', 'Control valve speed', 'Verify pressure and entry readiness'],
    checks: [brief,
      { id: 'traffic', phase: 'hazards', prompt: 'Taxis squeeze past the flooded work area. First action?', choices: ['Enter the trench quickly', 'Protect traffic and pedestrian routes'], correct: 1, remediation: 'Establish traffic control, barriers and safe pedestrian access before valve work.' },
      { id: 'trench', phase: 'hazards', prompt: 'The trench looks shallow. Can you enter now?', choices: ['No; competent-person checks first', 'Yes; depth is the only hazard'], correct: 0, critical: true, remediation: 'Stop. Check shoring, access, spoil, atmosphere and flooding. Only an authorised person permits entry.' },
      { id: 'customer', phase: 'hazards', prompt: 'Closing hospital branch C would be quicker.', choices: ['Close it without telling control', 'Keep C open; use the approved route'], correct: 1, critical: true, remediation: 'Protect the critical customer. Control must authorise any interruption; use A-B or approved A-D.' },
      { id: 'ppe', phase: 'ppe', prompt: 'For muddy water and street exposure, check:', choices: ['Boots, gloves, eye and high-vis PPE', 'Everyday shoes and bare hands'], correct: 0, remediation: 'Inspect the task PPE and hygiene controls. Do not assume burst water is clean.' },
      { id: 'tools', phase: 'ppe', prompt: 'Check the valve key and pressure gauge before use.', choices: ['Skip checks to save time', 'Inspect condition and gauge function'], correct: 1, remediation: 'A sound key and verified gauge are prerequisites. Report defective equipment before isolation.' },
    ],
  },
  'roads-zone': {
    moduleId: 'roads-zone', title: 'Live-street road crew', minutes: 10,
    context: 'A pothole and damaged drain sit beside a busy taxi route. Drivers may ignore the taper. Pedestrians need a clear route.',
    competencies: ['Protect approach', 'Build taper', 'Preserve pedestrian access', 'Position marshals and prove layout'],
    checks: [brief,
      { id: 'approach', phase: 'hazards', prompt: 'A taxi forces past before warning is placed.', choices: ['Stop work; protect the approach', 'Step into the lane to stop it'], correct: 0, critical: true, remediation: 'Withdraw to refuge, stop work and report the breach. Never use your body to stop traffic.' },
      { id: 'drain', phase: 'hazards', prompt: 'The stormwater grate is missing beside the patch.', choices: ['Leave it for another crew', 'Barrier the opening and report it'], correct: 1, remediation: 'The opening is a fall and wheel hazard. Include it in the protected zone and handover.' },
      { id: 'pedestrians', phase: 'hazards', prompt: 'Can barriers divert pedestrians into the live lane?', choices: ['Yes, if the patch is small', 'No; provide a protected clear route'], correct: 1, critical: true, remediation: 'Keep the entire accessible pedestrian route clear or arrange an approved protected diversion.' },
      { id: 'ppe', phase: 'ppe', prompt: 'Check street-work PPE before unloading:', choices: ['High-vis, boots, gloves and eye PPE', 'The vehicle beacon is enough'], correct: 0, remediation: 'Inspect your PPE. High visibility and a beacon support traffic controls; neither stops a vehicle.' },
      { id: 'banksman', phase: 'ppe', prompt: 'The crew van needs to reverse with poor visibility.', choices: ['Reverse on the horn alone', 'Use a visible banksman and stop if lost'], correct: 1, remediation: 'Agree signals and refuge first. The driver stops immediately if visual contact is lost.' },
    ],
  },
  'scene-safety': {
    moduleId: 'scene-safety', title: 'Fire / EMS scene safety', minutes: 8,
    context: 'A crash blocks a municipal arterial beside homes and a trader stall. Fuel, a downed line and passing traffic threaten crews.',
    competencies: ['Stage upstream', 'Size up hazards', 'Maintain live-line exclusion', 'Triage and handover'],
    checks: [brief,
      { id: 'line', phase: 'hazards', prompt: 'A downed line touches the crash vehicle.', choices: ['Pull it off using a glove', 'Keep clear; request Electricity'], correct: 1, critical: true, remediation: 'Stop. Treat the line and contacted vehicle as energised until Electricity confirms safe isolation.' },
      { id: 'spill', phase: 'hazards', prompt: 'Fuel is spreading toward the trader stall.', choices: ['Stage upwind; exclude ignition', 'Place ignition flares in the spill'], correct: 0, critical: true, remediation: 'Stop. Avoid ignition in or near fuel. Stage clear and select warning equipment under the scene plan.' },
      { id: 'access', phase: 'hazards', prompt: 'Where should the medical team stage?', choices: ['Inside the unprotected live lane', 'In the protected area with an exit'], correct: 1, remediation: 'Establish the blocker, warning and safe access before contact. Keep an escape route.' },
      { id: 'ppe', phase: 'ppe', prompt: 'Before casualty contact, check:', choices: ['Task PPE and suitable medical gloves', 'Visibility vest only'], correct: 0, remediation: 'Check exposure protection, PPE condition and equipment under your service SOP.' },
      { id: 'authority', phase: 'ppe', prompt: 'The simulation triage tag is a clinical diagnosis.', choices: ['Yes; accept it as treatment authority', 'No; a qualified human decides care'], correct: 1, remediation: 'Tags rehearse priorities. Clinical judgement and local triage protocols govern actual care.' },
    ],
  },
};
