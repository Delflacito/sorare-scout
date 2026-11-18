import { playedAverages, lastN, playingTime, regularity, scoreBreakdown, concededByPosition, concededOverall, type TeamGame, type PlayerGame, type ConcededObs } from '@/domain/metrics';

const tg = (id: string, day: number, teamId = 'A'): TeamGame => ({ fixtureId: id, date: `2026-10-${String(day).padStart(2, '0')}T20:00:00Z`, teamId });
const pg = (id: string, score: number, extra: Partial<PlayerGame> = {}): PlayerGame => ({
  fixtureId: id, started: true, minutes: 90, score, decisive: 0, allAround: 0, ...extra,
});
const games5 = [tg('f1', 1), tg('f2', 2), tg('f3', 3), tg('f4', 4), tg('f5', 5)];

describe('lastN', () => {
  it('moyenne des notes : un match sans jouer ne compte pas', () => {
    const r = lastN(games5, [pg('f1', 60), pg('f3', 40), pg('f5', 50), pg('f4', 0, { minutes: 0 })], 5);
    expect(r.average).toBe(50);
    expect(r.games).toBe(3);
  });
  it('fenêtre plus grande que l’historique', () => {
    expect(lastN(games5, [pg('f1', 50)], 10).games).toBe(1);
  });
  it('garde les n dernières notes, même au-delà des n derniers matchs d’équipe', () => {
    const r = lastN(games5, [pg('f1', 100), pg('f2', 80), pg('f5', 40)], 2);
    expect(r.average).toBe(60);
  });
  it('transfert : matchs de deux clubs successifs', () => {
    const games = [tg('a1', 1, 'A'), tg('a2', 2, 'A'), tg('b1', 3, 'B'), tg('b2', 4, 'B'), tg('b3', 5, 'B')];
    const r = lastN(games, ['a1', 'a2', 'b1', 'b2', 'b3'].map((id) => pg(id, 50)), 5);
    expect(r).toEqual({ average: 50, stdDev: 0, games: 5 });
  });
  it('aucun match → 0', () => {
    expect(lastN([], [], 5)).toEqual({ average: 0, stdDev: 0, games: 0 });
  });
  it('écart-type population', () => {
    expect(lastN([tg('x', 1), tg('y', 2)], [pg('x', 40), pg('y', 60)], 5).stdDev).toBe(10);
  });
});

describe('playingTime', () => {
  it('taux de titularisation et minutes moyennes', () => {
    const played = [pg('f1', 50), pg('f2', 50), pg('f3', 50), pg('f4', 50, { minutes: 45 }), pg('f5', 0, { minutes: 0, started: false })];
    expect(playingTime(games5, played, 5)).toEqual({ startRate: 0.8, avgMinutes: 63 });
  });
});

describe('scoreBreakdown', () => {
  it('moyennes Decisive / All-Around avec absences à 0', () => {
    const r = scoreBreakdown([tg('x', 1), tg('y', 2)], [pg('x', 70, { decisive: 40, allAround: 30 })], 5);
    expect(r).toEqual({ decisive: 20, allAround: 15 });
  });
});

describe('concededByPosition', () => {
  const ob = (team: string, fixtureId: string, position: ConcededObs['position'], score: number, started = true): ConcededObs => ({
    opponentTeamId: team, fixtureId, date: '2026-10-01T00:00:00Z', position, score, started,
  });
  it('moyenne des titulaires adverses au poste, échantillon faible', () => {
    const obs = [ob('T', 't1', 'LB', 70), ob('T', 't2', 'LB', 50), ob('T', 't2', 'LB', 90, false)];
    const [row] = concededByPosition(obs, { T: ['t2', 't1'] }, 5);
    expect(row).toMatchObject({ teamId: 'T', position: 'LB', window: 5, average: 60, observations: 2, lowSample: true, leagueAverage: 60, index: 1 });
  });
  it('moyenne ligue sur toutes les équipes', () => {
    const obs = [ob('T', 't1', 'ST', 80), ob('T', 't2', 'ST', 80), ob('T', 't3', 'ST', 80), ob('U', 'u1', 'ST', 40)];
    const rows = concededByPosition(obs, { T: ['t1', 't2', 't3'], U: ['u1'] }, 5);
    const t = rows.find((r) => r.teamId === 'T')!;
    expect(t.leagueAverage).toBe(70);
    expect(t.index).toBeCloseTo(80 / 70);
    expect(t.lowSample).toBe(false);
  });
  it('moyenne ligue nulle → index null', () => {
    const [row] = concededByPosition([ob('T', 't1', 'GK', 0)], { T: ['t1'] }, 5);
    expect(row.index).toBeNull();
  });
  it('fenêtre : seuls les N matchs les plus récents', () => {
    const ids = ['t7', 't6', 't5', 't4', 't3', 't2', 't1'];
    const obs = ids.map((id, i) => ob('T', id, 'CB', i < 5 ? 50 : 100));
    const [row] = concededByPosition(obs, { T: ids }, 5);
    expect(row.average).toBe(50);
    expect(row.observations).toBe(5);
  });
  it('observation d’une autre équipe ignorée', () => {
    const rows = concededByPosition([ob('U', 't1', 'CB', 50)], { T: ['t1'] }, 5);
    expect(rows).toEqual([]);
  });
});

describe('concededOverall', () => {
  const ob = (team: string, fixtureId: string, position: ConcededObs['position'], score: number, started = true): ConcededObs => ({
    opponentTeamId: team, fixtureId, date: '2026-10-01T00:00:00Z', position, score, started,
  });
  it('moyenne de tous les titulaires adverses, comparée à la ligue', () => {
    const obs = [ob('T', 't1', 'LB', 60), ob('T', 't1', 'ST', 80), ob('T', 't1', 'CM', 10, false), ob('U', 'u1', 'ST', 40)];
    const rows = concededOverall(obs, { T: ['t1'], U: ['u1'] }, 5);
    const t = rows.find((r) => r.teamId === 'T')!;
    expect(t).toMatchObject({ window: 5, average: 70, leagueAverage: 60, observations: 2 });
    expect(t.index).toBeCloseTo(70 / 60);
  });
  it('fenêtre des N derniers matchs', () => {
    const rows = concededOverall([ob('T', 'old', 'ST', 100), ob('T', 'new', 'ST', 50)], { T: ['new', 'old'] }, 1);
    expect(rows[0].average).toBe(50);
  });
});

describe('régularité', () => {
  it('part des matchs au-dessus de 40, 50 et 60 points', () => {
    expect(regularity([30, 45, 55, 65])).toEqual([{ threshold: 40, rate: 0.75 }, { threshold: 50, rate: 0.5 }, { threshold: 60, rate: 0.25 }]);
    expect(regularity([])).toBeNull();
  });
});

describe('playedAverages', () => {
  it('moyenne des x derniers matchs joués, les matchs non joués écartés', () => {
    const games = [{ score: 80, minutes: 90 }, { score: 0, minutes: 0 }, { score: 40, minutes: 20 }, ...Array(20).fill({ score: 50, minutes: 90 })];
    const r = playedAverages(games);
    expect(r.l5).toBe((80 + 40 + 50 * 3) / 5);
    expect(r.l50).toBe((80 + 40 + 50 * 20) / 22);
    expect(r.played).toBe(22);
  });
  it('aucun match joué → null', () => {
    expect(playedAverages([{ score: 0, minutes: 0 }]).l10).toBeNull();
  });
});
