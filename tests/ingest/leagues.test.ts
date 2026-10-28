import { seasonStart } from '@/ingest/leagues';

describe('seasonStart', () => {
  it('1er août de l’année en cours après le début de saison', () => {
    expect(seasonStart(new Date('2026-10-28T12:00:00Z'))).toBe('2026-08-01T00:00:00.000Z');
  });
  it('1er août de l’année précédente avant août', () => {
    expect(seasonStart(new Date('2027-03-15T12:00:00Z'))).toBe('2026-08-01T00:00:00.000Z');
  });
});
