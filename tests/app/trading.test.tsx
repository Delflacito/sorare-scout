// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { GameWeekFixture, TradingFilters, TradingRow } from '@/db/queries';

const getTrading = vi.fn<(f: TradingFilters) => Promise<TradingRow[]>>();
const getGameWeekFixtures = vi.fn<(c?: string) => Promise<GameWeekFixture[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getTrading, getGameWeekFixtures, listCompetitions: async () => [{ slug: 'eredivisie', name: 'Eredivisie' }] }),
}));

const { default: Page } = await import('@/app/trading/page');

const row: TradingRow = {
  slug: 'xavi-simons', name: 'Xavi Simons', pictureUrl: null, team: 'PSV', teamPictureUrl: null, cardPositions: ['Midfielder', 'Forward'],
  usualPosition: 'AM', l5: 72, l15: 60, startRate: 1, price: 30, fairPrice: 50, valueRatio: 0.6, priceTrend7: 0.08, sales30: 12,
  potentialPrice: 34.5, potentialGain: 0.15, nextProjected: 78, nextOpponent: 'Ajax', nextOpponentPictureUrl: null, nextIsHome: true,
  nextDate: '2099-01-01T20:00:00.000Z',
};
const fixture = { id: 9, date: '2099-01-01T20:00:00.000Z' } as GameWeekFixture;
const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) });

describe('/trading', () => {
  beforeEach(() => {
    getTrading.mockReset().mockResolvedValue([row]);
    getGameWeekFixtures.mockReset().mockResolvedValue([fixture]);
  });

  it('sous-évalués par défaut : prix, valeur estimée, écart, forme, tendance', async () => {
    render(await Page(params()));
    expect(getTrading).toHaveBeenCalledWith({ view: 'sous', competition: undefined, position: undefined, maxPrice: undefined, fixtureIds: [], limit: 50 });
    const r = within(screen.getByRole('table', { name: 'Joueurs sous-évalués' })).getAllByRole('row')[1];
    expect(within(r).getByRole('link', { name: 'Xavi Simons' })).toHaveAttribute('href', '/joueurs/xavi-simons?onglet=marche');
    expect(within(r).getByText('30 €')).toBeInTheDocument();
    expect(within(r).getByText('50 €')).toBeInTheDocument();
    expect(within(r).getByText('+40 %')).toHaveClass('hot');
    expect(within(r).getByText('↗ 72')).toBeInTheDocument();
    expect(within(r).getByText('Milieu / Attaquant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sous-évalués' })).toHaveAttribute('aria-current', 'page');
  });

  it('hausse avant la GW : matchs de la journée, prix potentiel et plus-value en % et en €', async () => {
    render(await Page(params({ vue: 'gw', competition: 'eredivisie', prixMax: '40' })));
    expect(getGameWeekFixtures).toHaveBeenCalledWith('eredivisie');
    expect(getTrading).toHaveBeenCalledWith({ view: 'gw', competition: 'eredivisie', position: undefined, maxPrice: 40, fixtureIds: [9], limit: 50 });
    const r = within(screen.getByRole('table', { name: 'Hausse attendue avant la Game Week' })).getAllByRole('row')[1];
    expect(within(r).getByText('34,5 €')).toBeInTheDocument();
    expect(within(r).getByText('+15 %')).toBeInTheDocument();
    expect(within(r).getByText('+4,50 €')).toBeInTheDocument();
    expect(within(r).getByTitle('Domicile')).toBeInTheDocument();
  });

  it('aucun résultat', async () => {
    getTrading.mockResolvedValue([]);
    render(await Page(params({ vue: 'sur' })));
    expect(screen.getByText(/Aucun joueur pour ces filtres/)).toBeInTheDocument();
  });
});
