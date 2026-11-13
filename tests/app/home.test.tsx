// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { GameWeekFixture, GameWeekPlayer, TradingRow } from '@/db/queries';

const getGameWeekFixtures = vi.fn<() => Promise<GameWeekFixture[]>>();
const getGameWeekPlayers = vi.fn<() => Promise<GameWeekPlayer[]>>();
const getTrading = vi.fn<() => Promise<TradingRow[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getGameWeekFixtures, getGameWeekPlayers, getTrading }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/trading' }));

const { default: Home } = await import('@/app/page');
const { NavTabs } = await import('@/components/NavTabs');

const gw = (slug: string, projected: number, position: GameWeekPlayer['position'] = 'Forward') => ({
  slug, name: slug, position, usualPosition: null, team: 'PSV', teamPictureUrl: null, pictureUrl: null, opponent: 'Ajax', opponentPictureUrl: null,
  isHome: true, date: '2099-01-01T20:00:00.000Z', projected, startRate: 1, l15: 60, base: 60, playingStatus: null, sorareProjection: null,
  cardPositions: [position],
}) as GameWeekPlayer;

describe('accueil', () => {
  it('raccourcis, prochaine journée et tops (un joueur par ligne)', async () => {
    getGameWeekFixtures.mockResolvedValue([{ id: 1, date: '2099-01-01T20:00:00.000Z' } as GameWeekFixture]);
    getGameWeekPlayers.mockResolvedValue([gw('a', 70), gw('b', 80), gw('a', 70, 'Midfielder')]);
    getTrading.mockResolvedValue([]);
    render(await Home());
    expect(screen.getByText(/1 match/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mon effectif/ })).toHaveAttribute('href', '/effectif');
    const top = screen.getByRole('region', { name: 'Top scores potentiels de la journée' });
    expect(within(top).getAllByRole('listitem').map((li) => within(li).getByRole('link').textContent)).toEqual(['b', 'a']);
    expect(screen.getByRole('region', { name: 'Cartes sous-évaluées' })).toHaveTextContent('Pas encore de données');
  });

  it('onglets : celui de la page courante est actif', () => {
    render(<NavTabs />);
    expect(screen.getByRole('link', { name: 'Trading' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Delflacito' })).not.toHaveAttribute('aria-current');
  });
});
