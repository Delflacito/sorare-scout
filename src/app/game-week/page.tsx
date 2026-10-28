import Link from 'next/link';
import { getQueries, type GameWeekPlayer } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR, type GenericPosition } from '@/domain/types';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { StatusBadges } from '@/components/StatusBadges';
import { fmtDate, fmtPct, fmtScore, roundLabel } from '@/lib/format';
import { one, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const SECTIONS: [GenericPosition, string][] = [
  ['Goalkeeper', 'Gardiens'], ['Defender', 'Défenseurs'], ['Midfielder', 'Milieux'], ['Forward', 'Attaquants'],
];
const PER_POSITION = 10;

function PlayersTable({ title, players }: { title: string; players: GameWeekPlayer[] }) {
  return (
    <section>
      <h2>{title}</h2>
      {players.length === 0 ? <p className="empty">Aucun joueur</p> : (
        <div className="table-wrap">
          <table aria-label={title}>
            <thead>
              <tr><th>#</th><th>Joueur</th><th>Match</th><th>Poste</th><th>Potentiel</th><th>L15</th><th>% titu</th><th>Proj. Sorare</th></tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.slug}>
                  <td className="rank">{i + 1}</td>
                  <td>
                    <span className="player-cell">
                      <PlayerAvatar name={p.name} url={p.pictureUrl} size={32} />
                      <Link href={`/joueurs/${p.slug}`}>{p.name}</Link>
                      <StatusBadges compact playingStatus={p.playingStatus} injury={null} suspension={null} />
                    </span>
                  </td>
                  <td>
                    <span className="club-link">
                      <ClubLogo name={p.team} url={p.teamPictureUrl} />
                      <span className="muted">{p.isHome ? 'vs' : '@'}</span>
                      <ClubLogo name={p.opponent} url={p.opponentPictureUrl} />
                      {p.opponent}
                    </span>
                    <div className="muted small">{fmtDate(p.date)}</div>
                  </td>
                  <td>{p.usualPosition ? POSITION_LABEL_FR[p.usualPosition] : GENERIC_LABEL_FR[p.position]}</td>
                  <td className="num strong">{fmtScore(p.projected)}</td>
                  <td className="num">{fmtScore(p.l15)}</td>
                  <td className="num">{fmtPct(p.startRate)}</td>
                  <td className="num">{p.sorareProjection === null ? '—' : Math.round(p.sorareProjection)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function GameWeekPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const competition = one(p.competition);
  const startersOnly = one(p.tous) !== '1';
  const queries = getQueries();
  const [fixtures, competitions] = await Promise.all([queries.getGameWeekFixtures(competition), queries.listCompetitions()]);
  const players = await queries.getGameWeekPlayers(fixtures.map((f) => f.id), { competition, startersOnly, limit: PER_POSITION });

  return (
    <main>
      <h1>Ma Game Week</h1>
      <p className="subtitle">{fixtures.length ? roundLabel(fixtures) : 'Aucun match programmé'}</p>
      <form className="filters" method="get">
        <select name="competition" defaultValue={competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" name="tous" value="1" defaultChecked={!startersOnly} /> Inclure les remplaçants
        </label>
        <button type="submit">Filtrer</button>
      </form>
      <p className="note">
        Meilleurs scores potentiels de la prochaine journée, poste par poste. Blessés et suspendus exclus
        {startersOnly && ', ainsi que les joueurs titulaires moins de 3 fois sur leurs 5 derniers matchs'}.{' '}
        <Link href={competition ? `/journee?competition=${competition}` : '/journee'}>Voir les adversaires poste par poste →</Link>
      </p>
      {fixtures.length > 0 && SECTIONS.map(([pos, title]) => (
        <PlayersTable key={pos} title={title} players={players.filter((x) => x.position === pos)} />
      ))}
    </main>
  );
}
