import {
  shrink, shrinkTowards, baseScore, playerVenueFactor, opponentMultiplier, projectedScore, qualityRatings, venueFactors,
} from '@/domain/projection';

describe('shrink', () => {
  it('ramène l’indice vers 1 selon le nombre d’observations (k = 5)', () => {
    expect(shrink(1.2, 5)).toBeCloseTo(1.1);
    expect(shrink(1.2, 0)).toBe(1);
  });
  it('indice inconnu → 1', () => expect(shrink(null, 10)).toBe(1));
});

describe('shrinkTowards', () => {
  it('ramène une valeur vers la référence selon le nombre d’observations', () => {
    expect(shrinkTowards(66, 50, 5)).toBe(58);
    expect(shrinkTowards(null, 50, 3)).toBe(50);
  });
});

describe('baseScore (L15 sur les matchs joués)', () => {
  it('moyenne des 15 derniers matchs joués', () => {
    expect(baseScore([...Array(15).fill(60), 0, 0])).toBe(60);
  });
  it('moins de 10 matchs : moyenne disponible', () => expect(baseScore([80, 60])).toBe(70));
  it('aucun match joué → null', () => expect(baseScore([])).toBeNull());
});

describe('playerVenueFactor', () => {
  it('moyenne du joueur à ce lieu / sa moyenne, ramenée vers l’avantage du championnat (k = 5)', () => {
    // 76 / 80 = 0,95 sur 5 matchs, championnat 1,03 → (5 × 0,95 + 5 × 1,03) / 10 = 0,99
    expect(playerVenueFactor({ venueAverage: 76, venueGames: 5, base: 80, leagueFactor: 1.03 })).toBeCloseTo(0.99);
  });
  it('aucun match à ce lieu → avantage du championnat', () => {
    expect(playerVenueFactor({ venueAverage: null, venueGames: 0, base: 80, leagueFactor: 0.97 })).toBeCloseTo(0.97);
  });
});

describe('opponentMultiplier', () => {
  it('adversaire moyen → 1', () => {
    expect(opponentMultiplier({ positionAverage: 50, positionObs: 10, positionLeagueAverage: 50, teamIndex: 1, teamObs: 50 })).toBeCloseTo(1);
  });
  it('40 % poste + 60 % qualité, écarts ramenés vers 1', () => {
    // poste : 38/52 → 1 + (38/52 − 1) × 3/8 ; qualité : 1 + (0,92 − 1) × 110/115
    const pos = 1 + (38 / 52 - 1) * (3 / 8);
    const team = 1 + (0.92 - 1) * (110 / 115);
    const r = opponentMultiplier({ positionAverage: 38, positionObs: 3, positionLeagueAverage: 52, teamIndex: 0.92, teamObs: 110 });
    expect(r).toBeCloseTo(0.4 * pos + 0.6 * team);
  });
  it('amplification réglable (0 = pas d’effet adversaire)', () => {
    const input = { positionAverage: 38, positionObs: 3, positionLeagueAverage: 52, teamIndex: 0.92, teamObs: 110 };
    expect(opponentMultiplier(input, 0)).toBe(1);
    expect(opponentMultiplier(input, 1) - 1).toBeCloseTo((opponentMultiplier(input, 2) - 1) / 2);
  });
  it('sans données → 1', () => {
    expect(opponentMultiplier({ positionAverage: null, positionObs: 0, positionLeagueAverage: null, teamIndex: null, teamObs: 0 })).toBe(1);
  });
});

describe('projectedScore', () => {
  it('L15 × lieu × adversaire, plafonné à 100', () => {
    expect(projectedScore({ base: 80, venueFactor: 1.05, opponent: 1.1 })).toBeCloseTo(92.4, 1);
    expect(projectedScore({ base: 95, venueFactor: 1.1, opponent: 1.2 })).toBe(100);
  });
  it('sans L15 → null', () => expect(projectedScore({ base: null, venueFactor: 1, opponent: 1 })).toBeNull());
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
});

describe('venueFactors', () => {
  it('moyenne des titulaires à domicile / à l’extérieur rapportée à la moyenne générale', () => {
    const r = venueFactors([{ home: true, score: 60 }, { home: true, score: 50 }, { home: false, score: 40 }, { home: false, score: 50 }]);
    expect(r.home).toBeCloseTo(55 / 50);
    expect(r.away).toBeCloseTo(45 / 50);
  });
});
