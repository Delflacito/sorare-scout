import { playerForm, shrink, shrinkTowards, achievableScore, projectedScore, qualityRatings, venueFactors } from '@/domain/projection';

describe('shrink', () => {
  it('ramène l’indice vers 1 selon le nombre d’observations (k = 5)', () => {
    expect(shrink(1.2, 5)).toBeCloseTo(1.1);
    expect(shrink(1.2, 0)).toBe(1);
    expect(shrink(0.8, 20)).toBeCloseTo(0.84);
  });
  it('indice inconnu → 1', () => expect(shrink(null, 10)).toBe(1));
});

describe('shrinkTowards', () => {
  it('ramène une moyenne vers la référence selon le nombre d’observations', () => {
    expect(shrinkTowards(66, 50, 5)).toBe(58);
    expect(shrinkTowards(66, 50, 0)).toBe(50);
    expect(shrinkTowards(null, 50, 3)).toBe(50);
  });
});

describe('playerForm', () => {
  it('0,6 × moyenne des 5 derniers matchs joués + 0,4 × moyenne des 15', () => {
    const scores = [70, 60, 50, 40, 30, ...Array(10).fill(20)];
    expect(playerForm(scores)).toBeCloseTo(0.6 * 50 + 0.4 * 30);
  });
  it('aucun match joué → null', () => expect(playerForm([])).toBeNull());
});

describe('achievableScore', () => {
  it('40 % concédé au poste (ramené vers la ligue) + 60 % moyenne ligue au poste × qualité adverse', () => {
    const r = achievableScore({ positionAverage: 66, positionObs: 5, positionLeagueAverage: 50, teamIndex: 1.1, teamObs: 20 });
    // 0,4 × 58 + 0,6 × 50 × (1 + 0,1 × 20/25)
    expect(r).toBeCloseTo(0.4 * 58 + 0.6 * 50 * 1.08);
  });
  it('pas de moyenne de ligue au poste → null', () => {
    expect(achievableScore({ positionAverage: null, positionObs: 0, positionLeagueAverage: null, teamIndex: 1, teamObs: 5 })).toBeNull();
  });
});

describe('projectedScore', () => {
  it('30 % forme + 70 % score atteignable, × facteur domicile / extérieur', () => {
    expect(projectedScore({ form: 60, achievable: 55.6, venueFactor: 1.03 })).toBeCloseTo((0.3 * 60 + 0.7 * 55.6) * 1.03, 1);
  });
  it('sans score atteignable : forme × lieu', () => {
    expect(projectedScore({ form: 60, achievable: null, venueFactor: 0.95 })).toBeCloseTo(57, 1);
  });
  it('sans forme : score atteignable × lieu', () => {
    expect(projectedScore({ form: null, achievable: 50, venueFactor: 1.1 })).toBeCloseTo(55, 1);
  });
  it('ni l’un ni l’autre → null', () => expect(projectedScore({ form: null, achievable: null, venueFactor: 1 })).toBeNull());
  it('plafonné à 100', () => expect(projectedScore({ form: 99, achievable: 99, venueFactor: 1.2 })).toBe(100));
});

describe('qualityRatings', () => {
  it('note de 1 à 100 : 100 = défense qui concède le moins', () => {
    const r = qualityRatings([{ teamId: 'a', average: 40 }, { teamId: 'b', average: 50 }, { teamId: 'c', average: 60 }]);
    expect(r).toEqual(new Map([['a', 100], ['b', 51], ['c', 1]]));
  });
  it('ex aequo → même note', () => {
    const r = qualityRatings([{ teamId: 'a', average: 60 }, { teamId: 'c', average: 60 }, { teamId: 'b', average: 40 }]);
    expect(r).toEqual(new Map([['a', 1], ['c', 1], ['b', 100]]));
  });
  it('une seule équipe → 50', () => expect(qualityRatings([{ teamId: 'a', average: 40 }])).toEqual(new Map([['a', 50]])));
});

describe('venueFactors', () => {
  it('moyenne des titulaires à domicile / à l’extérieur rapportée à la moyenne générale', () => {
    const r = venueFactors([{ home: true, score: 60 }, { home: true, score: 50 }, { home: false, score: 40 }, { home: false, score: 50 }]);
    expect(r.home).toBeCloseTo(55 / 50);
    expect(r.away).toBeCloseTo(45 / 50);
    expect(r.observations).toBe(4);
  });
  it('aucune donnée → 1 / 1', () => expect(venueFactors([])).toEqual({ home: 1, away: 1, observations: 0 }));
});
