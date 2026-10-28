// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { PlayerDetail, PlayerGameView } from '@/db/queries';

const getPlayer = vi.fn<(slug: string) => Promise<PlayerDetail | null>>();
const getPlayerGames = vi.fn<(slug: string, n: number) => Promise<PlayerGameView[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getPlayer, getPlayerGames }),
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
  next: { opponent: 'Olympique de Marseille', opponentSlug: 'om', isHome: true, date: '2099-01-01T20:00:00.000Z' },
  nextConceded: { position: 'LB', average: 66, leagueAverage: 55, index: 1.2, observations: 5, lowSample: false },
};
const games: PlayerGameView[] = [
  { fixtureId: 2, date: '2026-10-25T19:00:00.000Z', opponent: 'OL', isHome: true, score: 70, minutes: 90, status: 'started', position: 'LB', decisive: 30, allAround: 40 },
  { fixtureId: 1, date: '2026-10-18T19:00:00.000Z', opponent: 'OM', isHome: false, score: 0, minutes: 0, status: 'absent', position: null, decisive: 0, allAround: 0 },
];
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('/joueurs/[slug]', () => {
  beforeEach(() => { getPlayer.mockReset(); getPlayerGames.mockReset().mockResolvedValue(games); });

  it('affiche indicateurs, postes et prochain match', async () => {
    getPlayer.mockResolvedValue(player);
    render(await Page(params('nuno-mendes')));
    expect(screen.getByRole('heading', { level: 1, name: 'Nuno Mendes' })).toBeInTheDocument();
    for (const [label, value] of [['L5', '62.4'], ['L15', '58.1'], ['L40', '50.2'], ['% titu (5)', '80 %'], ['Decisive (L5)', '20.5'], ['All-Around (L5)', '41.9']]) {
      const card = screen.getByText(label).closest('.card') as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('DG × 8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Olympique de Marseille/ })).toHaveAttribute('href', '/equipes/om');
    const badge = screen.getByTestId('conceded-badge');
    expect(badge).toHaveClass('hot');
    expect(badge).toHaveTextContent('66.0');
    expect(badge).toHaveTextContent('moyenne ligue 55.0');
    expect(badge).toHaveTextContent('indice 120');
    expect(screen.getAllByTestId('score-bar')).toHaveLength(2);
    expect(getPlayerGames).toHaveBeenCalledWith('nuno-mendes', 15);
  });

  it('échantillon faible grisé', async () => {
    getPlayer.mockResolvedValue({ ...player, nextConceded: { ...player.nextConceded!, observations: 2, lowSample: true } });
    render(await Page(params('nuno-mendes')));
    expect(screen.getByTestId('conceded-badge')).toHaveClass('low-sample');
    expect(screen.getByText(/échantillon faible \(2 obs\.\)/)).toBeInTheDocument();
  });

  it('pas de données concédées', async () => {
    getPlayer.mockResolvedValue({ ...player, nextConceded: null });
    render(await Page(params('nuno-mendes')));
    expect(screen.getByText('Pas encore de données')).toBeInTheDocument();
  });

  it('aucun match programmé', async () => {
    getPlayer.mockResolvedValue({ ...player, next: null, nextConceded: null });
    render(await Page(params('nuno-mendes')));
    expect(screen.getByText('Aucun match programmé')).toBeInTheDocument();
  });

  it('joueur inconnu → notFound', async () => {
    getPlayer.mockResolvedValue(null);
    await expect(Page(params('x'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
