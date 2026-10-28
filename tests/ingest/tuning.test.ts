import { buildRoundRows, evaluate, parameterGrid } from '@/ingest/tuning';
import { DEFAULT_PARAMS } from '@/domain/model';
import type { CompletedFixture, AppearanceRow } from '@/db/repo';

const fx = (id: number, day: number, home: number, away: number, hg: number, ag: number): CompletedFixture =>
  ({ id, competitionId: 1, homeTeamId: home, awayTeamId: away, date: `2026-10-${String(day).padStart(2, '0')}T20:00:00.000Z`, homeGoals: hg, awayGoals: ag });
const app = (fixtureId: number, playerId: number, teamId: number, score: number, pos: AppearanceRow['detailedPosition']): AppearanceRow =>
  ({ fixtureId, playerId, teamId, detailedPosition: pos, started: true, minutes: 90, score, decisive: 35, allAround: score - 35 });

const fixtures = [fx(1, 1, 1, 2, 2, 0), fx(2, 8, 2, 1, 1, 1), fx(3, 24, 1, 2, 3, 0)];
const apps = [app(1, 10, 1, 60, 'ST'), app(1, 20, 2, 40, 'CB'), app(2, 10, 1, 80, 'ST'), app(2, 20, 2, 50, 'CB'), app(3, 10, 1, 99, 'ST'), app(3, 20, 2, 10, 'CB')];

describe('buildRoundRows', () => {
  const rows = buildRoundRows(fixtures, apps, { cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [3] });
  it('une ligne par joueur ayant joué la journée, avec le score réel', () => {
    expect(rows.map((r) => [r.playerId, r.actual])).toEqual([[10, 99], [20, 10]]);
  });
  it('historique sans la journée testée (pas de fuite)', () => {
    expect(rows[0].features.history.map((g) => g.score)).toEqual([80, 60]);
  });
  it('buts : attaque de l’équipe 1 au-dessus de la moyenne', () => {
    const g = rows[0].features.goals!;
    expect(g.league).toBeCloseTo(1);
    expect(g.teamFor).toBeGreaterThan(g.league);
    expect(rows[1].features.defensive).toBe(true);
  });
});

describe('evaluate', () => {
  it('corrélation, erreur et biais', () => {
    const rows = buildRoundRows(fixtures, apps, { cutoff: '2026-10-24T20:00:00.000Z', fixtureIds: [3] });
    const r = evaluate(rows, DEFAULT_PARAMS);
    expect(r.n).toBe(2);
    expect(r.corr).toBeCloseTo(1);
  });
});

describe('parameterGrid', () => {
  it('contient le réglage actuel et les trois modèles', () => {
    const grid = parameterGrid();
    expect(grid).toContainEqual(DEFAULT_PARAMS);
    expect(new Set(grid.map((p) => p.model))).toEqual(new Set(['total', 'split', 'split+match']));
  });
});
