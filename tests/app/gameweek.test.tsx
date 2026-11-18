// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { GameWeekFixture, GameWeekPlayer, RoundMatchup } from '@/db/queries';

const getGameWeekFixtures = vi.fn<(c?: string) => Promise<GameWeekFixture[]>>();
const getGameWeekPlayers = vi.fn<(ids: number[], f: unknown) => Promise<GameWeekPlayer[]>>();
const getRoundMatchups = vi.fn<(ids: number[]) => Promise<RoundMatchup[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({
    getSchedule: async () => [
      { slug: 'om', name: 'OM', pictureUrl: null, games: [{ date: '2099-01-01T20:00:00.000Z', opponent: 'PSG', opponentSlug: 'psg', isHome: false, opponentRating: 90 }] },
      { slug: 'psg', name: 'PSG', pictureUrl: null, games: [{ date: '2099-01-01T20:00:00.000Z', opponent: 'OM', opponentSlug: 'om', isHome: true, opponentRating: 20 }] },
    ],
    getGameWeekFixtures, getGameWeekPlayers, getRoundMatchups, getSplits: async () => [],
    listCompetitions: async () => [{ slug: 'contender', name: 'Contender' }, { slug: 'ligue-1-fr', name: 'Ligue 1' }], // déjà regroupés par la requête
    getSquad: async () => [{ slug: 'gk', competition: 'ligue-1-fr', status: 'owned', purchasePrice: 1 }, { slug: 'x', competition: 'ligue-1-fr', status: 'target', purchasePrice: 1 }],
  }),
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
  projected, startRate: 0.8, l10: 60, base: 60, playingStatus: 'STARTER', sorareProjection: 55, cardPositions: [position],
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

  it('une liste par poste, score potentiel et match', async () => {
    render(await GameWeek(params()));
    expect(screen.getByText(/1 match/)).toBeInTheDocument();
    const def = screen.getByRole('list', { name: 'Défenseurs' });
    const row = within(def).getAllByRole('listitem')[0];
    expect(within(row).getByRole('link', { name: 'nuno' })).toHaveAttribute('href', '/joueurs/nuno');
    expect(within(row).getByText('72.4')).toBeInTheDocument();
    expect(within(row).getByText('Olympique de Marseille')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Attaquants' })).getByText('81.0')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Gardiens' })).not.toBeInTheDocument();
    expect(within(row).getByText(/\+12\.4/)).toHaveClass('hot');
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: undefined, minStartRate: 0.6, limit: 10, sort: 'projected' });
  });

  it('équipe type : le meilleur de chaque poste, plus un extra de champ', async () => {
    getGameWeekPlayers.mockResolvedValue([
      player('gk', 'Goalkeeper', 50), player('d1', 'Defender', 60), player('d2', 'Defender', 70),
      player('m1', 'Midfielder', 55), player('f1', 'Forward', 80),
    ]);
    render(await GameWeek(params()));
    const team = screen.getByRole('region', { name: 'Équipe type de la journée' });
    expect(within(team).getAllByRole('link').map((l) => l.textContent)).toEqual(['gk', 'd2', 'm1', 'f1', 'd1']);
    expect(within(team).getByText('315')).toBeInTheDocument();
  });

  it('mes cartes et palier visé : équipe composée avec les cartes possédées, marge ou manque face au palier', async () => {
    getGameWeekPlayers.mockResolvedValue([
      player('gk', 'Goalkeeper', 50), player('d1', 'Defender', 60), player('m1', 'Midfielder', 55), player('f1', 'Forward', 80), player('f2', 'Forward', 70),
    ]);
    render(await GameWeek(params({ competition: 'ligue-1-fr', cartes: 'delflacito', palier: '360' })));
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: 'ligue-1-fr', minStartRate: 0.6, limit: 50, sort: 'projected', slugs: ['gk'] });
    expect(screen.getByRole('region', { name: 'Ta meilleure équipe' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Palier 360 pts (5 €) : il manque 45 pts'); // 315 points potentiels
    const paliers = screen.getByRole('navigation', { name: 'Palier de streak visé' });
    expect(within(paliers).getByRole('link', { name: '360 · 5 €' })).toHaveAttribute('aria-current', 'page');
    expect(within(paliers).getByRole('link', { name: '320 · 500 essence' }))
      .toHaveAttribute('href', '/game-week?competition=ligue-1-fr&palier=320&cartes=delflacito');
  });

  it('Contender : un seul choix pour les championnats Contender, journée de chacun, barème Contender', async () => {
    render(await GameWeek(params({ competition: 'contender' })));
    expect(getGameWeekFixtures.mock.calls.map(([c]) => c)).toEqual(['austrian-bundesliga', '2-bundesliga', 'ligue-2-fr', 'segunda-division-es', '1-hnl']);
    const leagues = screen.getByRole('navigation', { name: 'Championnat' });
    expect(within(leagues).getByRole('link', { name: 'Contender' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('navigation', { name: 'Palier de streak visé' })).getByRole('link', { name: '360 · 1000 essence' })).toBeInTheDocument();
  });

  it('championnats et seuil de titularisation en pastilles', async () => {
    render(await GameWeek(params({ competition: 'ligue-1-fr' })));
    expect(screen.getByRole('link', { name: 'Ligue 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Toutes les ligues' })).toHaveAttribute('href', '/game-week');
    const titu = screen.getByRole('navigation', { name: 'Titularisations minimum' });
    expect(within(titu).getByRole('link', { name: '≥ 60 %' })).toHaveAttribute('aria-current', 'page');
    expect(within(titu).getByRole('link', { name: 'Tous' })).toHaveAttribute('href', '/game-week?competition=ligue-1-fr&titu=0');
    expect(within(titu).getByRole('link', { name: '≥ 80 %' })).toHaveAttribute('href', '/game-week?competition=ligue-1-fr&titu=80');
  });

  it('onglet « Plus gros boosts » : classement par gain sur le niveau habituel', async () => {
    render(await GameWeek(params({ vue: 'boost' })));
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: undefined, minStartRate: 0.6, limit: 10, sort: 'boost' });
    expect(screen.getByRole('link', { name: 'Plus gros boosts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Meilleurs scores' })).toHaveAttribute('href', '/game-week');
  });

  it('filtres : compétition et seuil de titularisation', async () => {
    await GameWeek(params({ competition: 'ligue-1-fr', titu: '0' }));
    expect(getGameWeekFixtures).toHaveBeenCalledWith('ligue-1-fr');
    expect(getGameWeekPlayers).toHaveBeenCalledWith([9], { competition: 'ligue-1-fr', minStartRate: 0, limit: 10, sort: 'projected' });
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

  it('/journee : calendrier des prochaines journées, calendrier le plus facile en premier', async () => {
    getGameWeekFixtures.mockReset().mockResolvedValue([fixture]);
    getRoundMatchups.mockReset().mockResolvedValue([]);
    render(await Journee(params({ competition: 'ligue-1-fr' })));
    const rows = within(screen.getByRole('table', { name: 'Calendrier des prochaines journées' })).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/^PSG20OM/), expect.stringMatching(/^OM90@ PSG/)]);
    expect(within(rows[0]).getAllByRole('cell')[2]).toHaveClass('hot');
  });
});
