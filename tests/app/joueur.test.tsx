// @vitest-environment jsdom
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { CompetitionTotalsView, PlayerDetail, PlayerGameView, PlayerSeasonView, SaleView, UpcomingView } from '@/db/queries';

const getPlayer = vi.fn<(slug: string) => Promise<PlayerDetail | null>>();
const getPlayerGames = vi.fn<(slug: string, n: number) => Promise<PlayerGameView[]>>();
const getUpcoming = vi.fn<(slug: string, n: number) => Promise<UpcomingView | null>>();
const getCompetitionTotals = vi.fn<(slug: string) => Promise<CompetitionTotalsView[]>>();
const getPlayerSeasons = vi.fn<(slug: string) => Promise<PlayerSeasonView[]>>();
const getPlayerSales = vi.fn<(slug: string) => Promise<SaleView[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getSplits: async () => [], getPlayer, getPlayerGames, getUpcoming, getCompetitionTotals, getPlayerSeasons, getPlayerSales }),
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
  birthDate: '2002-06-19', country: { code: 'pt', name: 'Portugal', flagUrl: 'https://f/PT.png' },
  firstName: 'Nuno', lastName: 'Mendes', height: 176, shirtNumber: 25, bodyPictureUrl: null, cardPositions: ['Defender', 'Midfielder'],
  market: { floorInSeason: 24.5, floorClassic: 6.2, referencePrice: 24.5, recentPrice: 26, priceTrend7: 0.12, sales30: 9,
    fairPrice: 40, valueRatio: 0.6125, potentialPrice: 27.4, potentialGain: 0.118, lastAuction: { eur: 22, date: '2026-10-27T18:00:00.000Z' } },
};
const game = (fixtureId: number, day: number, score: number, status: PlayerGameView['status'], opponent = 'Olympique Lyonnais'): PlayerGameView => ({
  fixtureId, date: `2026-10-${String(day).padStart(2, '0')}T19:00:00.000Z`, opponent, opponentSlug: 'ol', isHome: fixtureId % 2 === 0,
  opponentPictureUrl: 'https://t/ol.png', opponentShortName: 'OL', goalsFor: 2, goalsAgainst: 1,
  score, minutes: status === 'absent' ? 0 : status === 'sub' ? 25 : 90, status, position: status === 'started' ? 'LB' : null,
  decisive: status === 'absent' ? 0 : 35, allAround: status === 'absent' ? 0 : score - 35,
  competition: fixtureId === 3 ? 'Champions League' : 'Ligue 1', isLeague: fixtureId !== 3,
  actions: fixtureId === 4 ? { goals: 2, goal_assist: 1 } : {},
  team: 'Paris Saint-Germain', teamShortName: 'PSG', teamPictureUrl: 'https://t/psg.png',
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
const params = (slug: string, onglet?: string) => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(onglet ? { onglet } : {}) });

describe('/joueurs/[slug]', () => {
  beforeEach(() => {
    getPlayer.mockReset().mockResolvedValue(player);
    getPlayerGames.mockReset().mockResolvedValue(games);
    getUpcoming.mockReset().mockResolvedValue(upcoming);
    getCompetitionTotals.mockReset().mockResolvedValue([
      { competition: 'Ligue 1', isLeague: true, played: 8, started: 7, minutes: 650, goals: 1, assists: 3, average: 55 },
      { competition: 'Champions League', isLeague: false, played: 2, started: 2, minutes: 180, goals: 1, assists: 0, average: 65 },
    ]);
    getPlayerSeasons.mockReset().mockResolvedValue([
      { startYear: 2025, appearances: 30, substituteIn: 4, goals: 3, assists: 6, minutes: 2400, yellowCards: 5, redCards: 1 },
    ]);
  });

  it('en-tête : photo, club avec logo, poste, statut, blessure', async () => {
    render(await Page(params('nuno-mendes')));
    expect(screen.getByRole('heading', { level: 1, name: 'Nuno Mendes' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nuno Mendes' })).toHaveAttribute('src', 'https://p/nuno.png');
    expect(screen.getByRole('img', { name: 'Paris Saint-Germain' })).toHaveAttribute('src', 'https://t/psg.png');
    expect(screen.getByRole('link', { name: /Paris Saint-Germain/ })).toHaveAttribute('href', '/equipes/psg');
    expect(screen.getByText('Remplaçant')).toBeInTheDocument();
    expect(screen.getByText(/Blessé · Thigh Injury · retour prévu le 10\/11/)).toBeInTheDocument();
    expect(screen.getByText('Portugal')).toBeInTheDocument();
    expect(screen.getByText('Né le 19 juin 2002')).toBeInTheDocument();
    expect(screen.getByText('Latéral gauche')).toBeInTheDocument();
    expect(screen.getByText('#25')).toBeInTheDocument();
    expect(screen.getByText('Carte : Défenseur / Milieu')).toBeInTheDocument();
    expect(screen.queryByText('Taille')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Postes occupés récemment : DG × 8, PG × 2' })).toBeInTheDocument();
  });

  it('onglets : Aperçu par défaut, liens vers Matchs et Historique', async () => {
    render(await Page(params('nuno-mendes')));
    const tabs = screen.getByRole('navigation', { name: 'Sections de la fiche' });
    expect(within(tabs).getByRole('link', { name: 'Aperçu' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Matchs' })).toHaveAttribute('href', '/joueurs/nuno-mendes?onglet=matchs');
    expect(screen.queryByRole('table', { name: 'Derniers matchs' })).not.toBeInTheDocument();
    expect(getCompetitionTotals).not.toHaveBeenCalled();
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

  it('aperçu : carte Forme', async () => {
    render(await Page(params('nuno-mendes')));
    const l5 = screen.getByTestId('form-L5');
    expect(within(l5).getByText('62')).toHaveClass('t55');
    // 4 derniers matchs d'équipe, 3 joués
    expect(within(l5).getByText('75 %')).toBeInTheDocument();
    expect(screen.queryByText('Titularisations')).not.toBeInTheDocument();
  });

  it('statistiques : temps de jeu et performance', async () => {
    render(await Page(params('nuno-mendes', 'statistiques')));
    expect(screen.getByRole('link', { name: 'Statistiques' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Titularisations').nextSibling).toHaveTextContent('80 %');
    expect(screen.getByLabelText('L5 : 2 buts, 1 passes décisives')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Historique' })).not.toBeInTheDocument();
  });

  it('graphique : une colonne par match, légende, ligne du L15, info-bulle au survol', async () => {
    render(await Page(params('nuno-mendes')));
    const chart = screen.getByRole('img', { name: /Scores Sorare des 4 derniers matchs/ });
    expect(within(chart).getAllByTestId('score-bar')).toHaveLength(4);
    expect(within(chart).getByText('L15 58.1')).toBeInTheDocument();
    fireEvent.mouseEnter(within(chart).getAllByTestId('score-hit')[3]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('70.0');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Titulaire · 90 min');
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 buts · 1 passe décisive');
    expect(within(chart).getAllByTestId('action-icon').map((i) => i.textContent)).toEqual(['⚽', '🎯']);
    expect(within(chart).getAllByTestId('score-bar')[3]).toHaveClass('t70');
  });

  it('graphique : filtres par compétition et par lieu', async () => {
    render(await Page(params('nuno-mendes')));
    fireEvent.change(screen.getByRole('combobox', { name: 'Compétition du graphique' }), { target: { value: 'Champions League' } });
    expect(within(screen.getByRole('img', { name: /Scores Sorare/ })).getAllByTestId('score-bar')).toHaveLength(1);
    expect(screen.getByText(/sur 1 match joué/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Compétition du graphique' }), { target: { value: 'league' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Domicile' }));
    // championnat à domicile : matchs 4 et 2 (identifiants pairs)
    expect(within(screen.getByRole('img', { name: /Scores Sorare/ })).getAllByTestId('score-bar')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Domicile' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Compétition du graphique' }), { target: { value: 'Champions League' } });
    expect(screen.getByText('Aucun match pour ces filtres')).toBeInTheDocument();
  });

  it('prochains matchs : logo de l’adversaire et score potentiel', async () => {
    render(await Page(params('nuno-mendes', 'matchs')));
    const rows = within(screen.getByRole('table', { name: 'Prochains matchs' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('88.1')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('img', { name: 'Olympique de Marseille' })).toHaveAttribute('src', 'https://t/om.png');
    expect(within(rows[0]).getByText('66 pts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('30/100')).toBeInTheDocument();
    expect(within(rows[0]).getByTitle('Domicile')).toHaveTextContent('D');
    expect(within(rows[1]).getByTitle('Extérieur')).toHaveTextContent('E');
    expect(within(rows[1]).getByText('81.1')).toBeInTheDocument();
  });

  it('derniers matchs : lien vers le match', async () => {
    render(await Page(params('nuno-mendes', 'matchs')));
    const rows = within(screen.getByRole('table', { name: 'Derniers matchs' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: /Olympique Lyonnais/ })).toHaveAttribute('href', '/matchs/4');
    expect(within(rows[2]).getByText('absent')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Champions League')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('Ligue 1')).not.toBeInTheDocument();
    expect(within(rows[0]).getByLabelText('2 buts')).toBeInTheDocument();
  });

  it('aperçu : prix Limited, valeur estimée et potentiel', async () => {
    render(await Page(params('nuno-mendes')));
    const card = screen.getByRole('region', { name: 'Marché Limited' });
    expect(within(card).getByText('24,5 €')).toBeInTheDocument();
    expect(within(card).getByText('6,20 €')).toBeInTheDocument();
    expect(within(card).getByText('22 €')).toBeInTheDocument(); // dernière enchère
    expect(within(card).getByText('Sous-évalué −39 %')).toBeInTheDocument();
    expect(within(card).getByText('+12 %')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Voir les ventes →' })).toHaveAttribute('href', '/joueurs/nuno-mendes?onglet=marche');
    expect(getPlayerSales).not.toHaveBeenCalled();
  });

  it('marché : graphique des dernières ventes, filtre saison / Classic', async () => {
    getPlayerSales.mockReset().mockResolvedValue([
      { date: '2026-10-20T10:00:00.000Z', eur: 20, inSeason: true },
      { date: '2026-10-22T10:00:00.000Z', eur: 6, inSeason: false },
      { date: '2026-10-25T10:00:00.000Z', eur: 26, inSeason: true },
    ]);
    render(await Page(params('nuno-mendes', 'marche')));
    expect(screen.getAllByTestId('sale-point')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: 'Toutes' }));
    expect(screen.getAllByTestId('sale-point')).toHaveLength(3);
    fireEvent.mouseEnter(screen.getAllByTestId('sale-point')[1]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('6,00 €');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Classic');
  });

  it('joueur inconnu → notFound', async () => {
    getPlayer.mockResolvedValue(null);
    await expect(Page(params('x'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
