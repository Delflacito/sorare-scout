// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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
};
const games: PlayerGameView[] = [
  { fixtureId: 2, date: '2026-10-25T19:00:00.000Z', opponent: 'Olympique Lyonnais', opponentSlug: 'ol', isHome: true, goalsFor: 2, goalsAgainst: 1,
    score: 70, minutes: 90, status: 'started', position: 'LB', decisive: 30, allAround: 40 },
  { fixtureId: 1, date: '2026-10-18T19:00:00.000Z', opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: false, goalsFor: 0, goalsAgainst: 0,
    score: 0, minutes: 0, status: 'absent', position: null, decisive: 0, allAround: 0 },
];
const upcoming: UpcomingView = {
  form: 60, startRate: 0.8, usualPosition: 'LB',
  fixtures: [
    { fixtureId: 9, date: '2099-01-01T20:00:00.000Z', opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true,
      position: { average: 66, leagueAverage: 50, observations: 5 }, overall: { index: 1.1, rating: 30, observations: 20 }, venueFactor: 1.03 },
    { fixtureId: 10, date: '2099-01-08T20:00:00.000Z', opponent: 'RC Lens', opponentSlug: 'lens', isHome: false, position: null, overall: null, venueFactor: 0.97 },
  ],
};
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('/joueurs/[slug]', () => {
  beforeEach(() => {
    getPlayer.mockReset().mockResolvedValue(player);
    getPlayerGames.mockReset().mockResolvedValue(games);
    getUpcoming.mockReset().mockResolvedValue(upcoming);
  });

  it('indicateurs et postes récents', async () => {
    render(await Page(params('nuno-mendes')));
    expect(screen.getByRole('heading', { level: 1, name: 'Nuno Mendes' })).toBeInTheDocument();
    for (const [label, value] of [['L5', '62.4'], ['L15', '58.1'], ['% titu (5)', '80 %'], ['Decisive (L5)', '20.5'], ['All-Around (L5)', '41.9']]) {
      const card = screen.getByText(label).closest('.card') as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('DG × 8')).toBeInTheDocument();
  });

  it('prochains matchs avec score potentiel', async () => {
    render(await Page(params('nuno-mendes')));
    const table = screen.getByRole('table', { name: 'Prochains matchs' });
    const rows = within(table).getAllByRole('row').slice(1);
    // atteignable = 0,4 × 58 + 0,6 × 50 × 1,08 = 55,6 ; potentiel = (0,3 × 60 + 0,7 × 55,6) × 1,03 = 58,6
    expect(within(rows[0]).getByText('58.6')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: /Olympique de Marseille/ })).toHaveAttribute('href', '/equipes/om');
    expect(within(rows[0]).getByText('66 pts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('(ligue 50)')).toBeInTheDocument();
    expect(within(rows[0]).getByText('30/100')).toBeInTheDocument();
    expect(within(rows[0]).getByText('+3 %')).toBeInTheDocument();
    expect(within(rows[1]).getByText('−3 %')).toBeInTheDocument();
    // adversaire sans données : forme × extérieur
    expect(within(rows[1]).getByText('58.2')).toBeInTheDocument();
    expect(screen.getByText(/Probabilité d’être titulaire : 80 %/)).toBeInTheDocument();
  });

  it('pas de forme : score atteignable au poste × lieu', async () => {
    getUpcoming.mockResolvedValue({ ...upcoming, form: null });
    render(await Page(params('nuno-mendes')));
    const rows = within(screen.getByRole('table', { name: 'Prochains matchs' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('57.3')).toBeInTheDocument();
    // ni forme ni données adverses : pas de score
    expect(within(rows[1]).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('aucun match programmé', async () => {
    getUpcoming.mockResolvedValue({ ...upcoming, fixtures: [] });
    render(await Page(params('nuno-mendes')));
    expect(screen.getByText('Aucun match programmé')).toBeInTheDocument();
  });

  it('derniers matchs avec lien vers le match', async () => {
    render(await Page(params('nuno-mendes')));
    const table = screen.getByRole('table', { name: 'Derniers matchs' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: /Olympique Lyonnais/ })).toHaveAttribute('href', '/matchs/2');
    expect(within(rows[0]).getByText('2 – 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('DG')).toBeInTheDocument();
    expect(within(rows[0]).getByText('70.0')).toBeInTheDocument();
    expect(within(rows[1]).getByText('absent')).toBeInTheDocument();
    expect(getPlayerGames).toHaveBeenCalledWith('nuno-mendes', 15);
  });

  it('joueur inconnu → notFound', async () => {
    getPlayer.mockResolvedValue(null);
    await expect(Page(params('x'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
