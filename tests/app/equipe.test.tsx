// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ConcededView, TeamView, TeamFixtureView } from '@/db/queries';
import { DETAILED_POSITIONS } from '@/domain/types';

const getTeam = vi.fn<(slug: string) => Promise<TeamView | null>>();
const getConceded = vi.fn<(teamId: number, w: number) => Promise<ConcededView[]>>();
const getTeamFixtures = vi.fn<(teamId: number, w: number) => Promise<TeamFixtureView[]>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getTeam, getConceded, getTeamFixtures }),
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const { default: Page } = await import('@/app/equipes/[slug]/page');

const team: TeamView = { id: 7, name: 'Olympique de Marseille', slug: 'om', competition: 'Ligue 1' };
const conceded: ConcededView[] = [
  { position: 'LB', average: 65, leagueAverage: 50, index: 1.3, observations: 5, lowSample: false },
  { position: 'ST', average: 40, leagueAverage: 50, index: 0.8, observations: 2, lowSample: true },
];
const fixtures: TeamFixtureView[] = [
  { fixtureId: 1, date: '2026-10-25T19:00:00.000Z', opponent: 'Paris Saint-Germain', opponentSlug: 'psg', isHome: false, goalsFor: 1, goalsAgainst: 2 },
];
const props = (search: Record<string, string> = {}) => ({ params: Promise.resolve({ slug: 'om' }), searchParams: Promise.resolve(search) });

describe('/equipes/[slug]', () => {
  beforeEach(() => {
    getTeam.mockReset().mockResolvedValue(team);
    getConceded.mockReset().mockResolvedValue(conceded);
    getTeamFixtures.mockReset().mockResolvedValue(fixtures);
  });

  it('terrain avec les 12 postes et couleurs selon l’indice', async () => {
    render(await Page(props()));
    expect(screen.getByRole('heading', { level: 1, name: 'Olympique de Marseille' })).toBeInTheDocument();
    for (const p of DETAILED_POSITIONS) expect(screen.getByTestId(`zone-${p}`)).toBeInTheDocument();
    expect(screen.getByTestId('zone-LB')).toHaveClass('hot');
    expect(screen.getByTestId('zone-LB')).toHaveTextContent('65');
    expect(screen.getByTestId('zone-ST')).toHaveClass('cold');
    expect(screen.getByTestId('zone-ST')).toHaveClass('low-sample');
    expect(screen.getByTestId('zone-CB')).toHaveClass('empty');
    expect(getConceded).toHaveBeenCalledWith(7, 5);
    expect(screen.getByRole('link', { name: /Paris Saint-Germain/ })).toHaveAttribute('href', '/equipes/psg');
    expect(screen.getByText('1 – 2')).toBeInTheDocument();
  });

  it('fenêtre de 10 matchs', async () => {
    await Page(props({ fenetre: '10' }));
    expect(getConceded).toHaveBeenCalledWith(7, 10);
    expect(getTeamFixtures).toHaveBeenCalledWith(7, 10);
  });

  it('fenêtre invalide → 5', async () => {
    await Page(props({ fenetre: '99' }));
    expect(getConceded).toHaveBeenCalledWith(7, 5);
  });

  it('équipe inconnue → notFound', async () => {
    getTeam.mockResolvedValue(null);
    await expect(Page(props())).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
