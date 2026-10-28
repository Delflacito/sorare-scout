import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries, type MatchPlayerView, type MatchSideView } from '@/db/queries';
import { POSITION_LABEL_FR } from '@/domain/types';
import { fmtDate, fmtScore } from '@/lib/format';

export const dynamic = 'force-dynamic';

function TeamTable({ side, players }: { side: MatchSideView; players: MatchPlayerView[] }) {
  // Les joueurs restés sur le banc sans jouer n'apportent rien au détail du match.
  const shown = players.filter((p) => p.started || p.minutes > 0);
  const label = `${side.name}${side.formation ? ` (${side.formation})` : ''}`;
  return (
    <section>
      <h2><Link href={`/equipes/${side.slug}`}>{side.name}</Link>{side.formation && <span className="subtitle"> · {side.formation}</span>}</h2>
      <div className="table-wrap">
        <table aria-label={label}>
          <thead>
            <tr><th>Joueur</th><th>Poste</th><th>Statut</th><th>Min.</th><th>Sorare</th><th>Décisif</th><th>All-Around</th></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.slug}>
                <td><Link href={`/joueurs/${p.slug}`}>{p.name}</Link></td>
                <td>{p.detailedPosition ? POSITION_LABEL_FR[p.detailedPosition] : '—'}</td>
                <td>{p.started ? 'titulaire' : 'remplaçant'}</td>
                <td className="num">{p.minutes}</td>
                <td className="num strong">{fmtScore(p.score)}</td>
                <td className="num">{fmtScore(p.decisive)}</td>
                <td className="num">{fmtScore(p.allAround)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const match = await getQueries().getMatch(id);
  if (!match) notFound();
  const score = match.status === 'played' ? `${match.home.goals ?? '–'} – ${match.away.goals ?? '–'}` : '–';

  return (
    <main>
      <h1>{match.home.name} {score} {match.away.name}</h1>
      <p className="subtitle">{match.competition} · {fmtDate(match.date)}</p>
      {match.players.length === 0 ? (
        <p className="empty">Compos et scores pas encore disponibles pour ce match</p>
      ) : (
        <div className="match-teams">
          <TeamTable side={match.home} players={match.players.filter((p) => p.side === 'home')} />
          <TeamTable side={match.away} players={match.players.filter((p) => p.side === 'away')} />
        </div>
      )}
    </main>
  );
}
