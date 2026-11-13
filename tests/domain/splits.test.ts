import { playerSplits, tierOf, tierSizes, type SplitGame } from '@/domain/splits';

const g = (isHome: boolean, rank: number, score: number, over: Partial<SplitGame> = {}): SplitGame =>
  ({ isHome, rank, teams: 18, score, decisive: 35, allAround: score - 35, ...over });

describe('tranches du classement', () => {
  it('16 clubs : 5 / 6 / 5 ; 18 : tiers de 6 ; 20 : quarts de 5', () => {
    expect(tierSizes(16)).toEqual([5, 6, 5]);
    expect(tierSizes(18)).toEqual([6, 6, 6]);
    expect(tierSizes(20)).toEqual([5, 5, 5, 5]);
    expect(tierSizes(12)).toEqual([4, 4, 4]);
  });

  it('rang → tranche', () => {
    expect([1, 5, 6, 11, 12, 16].map((r) => tierOf(r, 16))).toEqual([0, 0, 1, 1, 2, 2]);
    expect([5, 6, 15, 16].map((r) => tierOf(r, 20))).toEqual([0, 1, 2, 3]);
  });
});

describe('profil domicile / extérieur × adversaire', () => {
  it('profil lisse : aucun commentaire', () => {
    const games = [g(true, 2, 50), g(false, 8, 52), g(true, 15, 49), g(false, 3, 51), g(true, 10, 50), g(false, 17, 50)];
    expect(playerSplits(games, null)!.notes).toEqual([]);
  });

  it('très fort à domicile contre le bas, favorable si le prochain match est dans ce contexte', () => {
    const games = [
      g(true, 14, 80), g(true, 16, 78), g(true, 18, 82),
      g(false, 2, 40), g(false, 8, 42), g(false, 15, 45), g(true, 3, 48), g(false, 5, 41), g(true, 9, 47),
    ];
    const s = playerSplits(games, { isHome: true, rank: 17, teams: 18 })!;
    expect(s.cells[2].home).toMatchObject({ games: 3, score: 80 });
    expect(s.next).toEqual({ venue: 'home', tier: 2 });
    expect(s.notes.length).toBeGreaterThan(0);
    expect(s.notes.length).toBeLessThanOrEqual(3);
    expect(s.notes.some((n) => /^AA D·T3 \+\d+$/.test(n.tag) && n.next === 'good')).toBe(true);
    expect(s.notes.some((n) => n.tag.startsWith('Score E −'))).toBe(true);
  });

  it('décisif à domicile mais pas à l’extérieur, sans écart de score total', () => {
    const home = (r: number) => g(true, r, 50, { decisive: 50, allAround: 0 });
    const away = (r: number) => g(false, r, 50, { decisive: 35, allAround: 15 });
    const s = playerSplits([home(2), home(9), home(15), away(4), away(10), away(16)], null)!;
    expect(s.notes.map((n) => n.metric).sort()).toEqual(['allAround', 'decisive']);
    expect(s.notes.find((n) => n.metric === 'decisive')!.tag).toMatch(/^Déc (D \+8|E −8)$/);
    expect(s.notes.find((n) => n.metric === 'allAround')!.tag).toBe('AA D −8');
  });

  it('moins de 3 matchs dans un groupe : pas de commentaire', () => {
    expect(playerSplits([g(true, 15, 90), g(true, 16, 90), g(false, 2, 30), g(false, 3, 30)], null)!.notes).toEqual([]);
  });

  it('quarts à 20 clubs : étiquettes Q', () => {
    const q = (isHome: boolean, rank: number, score: number) => g(isHome, rank, score, { teams: 20 });
    const s = playerSplits([q(false, 1, 20), q(false, 3, 22), q(true, 5, 24), q(true, 10, 60), q(false, 12, 62), q(true, 18, 64)], null)!;
    expect(s.notes[0].tag).toMatch(/^AA Q1 −\d+$/); // à écart égal, l'AA passe devant le score
  });

  it('aucun match : pas de profil', () => {
    expect(playerSplits([], null)).toBeNull();
  });
});
