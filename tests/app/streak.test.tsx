// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { StreakFixture } from '@/db/queries';

const getStreakPlan = vi.fn<(c: string, slugs: string[], days: number) => Promise<StreakFixture[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({
    listCompetitions: async () => [{ slug: 'eredivisie', name: 'Eredivisie' }, { slug: 'ligue-1-fr', name: 'Ligue 1' }],
    getSquad: async () => [{ slug: 'smit', competition: 'eredivisie', status: 'owned', purchasePrice: 1 }],
    getStreakPlan,
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { default: Streak } = await import('@/app/streak/page');
const fx = (id: number, date: string, mine: StreakFixture['mine'] = []): StreakFixture => ({ id, date, home: `H${id}`, away: `A${id}`, mine });

describe('/streak', () => {
  it('matchs par jour (heure de Paris) avec mes joueurs concernés', async () => {
    getStreakPlan.mockResolvedValue([
      fx(1, '2026-11-07T19:00:00.000Z', [{ slug: 'smit', name: 'Kees Smit', team: 'AZ', positions: ['Midfielder'], projected: 58.2, startRate: 0.8 }]),
      fx(2, '2026-11-07T21:00:00.000Z'),
      fx(3, '2026-11-08T13:30:00.000Z'),
    ]);
    render(await Streak({ searchParams: Promise.resolve({ cartes: 'delflacito' }) }));
    expect(getStreakPlan).toHaveBeenCalledWith('eredivisie', ['smit'], 14);
    const sat = screen.getByRole('region', { name: 'Samedi 7 novembre' });
    expect(within(sat).getByRole('heading')).toHaveTextContent('1 de tes joueurs · 2 matchs');
    expect(within(sat).getByRole('list', { name: 'Tes joueurs, H1 – A1' })).toHaveTextContent('Kees SmitM · AZ · titu 80 %58');
    expect(screen.getByRole('region', { name: 'Dimanche 8 novembre' })).toHaveTextContent('0 de tes joueurs · 1 match');
    expect(screen.getByRole('link', { name: 'Ligue 1' })).toHaveAttribute('href', '/streak?competition=ligue-1-fr&cartes=delflacito');
  });
});
