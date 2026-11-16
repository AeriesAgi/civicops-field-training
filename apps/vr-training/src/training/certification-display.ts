import type { Certification } from './contracts';

export function practiceRole(level:Certification['level']):string{return ({none:'TRAINEE',bronze:'ASSISTANT',silver:'OPERATOR',gold:'SUPERVISOR'} as const)[level];}

/** Historical ladder levels survive expiry; a card must never imply that expired evidence is current. */
export function practiceCertificationDisplay(
  certification: Certification | undefined, now: Date = new Date(),
): { status: string; expiry: string } {
  if (!certification || certification.level === 'none') return { status: 'TRAINEE', expiry: 'after passing' };
  const expires = certification.expiresAt ? Date.parse(certification.expiresAt) : Number.NaN;
  const current = now.getTime();
  if (!Number.isFinite(expires) || !Number.isFinite(current)) return { status: `${practiceRole(certification.level)} / REVIEW DUE`, expiry: 'unverified' };
  return {
    status: `${practiceRole(certification.level)}${expires <= current ? ' / EXPIRED' : ''}`,
    expiry: new Date(expires).toISOString().slice(0, 10),
  };
}
