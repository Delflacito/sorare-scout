import Link from 'next/link';
import { getQueries, PAGE_SIZE, SORTS } from '@/db/queries';
import { DETAILED_POSITIONS, GENERIC_LABEL_FR, POSITION_LABEL_FR, cardLabel, type GenericPosition } from '@/domain/types';
import { fmtIndex, fmtPct, fmtScore, indexClass } from '@/lib/format';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { StatusBadges } from '@/components/StatusBadges';
import { Venue } from '@/components/Venue';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const GENERIC = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];
const SORT_LABEL = { projected: 'score potentiel', l5: 'L5', l15: 'L15', l40: 'L40', startRate: '% titu', nextIndex: 'Indice adversaire' } as const;

export default async function JoueursPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const pageNum = Math.max(1, Number(one(p.page)) || 1);
  const filters = {
    q: one(p.q),
    position: oneOf(one(p.position), GENERIC),
    competition: one(p.competition),
    team: one(p.team),
    detailedPosition: oneOf(one(p.detailedPosition), DETAILED_POSITIONS),
    available: one(p.dispo) === '1' || undefined,
    sort: oneOf(one(p.sort), SORTS) ?? 'projected',
    offset: (pageNum - 1) * PAGE_SIZE,
  };
  const queries = getQueries();
  const [rows, competitions, teams] = await Promise.all([queries.searchPlayers(filters), queries.listCompetitions(), queries.listTeams()]);
  const pageHref = (n: number) => {
    const { available, offset: _, ...rest } = filters;
    const qs = new URLSearchParams(Object.entries({ ...rest, dispo: available ? '1' : undefined, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `/joueurs?${qs}`;
  };
  const activeFilters = [filters.q, filters.position, filters.competition, filters.team, filters.detailedPosition, filters.available].filter(Boolean).length;

  return (
    <main>
      <h1>Joueurs</h1>
      <form className="filters" method="get">
        <input name="q" type="search" placeholder="Nom du joueur" defaultValue={filters.q} aria-label="Nom du joueur" />
        <select name="competition" defaultValue={filters.competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select name="team" defaultValue={filters.team ?? ''} aria-label="Club">
          <option value="">Tous les clubs</option>
          {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
        <select name="position" defaultValue={filters.position ?? ''} aria-label="Poste">
          <option value="">Tous les postes (carte)</option>
          {GENERIC.map((g) => <option key={g} value={g}>{GENERIC_LABEL_FR[g]}</option>)}
        </select>
        <select name="detailedPosition" defaultValue={filters.detailedPosition ?? ''} aria-label="Poste précis">
          <option value="">Tous les postes sur le terrain</option>
          {DETAILED_POSITIONS.map((d) => <option key={d} value={d}>{POSITION_LABEL_FR[d]}</option>)}
        </select>
        <select name="sort" defaultValue={filters.sort} aria-label="Tri">
          {SORTS.map((s) => <option key={s} value={s}>Trier par {SORT_LABEL[s]}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" name="dispo" value="1" defaultChecked={filters.available} /> Masquer blessés et suspendus
        </label>
        <button type="submit">Appliquer</button>
        {activeFilters > 0 && <Link href="/joueurs" className="reset">Effacer les filtres ({activeFilters})</Link>}
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          <p>Aucun joueur ne correspond à ces filtres</p>
          <p className="small">Élargis la recherche (ligue, club ou poste) ou <Link href="/joueurs">efface tous les filtres</Link>.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Joueur</th><th scope="col">Club</th><th scope="col">Poste</th>
                <th scope="col"><abbr title="Moyenne des 5 derniers matchs">L5</abbr></th>
                <th scope="col"><abbr title="Moyenne des 15 derniers matchs">L15</abbr></th>
                <th scope="col"><abbr title="Moyenne des 40 derniers matchs">L40</abbr></th>
                <th scope="col"><abbr title="Part des matchs commencés comme titulaire">% titu</abbr></th>
                <th scope="col">Prochain match</th>
                <th scope="col"><abbr title="Score attendu au prochain match, selon l’adversaire">Potentiel</abbr></th>
                <th scope="col"><abbr title="Points concédés par l’adversaire à ce poste, par rapport à la moyenne de la ligue (vert = favorable)">Indice adv.</abbr></th>
                <th scope="col"><abbr title="Projection officielle de Sorare pour le prochain match">Proj. Sorare</abbr></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <span className="player-cell">
                      <PlayerAvatar name={r.name} url={r.pictureUrl} size={32} />
                      <Link href={`/joueurs/${r.slug}`}>{r.name}</Link>
                      <StatusBadges compact playingStatus={r.playingStatus}
                        injury={r.injuryKind ? { kind: r.injuryKind, end: null } : null}
                        suspension={r.suspensionReason ? { reason: r.suspensionReason, end: null } : null} />
                    </span>
                  </td>
                  <td><span className="club-link"><ClubLogo name={r.team ?? ''} url={r.teamPictureUrl} />{r.team ?? '—'}</span></td>
                  <td>
                    {cardLabel(r.cardPositions)}
                    {r.usualPosition && <span className="muted small" title="Poste occupé sur le terrain"> · {POSITION_LABEL_FR[r.usualPosition]}</span>}
                  </td>
                  <td className="num">{fmtScore(r.l5)}</td>
                  <td className="num">{fmtScore(r.l15)}</td>
                  <td className="num">{fmtScore(r.l40)}</td>
                  <td className="num">{fmtPct(r.startRate)}</td>
                  <td>
                    {r.nextOpponent && r.nextOpponentSlug ? (
                      <span className="club-link">{r.nextIsHome !== null && <Venue isHome={r.nextIsHome} />}<Link href={`/equipes/${r.nextOpponentSlug}`}>{r.nextOpponent}</Link></span>
                    ) : '—'}
                  </td>
                  <td className="num strong">{r.nextProjected === null ? '—' : fmtScore(r.nextProjected)}</td>
                  <td className={`num ${indexClass(r.nextIndex)} ${r.nextLowSample ? 'low-sample' : ''}`}>
                    {r.nextIndex === null ? '—' : fmtIndex(r.nextIndex)}
                  </td>
                  <td className="num">{r.sorareProjection === null ? '—' : Math.round(r.sorareProjection)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pager" aria-label="Pagination">
        {pageNum > 1 && <Link href={pageHref(pageNum - 1)}>← Précédent</Link>}
        {(pageNum > 1 || rows.length === PAGE_SIZE) && <span className="muted">Page {pageNum}</span>}
        {rows.length === PAGE_SIZE && <Link href={pageHref(pageNum + 1)}>Suivant →</Link>}
      </nav>
    </main>
  );
}
