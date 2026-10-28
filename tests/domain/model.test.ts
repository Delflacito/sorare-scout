import { predict, matchGoals, type PlayerFeatures, type ModelParams, type GoalStats, DEFAULT_PARAMS } from '@/domain/model';

const games = (n: number, score: number, decisive = 35, home = true) =>
  Array.from({ length: n }, () => ({ score, decisive, allAround: score - decisive, home }));

const GOALS: GoalStats = { teamFor: 1.4, teamAgainst: 1.4, oppFor: 1.4, oppAgainst: 1.4, league: 1.4, homeFactor: 1, awayFactor: 1 };

const neutral: Omit<PlayerFeatures, 'history'> = {
  defensive: false,
  isHome: true,
  leagueVenue: { home: 1, away: 1 },
  position: { 5: { total: 50, aa: 15, decisive: 35, obs: 10, leagueTotal: 50, leagueAA: 15, leagueDecisive: 35 }, 10: null },
  overall: { 5: { index: 1, obs: 50 }, 10: null },
  goals: GOALS,
};

const params = (p: Partial<ModelParams> = {}): ModelParams => ({ ...DEFAULT_PARAMS, positionWindow: 5, overallWindow: 5, ...p });

describe('predict — modèle total (actuel)', () => {
  it('adversaire moyen, lieu neutre → base', () => {
    expect(predict({ ...neutral, history: games(15, 60) }, params())).toBeCloseTo(60);
  });
  it('base sur les N derniers matchs joués', () => {
    const history = [...games(5, 80), ...games(10, 40)];
    expect(predict({ ...neutral, history }, params({ baseGames: 5 }))).toBeCloseTo(80);
    expect(predict({ ...neutral, history }, params({ baseGames: 15 }))).toBeCloseTo(160 / 3);
  });
  it('aucun match → null', () => expect(predict({ ...neutral, history: [] }, params())).toBeNull());
});

describe('predict — décisif et All-Around séparés', () => {
  it('adversaire qui concède 20 % d’All-Around en plus au poste : seul l’All-Around monte', () => {
    const f = { ...neutral, history: games(15, 60, 40), position: { 5: { ...neutral.position[5]!, aa: 18, total: 53 }, 10: null } };
    // AA base 20 × (0,4 × (1 + 0,2 × 10/15) + 0,6 × 1) ; décisif 40 inchangé
    const aaMult = 0.4 * (1 + 0.2 * (10 / 15)) + 0.6;
    expect(predict(f, params({ model: 'split', shrinkK: 5 }))).toBeCloseTo(40 + 20 * aaMult);
  });
});

describe('matchGoals', () => {
  it('buts attendus : moyenne de la ligue × attaque × faiblesse défensive adverse × lieu', () => {
    const g = matchGoals({ teamFor: 2.1, teamAgainst: 0.7, oppFor: 0.7, oppAgainst: 2.1, league: 1.4, homeFactor: 1.1, awayFactor: 0.9 }, true);
    expect(g.forTeam).toBeCloseTo(1.4 * 1.5 * 1.5 * 1.1);
    expect(g.againstTeam).toBeCloseTo(1.4 * 0.5 * 0.5 * 0.9);
  });
});

describe('predict — rapport de force', () => {
  it('défenseur face à une attaque faible : chances de clean sheet plus fortes → décisif au-dessus de 35 relevé', () => {
    const base = { ...neutral, defensive: true, history: games(15, 55, 45) };
    const weakAttack = { ...base, goals: { ...GOALS, oppFor: 0.7 } };
    const p = params({ model: 'split+match', decisiveAmp: 1 });
    expect(predict(weakAttack, p)!).toBeGreaterThan(predict(base, p)!);
  });
  it('attaquant face à une défense perméable : décisif relevé', () => {
    const base = { ...neutral, history: games(15, 60, 50) };
    const leaky = { ...base, goals: { ...GOALS, oppAgainst: 2.1 } };
    const p = params({ model: 'split+match', decisiveAmp: 1 });
    expect(predict(leaky, p)!).toBeGreaterThan(predict(base, p)!);
  });
  it('décisif à 35 (aucune action décisive habituelle) : inchangé', () => {
    const f = { ...neutral, history: games(15, 50, 35), goals: { ...GOALS, oppAgainst: 2.1 } };
    expect(predict(f, params({ model: 'split+match', decisiveAmp: 1 }))).toBeCloseTo(50);
  });
});
