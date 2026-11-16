/** Title-screen lesson catalogue. Only Electrical has the desktop mouse-and-keyboard path today. */
export interface CatalogEntry { id: string; title: string; blurb: string; desktop: boolean }
export const TITLE_MODULES: readonly CatalogEntry[] = [
  { id: 'elec-loto', title: 'Electrical isolation', blurb: 'Streetlight fault on SL-3. Isolate, lock, tag, try to start, then prove-test-prove.', desktop: true },
  { id: 'water-burst', title: 'Water: burst main', blurb: 'Isolate a burst main on a suburban road with valve keys and a shored trench.', desktop: false },
  { id: 'roads-zone', title: 'Road works: rain incident', blurb: 'Set up a protected work zone with cones, barriers and marshals on a live road.', desktop: false },
  { id: 'scene-safety', title: 'Fire & EMS: scene safety', blurb: 'Make a crash scene safe and triage casualties before treatment.', desktop: false },
];
