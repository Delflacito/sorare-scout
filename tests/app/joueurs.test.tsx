// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { PlayerListRow, SearchFilters } from '@/db/queries';

const searchPlayers = vi.fn<(f: SearchFilters) => Promise<PlayerListRow[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ searchPlayers, getSquad: async () => [{ slug: 'mine', status: 'owned' }, { slug: 'cible', status: 'target' }], listCompetitions: async () => [{ slug: 'ligue-1-fr', name: 'Ligue 1' }], listTeams: async () => [{ slug: 'om', name: 'Olympique de Marseille' }] }),
}));

const { default: Page } = await import('@/app/joueurs/page');

const row: PlayerListRow = {
  slug: 'nuno-mendes', name: 'Nuno Mendes', position: 'Defender', team: 'Paris Saint-Germain', teamSlug: 'psg', competition: 'Ligue 1',
  usualPosition: 'LB', l5: 62.4, l15: 58.1, l40: 50, startRate: 0.8,
  nextOpponent: 'Olympique de Marseille', nextOpponentSlug: 'om', nextIsHome: true, nextIndex: 1.234, nextLowSample: false,
  pictureUrl: 'https://p/nuno.png', teamPictureUrl: 'https://t/psg.png', playingStatus: 'SUBSTITUTE',
  injuryKind: 'Thigh Injury', suspensionReason: null, sorareProjection: 41, nextProjected: 71.3, cardPositions: ['Defender', 'Midfielder'], floorInSeason: 42, lastSale: null,
};

describe('/joueurs', () => {
  beforeEach(() => searchPlayers.mockReset());

  it('une ligne par joueur : score potentiel et adversaire du prochain match en avant', async () => {
    searchPlayers.mockResolvedValue([row]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    const line = within(screen.getByRole('list', { name: 'Joueurs' })).getAllByRole('listitem')[0];
    expect(within(line).getByRole('link', { name: 'Nuno Mendes' })).toHaveAttribute('href', '/joueurs/nuno-mendes');
    expect(within(line).getByTitle('Score potentiel au prochain match')).toHaveTextContent('71.3');
    expect(within(line).getByText('Olympique de Marseille')).toBeInTheDocument();
    expect(within(line).getByTitle('Domicile')).toHaveTextContent('D');
    expect(within(line).getByTitle(/concède \+23 %/)).toHaveClass('hot');
    expect(within(line).getByText('+23 %')).toBeInTheDocument();
    expect(within(line).getByText('Sorare 41')).toBeInTheDocument();
    expect(line).toHaveTextContent('L5 62.4');
    expect(line).toHaveTextContent('Plancher 42 €Dernier achat —');
    expect(line).toHaveTextContent('Titu 80 %');
    expect(line).toHaveTextContent('Défenseur / Milieu · DG');
    expect(within(line).getByRole('img', { name: 'Nuno Mendes' })).toHaveAttribute('src', 'https://p/nuno.png');
    expect(within(line).getByLabelText('Blessé · Thigh Injury')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Club' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Masquer blessés et suspendus' })).not.toBeChecked();
  });

  it('pastilles de filtre et de tri qui gardent les autres filtres', async () => {
    searchPlayers.mockResolvedValue([row]);
    render(await Page({ searchParams: Promise.resolve({ competition: 'ligue-1-fr', sort: 'l5' }) }));
    expect(screen.getByRole('link', { name: 'Ligue 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Défenseur' })).toHaveAttribute('href', '/joueurs?position=Defender&competition=ligue-1-fr&sort=l5');
    expect(screen.getByRole('link', { name: 'Adversaire le plus facile' })).toHaveAttribute('href', '/joueurs?competition=ligue-1-fr&sort=nextIndex');
    expect(screen.getByRole('link', { name: 'Score potentiel' })).toHaveAttribute('href', '/joueurs?competition=ligue-1-fr');
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

  it('seuil de titularisation choisi : transmis à la recherche et gardé par les autres pastilles', async () => {
    searchPlayers.mockResolvedValue([row]);
    render(await Page({ searchParams: Promise.resolve({ titu: '80' }) }));
    expect(searchPlayers).toHaveBeenCalledWith(expect.objectContaining({ minStartRate: 0.8 }));
    const titu = screen.getByRole('navigation', { name: 'Titularisations minimum' });
    expect(within(titu).getByRole('link', { name: '≥ 80 %' })).toHaveAttribute('aria-current', 'page');
    expect(within(titu).getByRole('link', { name: 'Tous' })).toHaveAttribute('href', '/joueurs');
    expect(screen.getByRole('link', { name: 'Défenseur' })).toHaveAttribute('href', '/joueurs?position=Defender&titu=80');
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
  it('cartes que je n’ai pas : écarte les joueurs possédés', async () => {
    searchPlayers.mockResolvedValue([]);
    render(await Page({ searchParams: Promise.resolve({ sans: 'moi' }) }));
    expect(searchPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ excludeSlugs: ['mine'] }));
  });
});
