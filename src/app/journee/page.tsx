import Link from 'next/link';
import { getQueries, type ClubSchedule, type RoundMatchup } from '@/db/queries';
import { POSITION_LABEL_FR, type DetailedPosition } from '@/domain/types';
import { ClubLogo } from '@/components/Media';
import { Venue } from '@/components/Venue';
import { fmtDate, indexClass, ratingClass, roundLabel } from '@/lib/format';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

/** Postes affichés, de la défense à l'attaque (les pistons, rares, sont omis). */
const COLUMNS: DetailedPosition[] = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

/** Tri : par poste (adversaire qui concède le plus en premier) ou par note de l'adversaire (le plus faible en premier). */
function sortMatchups(rows: RoundMatchup[], by: DetailedPosition | undefined): RoundMatchup[] {
  if (!by) return [...rows].sort((a, b) => (a.opponentRating ?? 50) - (b.opponentRating ?? 50));
  return [...rows].sort((a, b) => (b.byPosition[by]?.average ?? -1) - (a.byPosition[by]?.average ?? -1));
}

const SCHEDULE_GAMES = 3;
/** Note moyenne des prochains adversaires (absente : 50, la moyenne) ; les calendriers les plus faciles d'abord. */
const ease = (c: ClubSchedule) => c.games.reduce((t, g) => t + (g.opponentRating ?? 50), 0) / (c.games.length || 1);

function Schedule({ clubs }: { clubs: ClubSchedule[] }) {
  const sorted = [...clubs].sort((a, b) => ease(a) - ease(b));
  return (
    <section aria-labelledby="calendrier">
      <h2 id="calendrier">Calendrier des {SCHEDULE_GAMES} prochaines journées</h2>
      <p className="note">
        Note défensive de chaque adversaire (100 = le plus solide). Vert = adversaire faible (≤ 33), rouge = solide (≥ 67).
        Les clubs au calendrier le plus facile en premier : bons candidats pour un achat.
      </p>
      <div className="table-wrap">
        <table className="matrix schedule" aria-label="Calendrier des prochaines journées">
          <thead><tr><th>Club</th><th>Moy.</th>{Array.from({ length: SCHEDULE_GAMES }, (_, i) => <th key={i}>Match {i + 1}</th>)}</tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.slug}>
                <td><Link href={`/equipes/${c.slug}`} className="club-link"><ClubLogo name={c.name} url={c.pictureUrl} />{c.name}</Link></td>
                <td className={`num ${ratingClass(Math.round(ease(c)))}`}>{Math.round(ease(c))}</td>
                {Array.from({ length: SCHEDULE_GAMES }, (_, i) => {
                  const g = c.games[i];
                  return (
                    <td key={i} className={`cell ${g ? ratingClass(g.opponentRating) : ''}`}>
                      {g ? <><span className="sched-opp">{g.isHome ? '' : '@ '}{g.opponent}</span><span className="muted small">{fmtDate(g.date)} · {g.opponentRating ?? '—'}</span></> : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function JourneePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const competition = one(p.competition);
  const sort = oneOf(one(p.tri), COLUMNS);
  const queries = getQueries();
  const [fixtures, competitions] = await Promise.all([queries.getGameWeekFixtures(competition), queries.listCompetitions()]);
  const [matchups, schedule] = await Promise.all([
    queries.getRoundMatchups(fixtures.map((f) => f.id)), competition ? queries.getSchedule(competition, SCHEDULE_GAMES) : [],
  ]);
  const rows = sortMatchups(matchups, sort);
  const href = (tri?: DetailedPosition) => {
    const qs = new URLSearchParams(Object.entries({ competition, tri }).filter(([, v]) => v) as [string, string][]);
    return `/journee${qs.size ? `?${qs}` : ''}`;
  };

  return (
    <main>
      <h1>Prochaine journée</h1>
      <p className="subtitle">{fixtures.length ? roundLabel(fixtures) : 'Aucun match programmé'}</p>
      <form className="filters" method="get">
        <select name="competition" defaultValue={competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {sort && <input type="hidden" name="tri" value={sort} />}
        <button type="submit">Appliquer</button>
      </form>
      {rows.length > 0 && (
        <>
          <p className="note">
            Pour chaque équipe : points Sorare concédés en moyenne par son adversaire à chaque poste (5 derniers matchs).
            Vert = adversaire plus généreux que la moyenne de la ligue (au moins +10 %), rouge = plus avare. Valeurs pâles : moins de 3 matchs observés.
            Cliquer sur un poste trie les équipes par adversaire le plus généreux à ce poste.
          </p>
          <div className="table-wrap">
            <table className="matrix" aria-label="Adversaires par poste">
              <thead>
                <tr>
                  <th>Équipe</th><th>Adversaire</th>
                  <th className={sort ? '' : 'sorted'} aria-sort={sort ? undefined : 'ascending'}><Link href={href()} title="Trier par note de l’adversaire (le plus faible en premier)">Note adv.</Link></th>
                  {COLUMNS.map((c) => (
                    <th key={c} className={sort === c ? 'sorted' : ''} aria-sort={sort === c ? 'descending' : undefined}><Link href={href(c)} title={`Trier par points concédés au poste ${POSITION_LABEL_FR[c]}`}>{POSITION_LABEL_FR[c]}</Link></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.fixtureId}-${r.teamSlug}`}>
                    <td>
                      <Link href={`/equipes/${r.teamSlug}`} className="club-link"><ClubLogo name={r.team} url={r.teamPictureUrl} />{r.team}</Link>
                    </td>
                    <td>
                      <span className="club-link">
                        <Venue isHome={r.isHome} />
                        <ClubLogo name={r.opponent} url={r.opponentPictureUrl} />{r.opponent}
                      </span>
                      <div className="muted small">{fmtDate(r.date)}</div>
                    </td>
                    <td className={`num ${ratingClass(r.opponentRating)}`}>{r.opponentRating === null ? '—' : `${r.opponentRating}/100`}</td>
                    {COLUMNS.map((c) => {
                      const v = r.byPosition[c];
                      return (
                        <td key={c} className={`cell ${v ? indexClass(v.index) : ''} ${v && v.observations < 3 ? 'low-sample' : ''}`}
                          title={v ? `${v.observations} observation(s)` : undefined}>
                          {v?.average == null ? '—' : Math.round(v.average)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {competition ? (schedule.length > 0 && <Schedule clubs={schedule} />)
        : <p className="note">Choisis un championnat pour voir le calendrier de ses clubs sur les {SCHEDULE_GAMES} prochaines journées.</p>}
    </main>
  );
}
