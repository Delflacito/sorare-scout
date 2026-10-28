import { playerForm, shrink, projectedScore } from '@/domain/projection';

describe('shrink', () => {
  it('ramène l’indice vers 1 selon le nombre d’observations (k = 5)', () => {
    expect(shrink(1.2, 5)).toBeCloseTo(1.1);
    expect(shrink(1.2, 0)).toBe(1);
    expect(shrink(0.8, 20)).toBeCloseTo(0.84);
  });
  it('indice inconnu → 1', () => expect(shrink(null, 10)).toBe(1));
});

describe('playerForm', () => {
  it('0,6 × moyenne des 5 derniers matchs joués + 0,4 × moyenne des 15', () => {
    const scores = [70, 60, 50, 40, 30, ...Array(10).fill(20)];
    expect(playerForm(scores)).toBeCloseTo(0.6 * 50 + 0.4 * 30);
  });
  it('moins de 5 matchs : moyenne disponible', () => expect(playerForm([60, 40])).toBe(50));
  it('aucun match joué → null', () => expect(playerForm([])).toBeNull());
});

describe('projectedScore', () => {
  const base = { form: 60, positionIndex: 1, positionObs: 0, teamIndex: 1, teamObs: 0, isHome: true };
  it('adversaire moyen à domicile : forme + 3 %', () => {
    expect(projectedScore(base)).toBeCloseTo(61.8, 1);
  });
  it('à l’extérieur : forme − 3 %', () => {
    expect(projectedScore({ ...base, isHome: false })).toBeCloseTo(58.2, 1);
  });
  it('combine poste (60 %) et qualité générale (40 %), après rétrécissement', () => {
    // poste : 1 + 0,15 × 10/15 = 1,10 ; équipe : 1 + 0,05 × 20/25 = 1,04
    const r = projectedScore({ ...base, positionIndex: 1.15, positionObs: 10, teamIndex: 1.05, teamObs: 20 });
    expect(r).toBeCloseTo(60 * (0.6 * 1.1 + 0.4 * 1.04) * 1.03, 1);
  });
  it('plafonné à 100', () => {
    expect(projectedScore({ ...base, form: 99, positionIndex: 2, positionObs: 100 })).toBe(100);
  });
});
