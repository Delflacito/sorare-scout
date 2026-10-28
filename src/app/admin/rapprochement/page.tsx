import { getQueries, type ImportRunView } from '@/db/queries';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<ImportRunView['status'], string> = {
  running: 'En cours', ok: 'Réussi', error: 'Échec', quota_exhausted: 'Quota atteint',
};
const SOURCE_LABEL = { sorare: 'Sorare', apifootball: 'API-Football' } as const;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

export default async function RapprochementPage() {
  const queries = getQueries();
  const [run, unmatched] = await Promise.all([queries.getLastRun(), queries.getUnmatched()]);

  return (
    <main>
      <h1>Imports et rapprochement</h1>

      <h2>Dernier import</h2>
      {run ? (
        <div className="card">
          <p>
            <strong>{STATUS_LABEL[run.status]}</strong> — démarré le {fmtDateTime(run.startedAt)}
            {run.finishedAt && <>, terminé le {fmtDateTime(run.finishedAt)}</>} — {run.fixturesImported} match(s) importé(s)
          </p>
          {run.status === 'quota_exhausted' && <p>Quota API-Football atteint, reprise au prochain import</p>}
          {run.errors.length > 0 && <ul>{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      ) : (
        <p className="empty">Aucun import pour l’instant</p>
      )}

      <h2>Joueurs non appariés ({unmatched.length})</h2>
      <p className="subtitle">Joueurs notés par Sorare mais introuvables dans la compo API-Football : leur poste précis est inconnu.</p>
      {unmatched.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Nom</th><th>Club</th><th>Match</th><th>Date</th></tr></thead>
            <tbody>
              {unmatched.map((u, i) => (
                <tr key={i}>
                  <td>{SOURCE_LABEL[u.source]}</td>
                  <td>{u.name}</td>
                  <td>{u.club ?? '—'}</td>
                  <td>{u.fixture ?? '—'}</td>
                  <td>{u.date ? fmtDate(u.date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Tous les joueurs sont appariés</p>
      )}
    </main>
  );
}
