import { actionItems, describeActions } from '@/domain/actions';

describe('actions décisives', () => {
  it('description en français, buts d’abord, statistiques inconnues ignorées', () => {
    expect(describeActions({ goal_assist: 1, goals: 2, mystery: 3 })).toBe('2 buts · 1 passe décisive');
    expect(describeActions({})).toBe('');
    expect(describeActions(null)).toBe('');
  });

  it('actions ordonnées, sens positif ou négatif', () => {
    expect(actionItems({ red_card: 1, goals: 2 }).map((a) => [a.icon, a.count, a.positive])).toEqual([['⚽', 2, true], ['🟥', 1, false]]);
  });
});

describe('âge', async () => {
  const { ageAt } = await import('@/lib/format');
  it('compte l’anniversaire', () => {
    expect(ageAt('1998-12-20', new Date('2026-12-19T12:00:00Z'))).toBe(27);
    expect(ageAt('1998-12-20', new Date('2026-12-20T12:00:00Z'))).toBe(28);
  });
});

describe('format', async () => {
  const { scoreTier, teamCode } = await import('@/lib/format');
  it('paliers de score', () => {
    expect([100, 88, 64, 47, 30, 10].map(scoreTier)).toEqual(['t90', 't70', 't55', 't40', 't25', 't0']);
  });
  it('codes des équipes', () => {
    expect(teamCode('Paris Saint-Germain')).toBe('PSG');
    expect(teamCode('Olympique Lyonnais')).toBe('OL');
    expect(teamCode('Barcelona')).toBe('BAR');
    expect(teamCode('Tottenham Hotspur', 'Tottenham Hotspur')).toBe('TH');
    expect(teamCode('Olympique de Marseille', 'OM')).toBe('OM');
    expect(teamCode('FC Bayern München')).toBe('BM');
  });
});
