// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ClubMarketView, MarketPlayerView } from '@/db/queries';

const getClubsMarket = vi.fn<(c?: string) => Promise<ClubMarketView[]>>();
const getMarketPlayers = vi.fn<(f: object) => Promise<MarketPlayerView[]>>();
const getSquad = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({
    getClubsMarket, getMarketPlayers, getSquad,
    getDailyPrices: async () => ['a', 'b', 'c'].flatMap((slug) => [
      { slug, day: '2026-10-21', price: 40, inSeason: true }, { slug, day: '2026-10-22', price: 50, inSeason: true },
      { slug, day: '2026-10-21', price: 8, inSeason: false }, { slug, day: '2026-10-22', price: 6, inSeason: false },
    ]),
    listCompetitions: async () => [{ slug: 'eredivisie', name: 'Eredivisie' }],
    listTeams: async () => [{ slug: 'psv', name: 'PSV', competitionSlug: 'eredivisie' }],
  }),
}));

const { default: Page } = await import('@/app/marche/page');
const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) });
const mp = (slug: string, floor: number | null, classic: number | null): MarketPlayerView => ({
  slug, name: slug, pictureUrl: null, team: 'PSV', teamSlug: 'psv', teamPictureUrl: null, competition: 'Eredivisie', competitionSlug: 'eredivisie',
  cardPositions: ['Midfielder'], usualPosition: 'CM', l15: 50, floorInSeason: floor, floorClassic: classic, recentPrice: floor, price: floor,
  fairPrice: floor && floor * 1.5, valueRatio: floor ? 1 / 1.5 : null, potentialPrice: null, potentialGain: null, priceTrend7: null,
  lastAuction: floor ? { eur: floor - 1, date: '2026-10-28T10:00:00.000Z' } : null,
});

describe('/marche', () => {
  it('championnat choisi : valeur estimée totale et sa courbe ; aucune courbe pour toutes les ligues', async () => {
    getClubsMarket.mockResolvedValue([
      { slug: 'psv', name: 'PSV', pictureUrl: null, competition: 'Eredivisie', competitionSlug: 'eredivisie', players: 25, priced: 18, totalFloor: 640, topPlayer: 'Xavi', topPrice: 120, totalFair: 800 },
    ]);
    render(await Page(params({ competition: 'eredivisie' })));
    // Valeur actuelle : dernières ventes de la saison (3 joueurs à 50 €) face à la valeur estimée (800 €)
    expect(screen.getByText('Valeur actuelle (ventes)').parentElement).toHaveTextContent('150 €');
    expect(screen.getAllByText('Valeur estimée').find((e) => e.classList.contains('card-kicker'))!.parentElement).toHaveTextContent('800 €+433 % par rapport à la valeur actuelle');
    const chart = screen.getByRole('figure');
    expect(within(chart).getByRole('img')).toHaveAccessibleName(/tous les clubs du championnat/);
  });

  it('récapitulatif : valeur totale par club', async () => {
    getClubsMarket.mockResolvedValue([
      { slug: 'psv', name: 'PSV', pictureUrl: null, competition: 'Eredivisie', competitionSlug: 'eredivisie', players: 25, priced: 18, totalFloor: 640, topPlayer: 'Xavi', topPrice: 120, totalFair: 800 },
    ]);
    render(await Page(params()));
    const row = within(screen.getByRole('table', { name: 'Valeur des cartes par club' })).getAllByRole('row')[1];
    expect(within(row).getByRole('link', { name: 'PSV' })).toHaveAttribute('href', '/marche?club=psv');
    expect(within(row).getByText('640 €')).toBeInTheDocument();
    expect(within(row).getByText('18 / 25')).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('club : prix de toutes les cartes et totaux', async () => {
    getMarketPlayers.mockResolvedValue([mp('a', 40, 10), mp('b', 12.5, null), mp('c', null, null)]);
    render(await Page(params({ club: 'psv' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marché · PSV');
    expect(getMarketPlayers).toHaveBeenCalledWith({ team: 'psv' });
    const table = screen.getByRole('table', { name: 'Prix des cartes du club' });
    const total = within(table).getByRole('row', { name: /Total/ });
    expect(total).toHaveTextContent('52,5 €');
    expect(total).toHaveTextContent('10 €');
    expect(screen.getByText(/2 cartes en vente sur 3 joueurs/)).toBeInTheDocument();
    // Graphique : somme des ventes réelles (3 × 40 = 120 puis 3 × 50 = 150), adoucie par la moyenne pondérée :
    // (3 × 150 + 2 × 120) / 5 = 138 contre 120, soit +15 % ; la valeur estimée n'intervient pas
    const chart = screen.getByRole('figure');
    expect(chart).toHaveTextContent('Évolution de la valeur actuelle');
    expect(chart).toHaveTextContent('Valeur actuelle depuis le 21 oct.');
    // Valeur estimée du club (60 + 18,75 = 78,75 €) : −47 % par rapport à la valeur actuelle (150 €), arrondi de −47,5 %
    expect(screen.getAllByText('Valeur estimée').find((e) => e.classList.contains('card-kicker'))!.parentElement).toHaveTextContent('−47 % par rapport à la valeur actuelle');
    expect(within(chart).getByRole('img')).toHaveAccessibleName(/de 120 € le 21 oct\. à 138 €/);
    expect(within(chart).getAllByTestId('value-hit')).toHaveLength(2); // 21 et 22 octobre
    expect(within(chart).getByText('+15 %')).toBeInTheDocument();
    // Un clic pour passer aux cartes Classic : somme des prix de vente (24 puis 18), pondérée : (3 × 18 + 2 × 24) / 5 = 20,4
    expect(within(chart).getByRole('radio', { name: 'Saison 26' })).toBeChecked();
    fireEvent.click(within(chart).getByRole('radio', { name: 'Classic' }));
    expect(within(chart).getByRole('radio', { name: 'Classic' })).toBeChecked();
    expect(within(chart).getByRole('img')).toHaveAccessibleName(/Classic.*de 24 € le 21 oct\. à 20,4 €/);
  });

  it('club avec mes cartes : repère devant les joueurs possédés, investi face à la valeur actuelle', async () => {
    getMarketPlayers.mockResolvedValue([mp('a', 40, 10), mp('b', 12.5, null), mp('c', null, null)]);
    getSquad.mockResolvedValue([
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 30 },
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 20 },
      { slug: 'b', competition: 'eredivisie', status: 'owned', purchasePrice: null },
      { slug: 'c', competition: 'eredivisie', status: 'target', purchasePrice: null },
    ]);
    render(await Page(params({ club: 'psv', cartes: 'delflacito' })));
    expect(getSquad).toHaveBeenCalledWith('delflacito');
    const rows = within(screen.getByRole('table', { name: 'Prix des cartes du club' })).getAllByRole('row');
    expect(within(rows[1]).getByRole('img', { name: 'Carte possédée' })).toHaveTextContent('✓×2');
    expect(within(rows[2]).getByRole('img', { name: 'Carte possédée' })).toHaveTextContent('✓');
    expect(within(rows[3]).queryByRole('img', { name: 'Carte possédée' })).not.toBeInTheDocument(); // simple cible
    // Investi : 30 + 20 (prix inconnu de b non compté) ; valeur : 2 × 40 + 12,5 = 92,5 €, soit +85 %
    expect(screen.getByText('Investi dans le club').parentElement).toHaveTextContent('50 €3 cartes possédées · 1 prix d’achat inconnu');
    expect(screen.getByText('Valeur actuelle de mes cartes').parentElement).toHaveTextContent('92,5 €+85 % par rapport à l’investi');
  });
});
