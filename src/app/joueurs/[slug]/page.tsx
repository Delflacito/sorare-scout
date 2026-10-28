import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR } from '@/domain/types';
import { ConcededBadge } from '@/components/ConcededBadge';
import { ScoreChart } from '@/components/ScoreChart';
import { fmtDate, fmtPct, fmtScore } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export default async function JoueurPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const queries = getQueries();
  const [player, games] = await Promise.all([queries.getPlayer(slug), queries.getPlayerGames(slug, 15)]);
  if (!player) notFound();
  const s = player.summary;

  return (
    <main>
      <h1>{player.name}</h1>
      <p className="subtitle">
        {player.teamSlug ? <Link href={`/equipes/${player.teamSlug}`}>{player.team}</Link> : '—'}
        {player.competition && <> · {player.competition}</>}
        {' · '}{player.usualPosition ? POSITION_LABEL_FR[player.usualPosition] : GENERIC_LABEL_FR[player.position]}
      </p>

      <h2>Prochain match</h2>
      {player.next ? (
        <p>
          {fmtDate(player.next.date)} — {player.next.isHome ? 'vs' : '@'}{' '}
          <Link href={`/equipes/${player.next.opponentSlug}`}>{player.next.opponent}</Link>
          <br />
          <ConcededBadge conceded={player.nextConceded} />
        </p>
      ) : (
        <p className="empty">Aucun match programmé</p>
      )}

      {s ? (
        <>
          <h2>Scores</h2>
          <div className="cards">
            <Card label="L5" value={fmtScore(s.l5)} />
            <Card label="L15" value={fmtScore(s.l15)} />
            <Card label="L40" value={fmtScore(s.l40)} />
            <Card label="Régularité (écart-type L5)" value={fmtScore(s.stdDev5)} />
          </div>
          <ScoreChart games={games} />

          <h2>Temps de jeu</h2>
          <div className="cards">
            <Card label="% titu (5)" value={fmtPct(s.startRate5)} />
            <Card label="Minutes moy. (5)" value={String(Math.round(s.avgMinutes5))} />
            <Card label="% titu (15)" value={fmtPct(s.startRate15)} />
            <Card label="Minutes moy. (15)" value={String(Math.round(s.avgMinutes15))} />
          </div>

          <h2>Détail du score</h2>
          <div className="cards">
            <Card label="Decisive (L5)" value={fmtScore(s.decisive5)} />
            <Card label="All-Around (L5)" value={fmtScore(s.allAround5)} />
            <Card label="Decisive (L15)" value={fmtScore(s.decisive15)} />
            <Card label="All-Around (L15)" value={fmtScore(s.allAround15)} />
          </div>
        </>
      ) : (
        <p className="empty">Pas encore de match importé pour ce joueur</p>
      )}

      <h2>Postes occupés récemment</h2>
      {player.positions.length ? (
        <p className="chips">{player.positions.map((p) => <span key={p.position}>{POSITION_LABEL_FR[p.position]} × {p.count}</span>)}</p>
      ) : (
        <p className="empty">Aucune titularisation récente</p>
      )}
    </main>
  );
}
