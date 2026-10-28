// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { PlayerListRow, SearchFilters } from '@/db/queries';

const searchPlayers = vi.fn<(f: SearchFilters) => Promise<PlayerListRow[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ searchPlayers, listCompetitions: async () => [{ slug: 'ligue-1-fr', name: 'Ligue 1' }] }),
}));

const { default: Page } = await import('@/app/joueurs/page');

const row: PlayerListRow = {
  slug: 'nuno-mendes', name: 'Nuno Mendes', position: 'Defender', team: 'Paris Saint-Germain', teamSlug: 'psg', competition: 'Ligue 1',
  usualPosition: 'LB', l5: 62.4, l15: 58.1, l40: 50, startRate: 0.8,
  nextOpponent: 'Olympique de Marseille', nextOpponentSlug: 'om', nextIsHome: true, nextIndex: 1.234, nextLowSample: false,
};

describe('/joueurs', () => {
  beforeEach(() => searchPlayers.mockReset());

  it('affiche le tableau des joueurs', async () => {
    searchPlayers.mockResolvedValue([row]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    for (const h of ['L5', 'L15', 'L40', '% titu', 'Prochain match', 'Indice adv.']) expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuno Mendes' })).toHaveAttribute('href', '/joueurs/nuno-mendes');
    expect(screen.getByText('62.4')).toBeInTheDocument();
    expect(screen.getByText('80 %')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'DG' })).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText(/vs Olympique de Marseille/)).toBeInTheDocument();
  });

  it('transmet les filtres de l’URL', async () => {
    searchPlayers.mockResolvedValue([]);
    await Page({ searchParams: Promise.resolve({ position: 'Defender', q: 'nuno', sort: 'l15', page: '2' }) });
    expect(searchPlayers).toHaveBeenCalledWith({ q: 'nuno', position: 'Defender', competition: undefined, detailedPosition: undefined, sort: 'l15', offset: 50 });
  });

  it('valeurs de filtre invalides ignorées', async () => {
    searchPlayers.mockResolvedValue([]);
    await Page({ searchParams: Promise.resolve({ position: 'Pilote', sort: 'DROP', detailedPosition: 'XX' }) });
    expect(searchPlayers).toHaveBeenCalledWith({ q: undefined, position: undefined, competition: undefined, detailedPosition: undefined, sort: 'l5', offset: 0 });
  });

  it('liste vide → message', async () => {
    searchPlayers.mockResolvedValue([]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Aucun joueur ne correspond à ces filtres')).toBeInTheDocument();
  });
});
