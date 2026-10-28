// @vitest-environment jsdom
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { PlayerDetail, PlayerGameView, UpcomingView } from '@/db/queries';

const getPlayer = vi.fn<(slug: string) => Promise<PlayerDetail | null>>();
const getPlayerGames = vi.fn<(slug: string, n: number) => Promise<PlayerGameView[]>>();
const getUpcoming = vi.fn<(slug: string, n: number) => Promise<UpcomingView | null>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getPlayer, getPlayerGames, getUpcoming }),
}));
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

const { default: Page } = await import('@/app/joueurs/[slug]/page');

const player: PlayerDetail = {
  slug: 'nuno-mendes', name: 'Nuno Mendes', position: 'Defender', team: 'Paris Saint-Germain', teamSlug: 'psg', competition: 'Ligue 1',
  usualPosition: 'LB',
  summary: { l5: 62.4, l15: 58.1, l40: 50.2, stdDev5: 12.3, startRate5: 0.8, avgMinutes5: 75, startRate15: 0.9, avgMinutes15: 80,
    decisive5: 20.5, allAround5: 41.9, decisive15: 18, allAround15: 40 },
  positions: [{ position: 'LB', count: 8 }, { position: 'LWB', count: 2 }],
  next: null,
  nextConceded: null,
  pictureUrl: 'https://p/nuno.png', teamPictureUrl: 'https://t/psg.png', teamShortName: 'PSG', playingStatus: 'SUBSTITUTE',
  injury: { kind: 'Thigh Injury', end: '2026-11-10' }, suspension: null, sorareProjection: 41,
};
const game = (fixtureId: number, day: number, score: number, status: PlayerGameView['status'], opponent = 'Olympique Lyonnais'): PlayerGameView => ({
  fixtureId, date: `2026-10-${String(day).padStart(2, '0')}T19:00:00.000Z`, opponent, opponentSlug: 'ol', isHome: fixtureId % 2 === 0,
  opponentPictureUrl: 'https://t/ol.png', opponentShortName: 'OL', goalsFor: 2, goalsAgainst: 1,
  score, minutes: status === 'absent' ? 0 : status === 'sub' ? 25 : 90, status, position: status === 'started' ? 'LB' : null,
  decisive: status === 'absent' ? 0 : 35, allAround: status === 'absent' ? 0 : score - 35,
  competition: fixtureId === 3 ? 'Champions League' : 'Ligue 1', isLeague: fixtureId !== 3,
});
const games: PlayerGameView[] = [game(4, 25, 70, 'started'), game(3, 18, 44, 'sub'), game(2, 11, 0, 'absent'), game(1, 4, 81.5, 'started')];
const upcoming: UpcomingView = {
  base: 80, homeAvg: 76, homeGames: 5, awayAvg: 84.6, awayGames: 5, startRate: 0.8, usualPosition: 'LB',
  fixtures: [
    { fixtureId: 9, date: '2099-01-01T20:00:00.000Z', opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true, opponentPictureUrl: 'https://t/om.png',
      position: { average: 66, leagueAverage: 50, observations: 5 }, overall: { index: 1.1, rating: 30, observations: 20 }, leagueVenueFactor: 1.03 },
    { fixtureId: 10, date: '2099-01-08T20:00:00.000Z', opponent: 'RC Lens', opponentSlug: 'lens', isHome: false, opponentPictureUrl: null,
      position: null, overall: null, leagueVenueFactor: 0.97 },
  ],
};
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('/joueurs/[slug]', () => {
  beforeEach(() => {
    getPlayer.mockReset().mockResolvedValue(player);
    getPlayerGames.mockReset().mockResolvedValue(games);
    getUpcoming.mockReset().mockResolvedValue(upcoming);
  });

  it('en-tête : photo, club avec logo, poste, statut, blessure', async () => {
    render(await Page(params('nuno-mendes')));
    expect(screen.getByRole('heading', { level: 1, name: 'Nuno Mendes' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nuno Mendes' })).toHaveAttribute('src', 'https://p/nuno.png');
    expect(screen.getByRole('img', { name: 'Paris Saint-Germain' })).toHaveAttribute('src', 'https://t/psg.png');
    expect(screen.getByRole('link', { name: /Paris Saint-Germain/ })).toHaveAttribute('href', '/equipes/psg');
    expect(screen.getByText('Remplaçant')).toBeInTheDocument();
    expect(screen.getByText(/Blessé · Thigh Injury · retour prévu le 10\/11/)).toBeInTheDocument();
  });

  it('chiffre clé : score potentiel du prochain match, avec la projection Sorare', async () => {
    render(await Page(params('nuno-mendes')));
    const hero = screen.getByTestId('hero');
    // lieu 0,99 × adversaire 1,112 × 80 = 88,1
    expect(within(hero).getByText('88.1')).toBeInTheDocument();
    expect(within(hero).getByText(/Olympique de Marseille/)).toBeInTheDocument();
    expect(within(hero).getByText('Projection Sorare')).toBeInTheDocument();
    expect(within(hero).getByText('41')).toBeInTheDocument();
  });

  it('indicateurs', async () => {
    render(await Page(params('nuno-mendes')));
    for (const [label, value] of [['L5', '62.4'], ['L15', '58.1'], ['Titularisations (5)', '80 %'], ['Décisif (L5)', '20.5'], ['All-Around (L5)', '41.9']]) {
      const tile = screen.getByText(label).closest('.tile') as HTMLElement;
      expect(within(tile).getByText(value)).toBeInTheDocument();
    }
  });

  it('graphique : une colonne par match, légende, ligne du L15, info-bulle au survol', async () => {
    render(await Page(params('nuno-mendes')));
    const chart = screen.getByRole('img', { name: /Scores Sorare des 4 derniers matchs/ });
    expect(within(chart).getAllByTestId('score-bar')).toHaveLength(4);
    expect(screen.getByText('Titulaire')).toBeInTheDocument();
    expect(screen.getByText('Entré en jeu')).toBeInTheDocument();
    expect(within(chart).getByText('L15 58.1')).toBeInTheDocument();
    fireEvent.mouseEnter(within(chart).getAllByTestId('score-hit')[3]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('70.0');
  });

  it('prochains matchs : logo de l’adversaire et score potentiel', async () => {
    render(await Page(params('nuno-mendes')));
    const rows = within(screen.getByRole('table', { name: 'Prochains matchs' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('88.1')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('img', { name: 'Olympique de Marseille' })).toHaveAttribute('src', 'https://t/om.png');
    expect(within(rows[0]).getByText('66 pts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('30/100')).toBeInTheDocument();
    expect(within(rows[1]).getByText('81.1')).toBeInTheDocument();
  });

  it('derniers matchs : lien vers le match', async () => {
    render(await Page(params('nuno-mendes')));
    const rows = within(screen.getByRole('table', { name: 'Derniers matchs' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: /Olympique Lyonnais/ })).toHaveAttribute('href', '/matchs/4');
    expect(within(rows[2]).getByText('absent')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Champions League')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('Ligue 1')).not.toBeInTheDocument();
  });

  it('joueur inconnu → notFound', async () => {
    getPlayer.mockResolvedValue(null);
    await expect(Page(params('x'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
