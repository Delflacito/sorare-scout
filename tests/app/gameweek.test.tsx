// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { GameWeekFixture, GameWeekPlayer, RoundMatchup } from '@/db/queries';

const getGameWeekFixtures = vi.fn<(c?: string) => Promise<GameWeekFixture[]>>();
const getGameWeekPlayers = vi.fn<(ids: number[], f: unknown) => Promise<GameWeekPlayer[]>>();
const getRoundMatchups = vi.fn<(ids: number[]) => Promise<RoundMatchup[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getGameWeekFixtures, getGameWeekPlayers, getRoundMatchups, listCompetitions: async () => [{ slug: 'ligue-1-fr', name: 'Ligue 1' }] }),
}));

const { default: GameWeek } = await import('@/app/game-week/page');
const { default: Journee } = await import('@/app/journee/page');

const fixture: GameWeekFixture = {
  id: 9, date: '2099-01-01T20:00:00.000Z', competition: 'Ligue 1',
  home: { slug: 'psg', name: 'Paris Saint-Germain', pictureUrl: null, rating: 80 },
  away: { slug: 'om', name: 'Olympique de Marseille', pictureUrl: null, rating: 40 },
};
const player = (slug: string, position: GameWeekPlayer['position'], projected: number): GameWeekPlayer => ({
  slug, name: slug, position, usualPosition: null, team: 'Paris Saint-Germain', teamPictureUrl: null, pictureUrl: null,
  opponent: 'Olympique de Marseille', opponentPictureUrl: 'https://t/om.png', isHome: true, date: fixture.date,
  projected, startRate: 0.8, l15: 60, playingStatus: 'STARTER', sorareProjection: 55,
});
const matchup = (team: string, rating: number, st: number): RoundMatchup => ({
  fixtureId: 9, date: fixture.date, team, teamSlug: team, teamPictureUrl: null, opponent: `adv-${team}`, opponentSlug: 'x',
  opponentPictureUrl: null, isHome: true, opponentRating: rating,
  byPosition: { ST: { average: st, index: st / 50, observations: 5 } },
});
const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) });

describe('/game-week', () => {
  beforeEach(() => {
    getGameWeekFixtures.mockReset().mockResolvedValue([fixture]);
    getGameWeekPlayers.mockReset().mockResolvedValue([player('nuno', 'Defender', 72.4), player('doue', 'Forward', 81)]);
  });

  it('un tableau par poste, score potentiel et match', async () => {
    render(await GameWeek(params()));
    expect(screen.getByText(/1 match/)).toBeInTheDocument();
    const def = screen.getByRole('table', { name: 'Défenseurs' });
    const row = within(def).getAllByRole('row')[1];
    expect(within(row).getByRole('link', { name: 'nuno' })).toHaveAttribute('href', '/joueurs/nuno');
    expect(within(row).getByText('72.4')).toBeInTheDocument();
    expect(within(row).getByText('Olympique de Marseille')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Attaquants' })).getByText('81.0')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Gardiens' })).not.toBeInTheDocument();
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: undefined, startersOnly: true, limit: 10 });
  });

  it('filtres : compétition et remplaçants inclus', async () => {
    await GameWeek(params({ competition: 'ligue-1-fr', tous: '1' }));
    expect(getGameWeekFixtures).toHaveBeenCalledWith('ligue-1-fr');
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: 'ligue-1-fr', startersOnly: false, limit: 10 });
  });

  it('aucun match programmé', async () => {
    getGameWeekFixtures.mockResolvedValue([]);
    render(await GameWeek(params()));
    expect(screen.getByText('Aucun match programmé')).toBeInTheDocument();
  });
});

describe('/journee', () => {
  beforeEach(() => {
    getGameWeekFixtures.mockReset().mockResolvedValue([fixture]);
    getRoundMatchups.mockReset().mockResolvedValue([matchup('a', 70, 40), matchup('b', 20, 30), matchup('c', 50, 90)]);
  });
  const teams = () => within(screen.getByRole('table', { name: 'Adversaires par poste' })).getAllByRole('row').slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

  it('adversaire le plus faible en premier, concédé par poste coloré', async () => {
    render(await Journee(params()));
    expect(teams()).toEqual(['b', 'c', 'a']);
    const cell = screen.getByText('90');
    expect(cell).toHaveClass('hot');
    expect(screen.getByText('20/100')).toHaveClass('hot');
  });

  it('tri par poste : adversaire le plus généreux en premier', async () => {
    render(await Journee(params({ tri: 'ST' })));
    expect(teams()).toEqual(['c', 'a', 'b']);
    expect(screen.getByRole('link', { name: 'BU' })).toHaveAttribute('href', '/journee?tri=ST');
  });
});
