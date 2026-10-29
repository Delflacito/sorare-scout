// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { ClubMarketView, MarketPlayerView } from '@/db/queries';

const getClubsMarket = vi.fn<(c?: string) => Promise<ClubMarketView[]>>();
const getMarketPlayers = vi.fn<(f: object) => Promise<MarketPlayerView[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({
    getClubsMarket, getMarketPlayers,
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
});

describe('/marche', () => {
  it('récapitulatif : valeur totale par club', async () => {
    getClubsMarket.mockResolvedValue([
      { slug: 'psv', name: 'PSV', pictureUrl: null, competition: 'Eredivisie', competitionSlug: 'eredivisie', players: 25, priced: 18, totalFloor: 640, topPlayer: 'Xavi', topPrice: 120 },
    ]);
    render(await Page(params()));
    const row = within(screen.getByRole('table', { name: 'Valeur des cartes par club' })).getAllByRole('row')[1];
    expect(within(row).getByRole('link', { name: 'PSV' })).toHaveAttribute('href', '/marche?club=psv');
    expect(within(row).getByText('640 €')).toBeInTheDocument();
    expect(within(row).getByText('18 / 25')).toBeInTheDocument();
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
  });
});
