import { lastRound, lastRounds, backtestRound, summarize } from '@/ingest/backtest';
import type { CompletedFixture, AppearanceRow } from '@/db/repo';

const fx = (id: number, day: number, home: number, away: number, competitionId = 1): CompletedFixture =>
  ({ id, competitionId, homeTeamId: home, awayTeamId: away, date: `2026-10-${String(day).padStart(2, '0')}T20:00:00.000Z` });
const app = (fixtureId: number, playerId: number, teamId: number, score: number, detailedPosition: AppearanceRow['detailedPosition'] = 'ST'): AppearanceRow =>
  ({ fixtureId, playerId, teamId, detailedPosition, started: true, minutes: 90, score, decisive: 35, allAround: score - 35 });

// Équipes 1, 2, 3. Journées : 1-2 du 01 au 15 ; dernière journée le 24-25.
const fixtures = [fx(1, 1, 1, 2), fx(2, 8, 3, 1), fx(3, 15, 2, 3), fx(4, 24, 1, 3), fx(5, 25, 2, 1, 1), fx(6, 25, 9, 8, 2)];
const apps = [
  app(1, 10, 1, 60), app(1, 20, 2, 40), app(2, 30, 3, 70), app(2, 10, 1, 80), app(3, 20, 2, 50), app(3, 30, 3, 30),
  app(4, 10, 1, 99), app(4, 30, 3, 10),
];

describe('lastRound', () => {
  it('dernière journée d’un championnat : matchs des 4 derniers jours, coupure au premier', () => {
    expect(lastRound(fixtures.filter((f) => f.competitionId === 1))).toEqual({ cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [4, 5] });
  });
});

describe('lastRounds', () => {
  it('N dernières journées, de la plus récente à la plus ancienne', () => {
    const comp1 = fixtures.filter((f) => f.competitionId === 1);
    expect(lastRounds(comp1, 2)).toEqual([
      { cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [4, 5] },
      { cutoff: '2026-10-15T20:00:00.000Z', fixtureIds: [3] },
    ]);
  });
});

describe('backtestRound', () => {
  it('amplification de l’effet adversaire transmise', () => {
    const round = { cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [4] };
    const rows = backtestRound(fixtures, apps, round, 0);
    expect(rows.every((r) => r.opponent === 1)).toBe(true);
  });

  it('projette avec les seules données antérieures à la journée', () => {
    const rows = backtestRound(fixtures, apps, { cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [4] });
    const p10 = rows.find((r) => r.playerId === 10)!;
    // base du joueur 10 avant la journée : (60 + 80) / 2 = 70 (le 99 de la journée n'est pas utilisé)
    expect(p10).toMatchObject({ fixtureId: 4, actual: 99, base: 70, isHome: true });
    expect(p10.projected).not.toBeNull();
    expect(rows.find((r) => r.playerId === 30)).toMatchObject({ actual: 10, base: 50 });
  });
});

describe('summarize', () => {
  it('erreur moyenne, biais et comparaison au L15 seul', () => {
    const s = summarize([
      { competitionId: 1, fixtureId: 1, playerId: 1, isHome: true, started: true, actual: 60, base: 50, projected: 55, venueFactor: 1, opponent: 1.1 },
      { competitionId: 1, fixtureId: 1, playerId: 2, isHome: false, started: true, actual: 40, base: 50, projected: 45, venueFactor: 1, opponent: 0.9 },
    ]);
    expect(s).toMatchObject({ n: 2, maeModel: 5, maeBase: 10, biasModel: 0, biasBase: 0 });
    expect(s.buckets.find((b) => b.label === 'adversaire favorable (> ×1,1)')).toBeUndefined();
  });
  it('joueur à L15 nul ignoré dans les ratios (pas de division par zéro)', () => {
    const s = summarize([
      { competitionId: 1, fixtureId: 1, playerId: 1, isHome: true, started: true, actual: 60, base: 50, projected: 50, venueFactor: 1, opponent: 1 },
      { competitionId: 1, fixtureId: 1, playerId: 2, isHome: true, started: true, actual: 30, base: 0, projected: 0, venueFactor: 1, opponent: 1 },
    ]);
    expect(s.buckets[0].actualOverBase).toBe(1.2);
    expect(Number.isFinite(s.buckets[0].projectedOverBase)).toBe(true);
  });
});
