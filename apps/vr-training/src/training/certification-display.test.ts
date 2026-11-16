import { describe, expect, it } from 'vitest';
import type { Certification } from './contracts';
import { practiceCertificationDisplay } from './certification-display';

const certificate: Certification = { certificationId: 'water-burst', moduleId: 'water-burst', traineeId: 'demo-trainee', crewId: 'water-01', level: 'bronze', passes: 1, bestScore: 100, streakDays: 1, issuedAt: '2026-10-08T10:00:00Z', expiresAt: '2027-10-08T10:00:00Z', evidenceAttemptIds: ['example'] };

describe('practice certification currency', () => {
  it('shows unearned evidence without inventing an expiry', () => {
    expect(practiceCertificationDisplay(undefined)).toEqual({ status: 'TRAINEE', expiry: 'after passing' });
    expect(practiceCertificationDisplay({ ...certificate, level: 'none' })).toEqual({ status: 'TRAINEE', expiry: 'after passing' });
  });
  it('shows the current earned ladder and its UTC expiry date', () => {
    expect(practiceCertificationDisplay(certificate, new Date('2027-10-08T09:59:59Z'))).toEqual({ status: 'ASSISTANT', expiry: '2027-10-08' });
  });
  it('marks evidence expired at its exact timestamp while retaining the historical level', () => {
    expect(practiceCertificationDisplay(certificate, new Date('2027-10-08T10:00:00Z'))).toEqual({ status: 'ASSISTANT / EXPIRED', expiry: '2027-10-08' });
    expect(certificate.level).toBe('bronze');
  });
  it('normalizes offset timestamps to UTC without shifting the expiry decision', () => {
    expect(practiceCertificationDisplay({ ...certificate, expiresAt: '2027-10-08T01:00:00+02:00' }, new Date('2027-10-07T23:00:00Z')))
      .toEqual({ status: 'ASSISTANT / EXPIRED', expiry: '2027-10-07' });
  });
  it.each([undefined, 'invalid'])('fails closed for missing or malformed expiry %s', (expiresAt) => {
    expect(practiceCertificationDisplay({ ...certificate, expiresAt }, new Date('2026-10-08T10:00:00Z')))
      .toEqual({ status: 'ASSISTANT / REVIEW DUE', expiry: 'unverified' });
  });
  it('fails closed if the device date cannot be read', () => {
    expect(practiceCertificationDisplay(certificate, new Date(Number.NaN))).toEqual({ status: 'ASSISTANT / REVIEW DUE', expiry: 'unverified' });
  });
});
