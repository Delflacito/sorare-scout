// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { PlayerListRow, SearchFilters } from '@/db/queries';

const searchPlayers = vi.fn<(f: SearchFilters) => Promise<PlayerListRow[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ searchPlayers, listCompetitions: async () => [{ slug: 'ligue-1-fr', name: 'Ligue 1' }], listTeams: async () => [{ slug: 'om', name: 'Olympique de Marseille' }] }),
}));

const { default: Page } = await import('@/app/joueurs/page');

const row: PlayerListRow = {
  slug: 'nuno-mendes', name: 'Nuno Mendes', position: 'Defender', team: 'Paris Saint-Germain', teamSlug: 'psg', competition: 'Ligue 1',
  usualPosition: 'LB', l5: 62.4, l15: 58.1, l40: 50, startRate: 0.8,
  nextOpponent: 'Olympique de Marseille', nextOpponentSlug: 'om', nextIsHome: true, nextIndex: 1.234, nextLowSample: false,
  pictureUrl: 'https://p/nuno.png', teamPictureUrl: 'https://t/psg.png', playingStatus: 'SUBSTITUTE',
  injuryKind: 'Thigh Injury', suspensionReason: null, sorareProjection: 41, nextProjected: 71.3, cardPositions: ['Defender', 'Midfielder'],
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
    expect(screen.getByRole('cell', { name: /^Défenseur \/ Milieu\s*· DG$/ })).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Olympique de Marseille' })).toHaveAttribute('href', '/equipes/om');
    expect(screen.getByTitle('Domicile')).toHaveTextContent('D');
    expect(screen.getByRole('combobox', { name: 'Club' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nuno Mendes' })).toHaveAttribute('src', 'https://p/nuno.png');
    expect(screen.getByRole('img', { name: 'Paris Saint-Germain' })).toHaveAttribute('src', 'https://t/psg.png');
    expect(screen.getByLabelText('Blessé · Thigh Injury')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Proj. Sorare' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '41' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Potentiel' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '71.3' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Masquer blessés et suspendus' })).not.toBeChecked();
  });

  it('tri par défaut : score potentiel ; option pour masquer les indisponibles', async () => {
    searchPlayers.mockResolvedValue([]);
    await Page({ searchParams: Promise.resolve({ dispo: '1' }) });
    expect(searchPlayers).toHaveBeenCalledWith(expect.objectContaining({ sort: 'projected', available: true }));
  });

  it('transmet les filtres de l’URL', async () => {
    searchPlayers.mockResolvedValue([]);
    await Page({ searchParams: Promise.resolve({ position: 'Defender', q: 'nuno', sort: 'l15', page: '2', team: 'om' }) });
    expect(searchPlayers).toHaveBeenCalledWith({ q: 'nuno', position: 'Defender', competition: undefined, team: 'om', detailedPosition: undefined, available: undefined, sort: 'l15', offset: 50 });
  });

  it('valeurs de filtre invalides ignorées', async () => {
    searchPlayers.mockResolvedValue([]);
    await Page({ searchParams: Promise.resolve({ position: 'Pilote', sort: 'DROP', detailedPosition: 'XX' }) });
    expect(searchPlayers).toHaveBeenCalledWith({ q: undefined, position: undefined, competition: undefined, team: undefined, detailedPosition: undefined, available: undefined, sort: 'projected', offset: 0 });
  });

  it('liste vide → message', async () => {
    searchPlayers.mockResolvedValue([]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Aucun joueur ne correspond à ces filtres')).toBeInTheDocument();
  });
});
