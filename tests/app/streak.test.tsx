// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('matchs par jour (heure de Paris), joueurs par club puis poste, sélection avec total potentiel', async () => {
    window.localStorage.clear();
    const m = (slug: string, team: string, pos: 'Goalkeeper' | 'Forward', projected: number | null) =>
      ({ slug, name: slug, team, positions: [pos], projected, startRate: 0.8 });
    getStreakPlan.mockResolvedValue([
      { ...fx(1, '2026-11-07T19:00:00.000Z', [m('gk', 'H1', 'Goalkeeper', 40), m('fw', 'H1', 'Forward', 60), m('away', 'A1', 'Forward', 55)]) },
      fx(2, '2026-11-07T21:00:00.000Z'),
      fx(3, '2026-11-08T13:30:00.000Z'),
    ]);
    render(await Streak({ searchParams: Promise.resolve({ cartes: 'delflacito' }) }));
    expect(getStreakPlan).toHaveBeenCalledWith('eredivisie', ['smit'], 14);
    expect(screen.getByText('Samedi 7 novembre').parentElement).toHaveTextContent('3 de tes joueurs · 2 matchs');
    expect(screen.getByText('Dimanche 8 novembre').parentElement).toHaveTextContent('0 de tes joueurs · 1 match');
    const home = screen.getByRole('list', { name: 'Tes joueurs, H1' });
    expect(within(home).getAllByRole('link').map((l) => l.textContent)).toEqual(['gk', 'fw']); // club, puis poste
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner fw' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner away' }));
    expect(screen.getByText('Samedi 7 novembre').parentElement).toHaveTextContent('2 sélectionnés, 115 pts potentiels');
    expect(JSON.parse(window.localStorage.getItem('sorare-scout:streak-selection')!)).toEqual(['1:fw', '1:away']);
    fireEvent.click(screen.getByRole('button', { name: 'Seulement ma sélection' }));
    expect(screen.queryByRole('list', { name: 'Tes joueurs, H1' })).toHaveTextContent('fw');
    expect(screen.queryByRole('checkbox', { name: 'Sélectionner gk' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ligue 1' })).toHaveAttribute('href', '/streak?competition=ligue-1-fr&cartes=delflacito');
  });
});
