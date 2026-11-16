import { describe, expect, it } from 'vitest';
import { catalogueSnapshot, certificationTitle, departmentCards, MODULE_WORK_ORDER_TYPES, moduleForWorkOrderType, resolveTrainingEntry, workOrderCard } from './work-orders';

describe('offline CivicOps department catalogue', () => {
  it('records catalogue version and marks the sample data read-only', () => {
    expect(catalogueSnapshot.version).toBe('1.0.0');
    expect(catalogueSnapshot.source).toEqual({ kind: 'synthetic-sample',
      note: 'Sample municipal work-order catalogue authored for training practice. Not live municipal data.', snapshotDate: '2026-10-08', readOnly: true });
    expect(catalogueSnapshot.workOrderTypes).toHaveLength(6);
  });

  it.each(catalogueSnapshot.workOrderTypes)('maps sample type $code without losing its requirements', (row) => {
    const card = workOrderCard(row.code);
    expect(moduleForWorkOrderType(row.code)).toBe(MODULE_WORK_ORDER_TYPES[row.code as keyof typeof MODULE_WORK_ORDER_TYPES]);
    expect(card).toMatchObject({ code: row.code, title: row.title, hazardClass: row.hazardClass,
      requiredCertifications: row.requiredCertifications, requiredSkills: row.requiredSkills,
      ppe: row.ppe, typicalSteps: row.procedureSteps, pendingCatalogue: false });
    expect(card.hazards.length).toBeGreaterThan(0);
    expect(card.syntheticReference).toMatch(/^CIV-20261008-DEMO\d{4}$/);
  });

  it('ships source skill and certification details needed by every existing card', () => {
    for (const row of catalogueSnapshot.workOrderTypes) {
      for (const required of row.requiredSkills) expect(catalogueSnapshot.skills.some((skill) => skill.code === required.code)).toBe(true);
      for (const code of row.requiredCertifications) expect(certificationTitle(code)).not.toBe(code);
    }
  });

  it.each(['TRAFFIC.CRASH_SCENE', 'FIRE.VEHICLE_EXTRICATION', 'EMS.MEDICAL_RESPONSE'])('marks forward type %s pending rather than inventing source rows', (code) => {
    expect(moduleForWorkOrderType(code)).toBe('scene-safety');
    expect(workOrderCard(code)).toMatchObject({ availability: 'ready', pendingCatalogue: true, department: 'Fire & EMS' });
    expect(catalogueSnapshot.workOrderTypes.some((row) => row.code === code)).toBe(false);
  });

  it('unlocks Roads and scene safety while catalogue rows stay pending', () => {
    expect(departmentCards.filter((card) => card.moduleId === 'scene-safety')
      .every((card) => card.availability === 'ready' && card.pendingCatalogue)).toBe(true);
    expect(departmentCards.filter((card) => card.availability === 'ready').map((card) => card.code))
      .toEqual(['ELEC.STREETLIGHT_FAULT', 'ELEC.LIVE_WIRE_DOWN', 'WATER.BURST_MAIN', 'ROADS.POTHOLE_REPAIR', 'ROADS.BLOCKED_DRAIN', 'ROADS.TRAFFIC_SIGNAL_FAULT', 'TRAFFIC.CRASH_SCENE', 'FIRE.VEHICLE_EXTRICATION', 'EMS.MEDICAL_RESPONSE']);
  });

  it.each(['UNKNOWN.TYPE', '__proto__', 'constructor', '', 'water.burst_main'])('returns graceful unavailable metadata for %s', (code) => {
    expect(moduleForWorkOrderType(code)).toBeUndefined();
    expect(workOrderCard(code)).toMatchObject({ code, title: 'No simulation yet', availability: 'no-simulation', pendingCatalogue: false });
    expect(workOrderCard(code).hazards).toEqual([]);
  });

  it('opens supported dispatcher types and module development links', () => {
    expect(resolveTrainingEntry('?workOrderType=WATER.BURST_MAIN')).toEqual({ kind: 'module', moduleId: 'water-burst', workOrderType: 'WATER.BURST_MAIN' });
    expect(resolveTrainingEntry('?workOrderType=ELEC.LIVE_WIRE_DOWN')).toEqual({ kind: 'module', moduleId: 'elec-loto', workOrderType: 'ELEC.LIVE_WIRE_DOWN' });
    expect(resolveTrainingEntry('?module=roads-zone')).toEqual({ kind: 'module', moduleId: 'roads-zone' });
    expect(resolveTrainingEntry('?module=water-burst')).toEqual({ kind: 'module', moduleId: 'water-burst' });
    expect(resolveTrainingEntry('?module=board')).toEqual({ kind: 'board' });
    expect(resolveTrainingEntry('')).toEqual({ kind: 'board' });
  });

  it('never boots a wrong simulation for an unknown or locked assignment', () => {
    expect(resolveTrainingEntry('?workOrderType=ROADS.BLOCKED_DRAIN')).toMatchObject({ kind: 'module', moduleId: 'roads-zone', workOrderType: 'ROADS.BLOCKED_DRAIN' });
    expect(resolveTrainingEntry('?module=scene-safety')).toEqual({ kind: 'module', moduleId: 'scene-safety' });
    expect(resolveTrainingEntry('?workOrderType=FIRE.VEHICLE_EXTRICATION')).toMatchObject({ kind: 'module', moduleId: 'scene-safety', workOrderType: 'FIRE.VEHICLE_EXTRICATION' });
    expect(resolveTrainingEntry('?workOrderType=UNKNOWN.TYPE&module=elec-loto')).toMatchObject({ kind: 'unavailable', card: { code: 'UNKNOWN.TYPE', availability: 'no-simulation' } });
  });
});
