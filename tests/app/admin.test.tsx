// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ImportRunView, UnmatchedView } from '@/db/queries';

const getUnmatched = vi.fn<() => Promise<UnmatchedView[]>>();
const getLastRun = vi.fn<() => Promise<ImportRunView | null>>();
const getLastSuccessfulImport = vi.fn<() => Promise<string | null>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getUnmatched, getLastRun, getLastSuccessfulImport }),
}));

const { default: Page } = await import('@/app/admin/rapprochement/page');
const { DataFooter } = await import('@/components/DataFooter');

const run: ImportRunView = { startedAt: '2026-10-28T05:17:00.000Z', finishedAt: '2026-10-28T05:20:00.000Z', status: 'ok', fixturesImported: 12, errors: [] };

describe('/admin/rapprochement', () => {
  beforeEach(() => {
    getUnmatched.mockReset().mockResolvedValue([{ source: 'sorare', name: 'Hernández', club: 'om', fixture: 'OM – OL', date: '2026-10-11T20:00:00.000Z' }]);
    getLastRun.mockReset().mockResolvedValue(run);
  });

  it('liste des joueurs non appariés et dernier import', async () => {
    render(await Page());
    expect(screen.getByRole('cell', { name: 'Hernández' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'OM – OL' })).toBeInTheDocument();
    expect(screen.getByText(/12 match\(s\) importé\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
  });

  it('quota atteint → message explicite', async () => {
    getLastRun.mockResolvedValue({ ...run, status: 'quota_exhausted' });
    render(await Page());
    expect(screen.getByText('Quota API-Football atteint, reprise au prochain import')).toBeInTheDocument();
  });

  it('erreurs listées', async () => {
    getLastRun.mockResolvedValue({ ...run, status: 'error', errors: ['fetch failed'] });
    render(await Page());
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });

  it('aucun import ni joueur non apparié', async () => {
    getLastRun.mockResolvedValue(null);
    getUnmatched.mockResolvedValue([]);
    render(await Page());
    expect(screen.getByText('Aucun import pour l’instant')).toBeInTheDocument();
    expect(screen.getByText('Tous les joueurs sont appariés')).toBeInTheDocument();
  });
});

describe('DataFooter', () => {
  it('date du dernier import réussi', async () => {
    getLastSuccessfulImport.mockResolvedValue('2026-10-28T05:20:00.000Z');
    render(await DataFooter());
    expect(screen.getByText(/Données au 28\/10\/2026/)).toBeInTheDocument();
  });
  it('base indisponible → pas de plantage', async () => {
    getLastSuccessfulImport.mockRejectedValue(new Error('DATABASE_URL manquant'));
    render(await DataFooter());
    expect(screen.getByText('Données : date inconnue')).toBeInTheDocument();
  });
});
