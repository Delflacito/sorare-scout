// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { MatchView } from '@/db/queries';

const getMatch = vi.fn<(id: number) => Promise<MatchView | null>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getMatch }),
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const { default: Page } = await import('@/app/matchs/[id]/page');

const match: MatchView = {
  id: 7, date: '2026-10-26T19:30:00.000Z', status: 'played', competition: 'Ligue 1',
  home: { name: 'Paris Saint-Germain', slug: 'psg', goals: 2, formation: '4-3-3' },
  away: { name: 'Olympique Lyonnais', slug: 'ol', goals: 1, formation: '4-2-3-1' },
  players: [
    { side: 'home', slug: 'hakimi', name: 'Achraf Hakimi', detailedPosition: 'RB', grid: '2:1', started: true, minutes: 90, score: 64.2, decisive: 35, allAround: 29.2 },
    { side: 'home', slug: 'lee', name: 'Lee Kang-in', detailedPosition: null, grid: null, started: false, minutes: 20, score: 38, decisive: 35, allAround: 3 },
    { side: 'home', slug: 'unused', name: 'Banc', detailedPosition: null, grid: null, started: false, minutes: 0, score: 0, decisive: 0, allAround: 0 },
    { side: 'away', slug: 'tagliafico', name: 'Nicolás Tagliafico', detailedPosition: 'LB', grid: '2:4', started: true, minutes: 90, score: 41, decisive: 35, allAround: 6 },
  ],
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/matchs/[id]', () => {
  beforeEach(() => getMatch.mockReset().mockResolvedValue(match));

  it('score, formations et joueurs des deux équipes', async () => {
    render(await Page(params('7')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paris Saint-Germain 2 – 1 Olympique Lyonnais');
    const home = screen.getByRole('table', { name: 'Paris Saint-Germain (4-3-3)' });
    const hakimi = within(home).getByRole('row', { name: /Achraf Hakimi/ });
    expect(within(hakimi).getByRole('link', { name: 'Achraf Hakimi' })).toHaveAttribute('href', '/joueurs/hakimi');
    expect(within(hakimi).getByText('DD')).toBeInTheDocument();
    expect(within(hakimi).getByText('64.2')).toBeInTheDocument();
    expect(within(within(home).getByRole('row', { name: /Lee Kang-in/ })).getByText('remplaçant')).toBeInTheDocument();
    expect(within(home).queryByRole('row', { name: /Banc/ })).not.toBeInTheDocument();
    const away = screen.getByRole('table', { name: 'Olympique Lyonnais (4-2-3-1)' });
    expect(within(away).getByRole('row', { name: /Nicolás Tagliafico/ })).toHaveTextContent('DG');
    expect(getMatch).toHaveBeenCalledWith(7);
  });

  it('identifiant invalide ou match inconnu → notFound', async () => {
    await expect(Page(params('abc'))).rejects.toThrow('NEXT_NOT_FOUND');
    getMatch.mockResolvedValue(null);
    await expect(Page(params('8'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
