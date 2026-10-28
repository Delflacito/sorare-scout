import Link from 'next/link';
import { getQueries, type RoundMatchup } from '@/db/queries';
import { POSITION_LABEL_FR, type DetailedPosition } from '@/domain/types';
import { ClubLogo } from '@/components/Media';
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

export default async function JourneePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const competition = one(p.competition);
  const sort = oneOf(one(p.tri), COLUMNS);
  const queries = getQueries();
  const [fixtures, competitions] = await Promise.all([queries.getGameWeekFixtures(competition), queries.listCompetitions()]);
  const rows = sortMatchups(await queries.getRoundMatchups(fixtures.map((f) => f.id)), sort);
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
        <button type="submit">Filtrer</button>
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
                  <th className={sort ? '' : 'sorted'}><Link href={href()}>Note adv.</Link></th>
                  {COLUMNS.map((c) => (
                    <th key={c} className={sort === c ? 'sorted' : ''}><Link href={href(c)}>{POSITION_LABEL_FR[c]}</Link></th>
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
                        <span className="muted">{r.isHome ? 'vs' : '@'}</span>
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
    </main>
  );
}
