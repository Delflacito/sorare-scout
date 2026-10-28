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
