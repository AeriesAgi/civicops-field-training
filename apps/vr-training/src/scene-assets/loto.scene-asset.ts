import {
  CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Object3D,
  SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from '@iwsdk/core';
import { LoftSurface } from './lib/hardsurface.js';
import { box, finish, label, materials as m, mesh, prototype, span } from './custom-model-kit.js';
export { applyCustomTextures } from './custom-model-kit.js';

// CivicOps original CC0 models. Front +Z, up +Y; training anchors stay unchanged.
const top = new Vector3(0, 1, 0);
const screws = new CylinderGeometry(.0026, .0026, .0018, 8);
const screwSlot = new CylinderGeometry(.001, .001, .002, 6);
const rod = new CylinderGeometry(.0027, .0027, 1, 10);

function bolt(root: Object3D, position: readonly number[], topFacing = false): void {
  const cap = mesh(root, 'RecessedFastener', screws, m.steel, position);
  if (!topFacing) cap.quaternion.setFromUnitVectors(top, new Vector3(0, 0, 1));
}
function cable(root: Object3D, name: string, points: readonly number[][], radius: number, material = m.rubber): void {
  mesh(root, name, new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(p[0], p[1], p[2]))), 22, radius, 6, false), material);
}
function anchor(root: Group, name: string, position: readonly number[]): Group {
  const object = prototype(name);
  object.position.set(position[0], position[1], position[2]);
  root.add(object);
  return object;
}

/** Floor origin; desktop y=.72, fitted organiser floor y=.734. */
export const workbench = prototype('Workbench');
box(workbench, 'BirchLaminatedDesktop', [.98, .055, .74], [0, .6925, -.11], m.wood, .006);
box(workbench, 'PowderCoatedFrontRail', [.958, .022, .018], [0, .684, .259], m.teal, .003);
for (const x of [-.426, .426]) for (const z of [-.185, .185]) {
  box(workbench, 'TubularLeg', [.035, .646, .035], [x, .335, z], m.dark, .003);
  box(workbench, 'AdjustableFoot', [.052, .022, .052], [x, .011, z], m.rubber, .004);
}
for (const z of [-.185, .185]) box(workbench, 'WeldedCrossmember', [.86, .036, .028], [0, .635, z], m.dark, .003);
for (const x of [-.426, .426]) box(workbench, 'SideRail', [.028, .036, .40], [x, .635, 0], m.dark, .002);
box(workbench, 'LowerShelf', [.82, .018, .39], [0, .158, 0], m.dark, .003);
box(workbench, 'ShelfFrontLip', [.82, .032, .012], [0, .170, .19], m.teal, .002);
box(workbench, 'ToolTray', [.64, .014, .18], [0, .727, -.11], m.rubber, .004);
for (const x of [-.324, .324]) box(workbench, 'TrayEndWall', [.009, .027, .19], [x, .740, -.11], m.dark, .002);
for (const z of [-.202, -.018]) box(workbench, 'TrayRolledEdge', [.65, .023, .009], [0, .738, z], m.dark, .002);
// Fitted slots support the upright lock/tag home pose rather than floating props.
for (const x of [-.268, -.212]) box(workbench, 'LockCradle', [.006, .012, .045], [x, .740, -.070], m.rubber, .002);
for (const z of [-.078, -.064]) box(workbench, 'TagClip', [.070, .011, .006], [-.14, .7395, z], m.rubber, .001);
for (const x of [-.082, .084, .205]) box(workbench, 'TrayDivider', [.006, .010, .12], [x, .737, -.105], m.rubber, .001);
label(workbench, 'EngravedWorkshopIdentity', [.25, .018], [0, .688, .269], [0, 384, 512, 40]);
for (const x of [-.445, .445]) bolt(workbench, [x, .684, .269]);
finish(workbench);

/** Mounting-centre origin; backboard touches bench at local y=-.38. */
export const distributionBoard = prototype('DistributionBoard');
box(distributionBoard, 'InsulatedMountingPanel', [.43, .62, .018], [0, -.07, -.046], m.ivory, .005);
for (const x of [-.207, .207]) box(distributionBoard, 'MountingPanelEdge', [.008, .60, .024], [x, -.07, -.047], m.dark, .002);
box(distributionBoard, 'RearEnclosure', [.375, .305, .025], [0, 0, -.019], m.ivory, .007);
for (const x of [-.184, .184]) box(distributionBoard, 'EnclosureReturn', [.012, .305, .045], [x, 0, .003], m.ivory, .003);
box(distributionBoard, 'UpperFaceplate', [.36, .065, .014], [0, .118, .030], m.ivory, .004);
box(distributionBoard, 'LowerTerminalCover', [.36, .108, .014], [0, -.093, .030], m.ivory, .004);
box(distributionBoard, 'BreakerRecess', [.353, .112, .006], [0, .049, .018], m.dark, .002);
box(distributionBoard, 'DINRail', [.350, .020, .005], [0, .049, .023], m.steel, .001);
box(distributionBoard, 'IsolatorMount', [.123, .055, .007], [0, -.099, .041], m.steel, .002);
label(distributionBoard, 'WorkshopBoardPlate', [.312, .039], [0, .122, .0376], [512, 0, 512, 64]);
label(distributionBoard, 'WiringDiagram', [.27, .065], [0, -.242, -.0365], [0, 704, 512, 128]);
label(distributionBoard, 'ElectricShockWarning', [.075, .036], [.12, -.096, .0376], [768, 384, 256, 128]);
// The incoming supply remains live when one downstream training circuit is isolated.
label(distributionBoard, 'SupplyLivePlate', [.069, .018], [.08, .185, -.0365], [768, 192, 256, 64]);
const supplyLamp = mesh(distributionBoard, 'BoardSupplyLamp', new SphereGeometry(.0045, 8, 6),
  new MeshBasicMaterial({ color: '#ff7658', toneMapped: false }), [.127, .185, -.0335]);
supplyLamp.userData.unmerged = true;
const lampMount = mesh(distributionBoard, 'SupplyLampMount', new CylinderGeometry(.006, .006, .0018, 10), m.dark, [.127, .185, -.0366]);
lampMount.quaternion.setFromUnitVectors(top, new Vector3(0, 0, 1));
for (const x of [-.166, .166]) for (const y of [-.124, .126]) bolt(distributionBoard, [x, y, .038]);
for (const x of [-.184, .184]) for (const y of [-.348, .207]) bolt(distributionBoard, [x, y, -.035]);
finish(distributionBoard);

/** DIN-rail double-pole breaker. `Toggle` pivots for the reducer's switch state. */
export const breaker = prototype('Breaker');
box(breaker, 'MouldedCircuitBreakerCase', [.062, .077, .033], [0, 0, 0], m.ivory, .003);
box(breaker, 'TerminalCoverSeam', [.059, .007, .003], [0, -.021, .017], m.dark, .0005);
for (const x of [-.018, .018]) {
  box(breaker, 'TerminalWell', [.014, .010, .003], [x, -.031, .017], m.dark, .001);
  bolt(breaker, [x, -.031, .019]);
}
label(breaker, 'BreakerRating', [.053, .024], [0, .023, .0168], [384, 0, 128, 64]);
const toggle = prototype('Toggle');
toggle.position.set(0, .005, .023);
breaker.add(toggle);
box(toggle, 'Rocker', [.038, .023, .017], [0, 0, .004], m.dark, .0025);
for (const y of [-.006, 0, .006]) box(toggle, 'GripRidge', [.032, .0018, .002], [0, y, .0132], m.rubber, .0003);
box(toggle, 'Indicator', [.007, .005, .002], [.012, .001, .014], m.red, .0003);
finish(toggle);
for (const part of toggle.children) part.userData.trainingHighlight = true;
finish(breaker);

/** Body bottom y=-.027 sits exactly on the organiser; shackle is true round steel. */
export const padlock = prototype('PersonalPadlock');
box(padlock, 'InjectionMouldedLockBody', [.048, .054, .023], [0, 0, 0], m.red, .004);
mesh(padlock, 'HardenedSteelShackle', new TorusGeometry(.020, .0034, 7, 18, Math.PI), m.steel, [0, .029, 0]);
for (const x of [-.020, .020]) span(padlock, 'ShackleSocket', rod, m.steel, [x, .021, 0], [x, .030, 0]);
box(padlock, 'OwnerLabelRecess', [.039, .035, .0015], [0, -.001, .0117], m.ivory, .001);
label(padlock, 'PersonalIdentification', [.037, .033], [0, -.001, .0126], [256, 0, 128, 128]);
box(padlock, 'KeyCylinder', [.015, .003, .007], [0, -.0258, 0], m.steel, .001);
box(padlock, 'Keyway', [.010, .0031, .0013], [0, -.026, 0], m.dark, .0002);
finish(padlock);

/** Laminated danger tag; printed face +Z and bottom y=-.0435. */
export const dangerTag = prototype('DangerTag');
box(dangerTag, 'LaminatedTagCard', [.061, .087, .002], [0, 0, 0], m.ivory, .0008);
label(dangerTag, 'PrintedDangerNotice', [.059, .085], [0, 0, .00115], [0, 0, 256, 384]);
mesh(dangerTag, 'ReinforcedEyelet', new TorusGeometry(.0037, .0008, 6, 12), m.steel, [0, .0365, .0017]);
cable(dangerTag, 'TagAttachmentTie', [[0, .037, 0], [-.008, .053, -.002], [.011, .054, -.003], [.013, .039, -.003]], .0007);
finish(dangerTag);

/** Two-pole tester: primary tip remains exactly local [0,0,-.10]. */
export const voltageTester = prototype('VoltageTester');
const handle = LoftSurface.tube([
  { z: -.043, halfW: .018, hUp: .013, hDown: .014, power: 3 },
  { z: -.030, halfW: .021, hUp: .017, hDown: .016, power: 3 },
  { z: .030, halfW: .021, hUp: .017, hDown: .016, power: 3 },
  { z: .060, halfW: .015, hUp: .014, hDown: .014, power: 3 },
  { z: .066, halfW: .010, hUp: .010, hDown: .011, power: 3 },
]);
mesh(voltageTester, 'MouldedTesterHousing', handle.build([-.043, -.030, .030, .060, .066], 12, true), m.yellow);
box(voltageTester, 'FrontFingerGuard', [.055, .045, .009], [0, 0, -.043], m.dark, .002);
span(voltageTester, 'PrimaryContactProbe', new CylinderGeometry(.002, .002, 1, 10), m.steel, [0, 0, -.0475], [0, 0, -.10]);
box(voltageTester, 'DisplayWindowBezel', [.034, .002, .031], [0, .017, .011], m.dark, .002);
label(voltageTester, 'TesterSafetyRatings', [.030, .010], [0, .0181, .043], [0, 512, 256, 128], top);
for (const x of [-.018, .018]) for (const z of [-.018, -.012, -.006, 0, .006, .012, .018]) {
  box(voltageTester, 'SoftGripRib', [.003, .008, .002], [x, -.006, z], m.rubber, .0005);
}
// A compact tethered second pole: safely held in the fitted organiser at rest.
box(voltageTester, 'SecondProbeInsulatedGrip', [.017, .019, .076], [.064, -.011, .020], m.dark, .003);
box(voltageTester, 'SecondProbeCollar', [.029, .026, .008], [.064, -.011, -.018], m.yellow, .0015);
span(voltageTester, 'SecondContactProbe', new CylinderGeometry(.0018, .0018, 1, 8), m.steel, [.064, -.011, -.022], [.064, -.011, -.073]);
cable(voltageTester, 'FlexibleSiliconeLead', [[0, -.004, .063], [.026, -.017, .088], [.078, -.017, .088], [.086, -.014, .055], [.064, -.011, .058]], .0022);
const readout = prototype('VoltageReadout');
voltageTester.add(readout);
for (const [name, y] of [['230', 512], ['000', 576], ['idle', 640]] as const) {
  const plate = label(readout, `VoltageReadout-${name}`, [.029, .014], [0, .0182, .011], [256, y, 128, 64], top);
  plate.userData.unmerged = true;
  plate.visible = name === 'idle';
}
finish(voltageTester);

/** Prebuilt LED states avoid texture uploads or allocations during a contact test. */
export function setTesterReadout(root: Object3D, voltage: number | null): void {
  const display = root.getObjectByName('VoltageReadout');
  if (!display) return;
  const state = voltage === null ? 'idle' : voltage > 0 ? '230' : '000';
  for (const object of display.children) object.visible = object.name === `VoltageReadout-${state}`;
}

/** Known live point local [0,.037,0], intentionally unchanged from round one. */
export const provingUnit = prototype('ProvingUnit');
box(provingUnit, 'ProvingUnitHousing', [.071, .048, .070], [0, .009, 0], m.teal, .004);
box(provingUnit, 'AntiSlipBase', [.063, .006, .061], [0, -.012, 0], m.rubber, .001);
const socket = mesh(provingUnit, 'RecessedTestSocket', new CylinderGeometry(.0115, .0115, .003, 16), m.dark, [0, .034, 0]);
socket.name = 'TestSocketInsulator';
const ring = mesh(provingUnit, 'BrassSocketRim', new TorusGeometry(.010, .0017, 6, 16), m.copper, [0, .037, 0]);
ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), top);
label(provingUnit, 'ProvingUnitPlate', [.060, .030], [0, .009, .0351], [512, 192, 256, 160]);
label(provingUnit, 'ProvingSocketMark', [.044, .013], [0, .0332, -.022], [512, 512, 256, 64], top);
anchor(provingUnit, 'KnownLiveContact', [0, .037, 0]);
finish(provingUnit);

/** Screw-clamp terminal block; contact frames keep their round-one coordinates. */
export const terminals = prototype('CircuitTerminals');
box(terminals, 'InsulatedTerminalBase', [.087, .030, .066], [0, 0, 0], m.ivory, .003);
box(terminals, 'DINMountingFoot', [.080, .006, .050], [0, -.012, 0], m.dark, .001);
box(terminals, 'DividerWall', [.004, .041, .060], [0, .005, 0], m.ivory, .001);
for (const x of [-.023, .023]) {
  box(terminals, 'TerminalScrewWell', [.025, .008, .031], [x, .018, 0], m.dark, .002);
  mesh(terminals, 'BrassTestTerminal', new CylinderGeometry(.0085, .0085, .012, 12), m.copper, [x, .024, 0]);
  box(terminals, 'ScrewdriverSlot', [.010, .001, .002], [x, .0301, 0], m.dark, .0002);
  box(terminals, 'CableEntry', [.017, .016, .007], [x, .004, .032], m.dark, .001);
  cable(terminals, 'InsulatedTerminalLead', [[x, .001, .033], [x, -.004, .044], [x + (x < 0 ? -.006 : .006), -.010, .054]], .0035, x < 0 ? m.red : m.teal);
  anchor(terminals, x < 0 ? 'LineContact' : 'NeutralContact', [x, .024, 0]);
}
label(terminals, 'TerminalIdentifiers', [.078, .009], [0, .011, .0336], [512, 384, 256, 32]);
finish(terminals);

/** Steel multi-lock hasp; the target is a working hardware attachment, not a card. */
export const lockZone = prototype('LockoutSnapZone');
box(lockZone, 'HaspMountingPlate', [.074, .027, .006], [0, .023, -.012], m.steel, .002);
for (const x of [-.026, .026]) bolt(lockZone, [x, .023, -.0085]);
span(lockZone, 'HaspHingePin', new CylinderGeometry(.004, .004, 1, 10), m.steel, [-.018, .017, -.001], [.018, .017, -.001]);
const clasp = mesh(lockZone, 'LockoutHasp', new TorusGeometry(.018, .0035, 7, 18), m.steel, [0, .027, .005]);
clasp.scale.set(1, 1.12, .7);
box(lockZone, 'HaspJawLeft', [.009, .030, .004], [-.014, .008, .005], m.steel, .001);
box(lockZone, 'HaspJawRight', [.009, .030, .004], [.014, .008, .008], m.steel, .001);
box(lockZone, 'HaspGripSleeve', [.052, .016, .011], [0, .042, .008], m.red, .003);
const guide = mesh(lockZone, 'SnapGuide', new TorusGeometry(.011, .0012, 5, 16), m.teal, [0, .026, .010]);
guide.userData.trainingHighlight = true;
finish(lockZone);

export const tagZone = prototype('TagSnapZone');
const tagHook = mesh(tagZone, 'TagGuide', new TorusGeometry(.006, .0013, 6, 14, Math.PI * 1.65), m.steel, [0, .036, 0]);
tagHook.userData.trainingHighlight = true;
finish(tagZone, ['TagGuide']);
