import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries, type PlayerGameView, type UpcomingView } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR } from '@/domain/types';
import { projectedScore } from '@/domain/projection';
import { ScoreChart } from '@/components/ScoreChart';
import { fmtDate, fmtIndex, fmtPct, fmtScore, indexClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

const STATUS_LABEL = { started: 'titulaire', sub: 'remplaçant', absent: 'absent' } as const;

function IndexCell({ v }: { v: { index: number | null; observations: number } | null }) {
  if (!v || v.index === null) return <td className="num">—</td>;
  return (
    <td className={`num ${indexClass(v.index)} ${v.observations < 3 ? 'low-sample' : ''}`} title={`${v.observations} observation(s)`}>
      {fmtIndex(v.index)}
    </td>
  );
}

function UpcomingTable({ upcoming }: { upcoming: UpcomingView }) {
  if (!upcoming.fixtures.length) return <p className="empty">Aucun match programmé</p>;
  const pos = upcoming.usualPosition ? POSITION_LABEL_FR[upcoming.usualPosition] : 'poste';
  return (
    <>
      <div className="table-wrap">
        <table aria-label="Prochains matchs">
          <thead>
            <tr><th>Date</th><th>Match</th><th>Score potentiel</th><th>Adv. au poste ({pos})</th><th>Qualité adv.</th></tr>
          </thead>
          <tbody>
            {upcoming.fixtures.map((f) => (
              <tr key={f.fixtureId}>
                <td>{fmtDate(f.date)}</td>
                <td>{f.isHome ? 'vs' : '@'} <Link href={`/equipes/${f.opponentSlug}`}>{f.opponent}</Link></td>
                <td className="num strong">
                  {upcoming.form === null
                    ? '—'
                    : fmtScore(projectedScore({
                        form: upcoming.form,
                        positionIndex: f.position?.index ?? null, positionObs: f.position?.observations ?? 0,
                        teamIndex: f.overall?.index ?? null, teamObs: f.overall?.observations ?? 0,
                        isHome: f.isHome,
                      }))}
                </td>
                <IndexCell v={f.position} />
                <IndexCell v={f.overall} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="subtitle">
        Score potentiel s’il joue : forme {upcoming.form === null ? '—' : fmtScore(upcoming.form)} (0,6 × 5 derniers matchs joués + 0,4 × 15)
        × adversaire (60 % qualité générale, 40 % concédé au poste, indice 100 = moyenne de la ligue) × domicile +3 % / extérieur −3 %.
        {upcoming.startRate !== null && <> Probabilité d’être titulaire : {fmtPct(upcoming.startRate)} (5 derniers matchs).</>}
      </p>
    </>
  );
}

function LastGamesTable({ games }: { games: PlayerGameView[] }) {
  if (!games.length) return <p className="empty">Aucun match importé</p>;
  return (
    <div className="table-wrap">
      <table aria-label="Derniers matchs">
        <thead>
          <tr><th>Date</th><th>Match</th><th>Score</th><th>Statut</th><th>Min.</th><th>Poste</th><th>Sorare</th><th>Décisif</th><th>All-Around</th></tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.fixtureId}>
              <td>{fmtDate(g.date)}</td>
              <td>{g.isHome ? 'vs' : '@'} <Link href={`/matchs/${g.fixtureId}`}>{g.opponent}</Link></td>
              <td className="num">{g.goalsFor ?? '–'} – {g.goalsAgainst ?? '–'}</td>
              <td>{STATUS_LABEL[g.status]}</td>
              <td className="num">{g.minutes}</td>
              <td>{g.position ? POSITION_LABEL_FR[g.position] : '—'}</td>
              <td className="num strong">{g.status === 'absent' ? '—' : fmtScore(g.score)}</td>
              <td className="num">{g.status === 'absent' ? '—' : fmtScore(g.decisive)}</td>
              <td className="num">{g.status === 'absent' ? '—' : fmtScore(g.allAround)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function JoueurPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const queries = getQueries();
  const [player, games, upcoming] = await Promise.all([
    queries.getPlayer(slug), queries.getPlayerGames(slug, 15), queries.getUpcoming(slug, 5),
  ]);
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

      <h2>Prochains matchs</h2>
      {upcoming && <UpcomingTable upcoming={upcoming} />}

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

      <h2>Derniers matchs</h2>
      <LastGamesTable games={games} />

      <h2>Postes occupés récemment</h2>
      {player.positions.length ? (
        <p className="chips">{player.positions.map((p) => <span key={p.position}>{POSITION_LABEL_FR[p.position]} × {p.count}</span>)}</p>
      ) : (
        <p className="empty">Aucune titularisation récente</p>
      )}
    </main>
  );
}
