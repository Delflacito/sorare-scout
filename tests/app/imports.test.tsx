// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ImportRunView } from '@/db/queries';

const getLastRun = vi.fn<() => Promise<ImportRunView | null>>();
const getLastSuccessfulImport = vi.fn<() => Promise<string | null>>();
vi.mock('@/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/queries')>()),
  getQueries: () => ({ getLastRun, getLastSuccessfulImport }),
}));

const { default: Page } = await import('@/app/admin/imports/page');
const { DataFooter } = await import('@/components/DataFooter');

const run: ImportRunView = { startedAt: '2026-10-28T05:17:00.000Z', finishedAt: '2026-10-28T05:20:00.000Z', status: 'ok', fixturesImported: 12, errors: [] };

describe('/admin/imports', () => {
  beforeEach(() => getLastRun.mockReset().mockResolvedValue(run));

  it('dernier import', async () => {
    render(await Page());
    expect(screen.getByText(/12 match\(s\) importé\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
  });

  it('erreurs listées', async () => {
    getLastRun.mockResolvedValue({ ...run, errors: ['club om : Sorare GraphQL: timeout'] });
    render(await Page());
    expect(screen.getByText('club om : Sorare GraphQL: timeout')).toBeInTheDocument();
  });

  it('aucun import', async () => {
    getLastRun.mockResolvedValue(null);
    render(await Page());
    expect(screen.getByText('Aucun import pour l’instant')).toBeInTheDocument();
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
