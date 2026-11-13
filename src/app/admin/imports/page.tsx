import { getQueries, type ImportRunView } from '@/db/queries';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<ImportRunView['status'], string> = { running: 'En cours', ok: 'Réussi', error: 'Échec' };

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

export default async function ImportsPage() {
  const run = await getQueries().getLastRun();

  return (
    <main>
      <h1>Imports</h1>
      <h2>Dernier import</h2>
      {run ? (
        <div className="card">
          <p>
            <strong>{run.status === 'ok' && run.errors.length ? 'Réussi avec des erreurs' : STATUS_LABEL[run.status]}</strong> — démarré le {fmtDateTime(run.startedAt)}
            {run.finishedAt && <>, terminé le {fmtDateTime(run.finishedAt)}</>} — {run.fixturesImported} match(s) importé(s)
          </p>
          {run.errors.length > 0 && (
            <>
              <p>Erreurs ({run.errors.length}) :</p>
              <ul>{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      ) : (
        <p className="empty">Aucun import pour l’instant</p>
      )}
    </main>
  );
}
