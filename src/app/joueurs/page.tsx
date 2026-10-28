import Link from 'next/link';
import { getQueries, PAGE_SIZE, SORTS } from '@/db/queries';
import { DETAILED_POSITIONS, GENERIC_LABEL_FR, POSITION_LABEL_FR, type GenericPosition } from '@/domain/types';
import { fmtIndex, fmtPct, fmtScore, indexClass } from '@/lib/format';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const GENERIC = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];
const SORT_LABEL = { l5: 'L5', l15: 'L15', l40: 'L40', startRate: '% titu', nextIndex: 'Indice adversaire' } as const;

export default async function JoueursPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const pageNum = Math.max(1, Number(one(p.page)) || 1);
  const filters = {
    q: one(p.q),
    position: oneOf(one(p.position), GENERIC),
    competition: one(p.competition),
    detailedPosition: oneOf(one(p.detailedPosition), DETAILED_POSITIONS),
    sort: oneOf(one(p.sort), SORTS) ?? 'l5',
    offset: (pageNum - 1) * PAGE_SIZE,
  };
  const queries = getQueries();
  const [rows, competitions] = await Promise.all([queries.searchPlayers(filters), queries.listCompetitions()]);
  const pageHref = (n: number) => {
    const qs = new URLSearchParams(Object.entries({ ...filters, offset: undefined, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `/joueurs?${qs}`;
  };

  return (
    <main>
      <h1>Joueurs</h1>
      <form className="filters" method="get">
        <input name="q" placeholder="Nom du joueur" defaultValue={filters.q} aria-label="Nom du joueur" />
        <select name="competition" defaultValue={filters.competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select name="position" defaultValue={filters.position ?? ''} aria-label="Poste">
          <option value="">Tous les postes</option>
          {GENERIC.map((g) => <option key={g} value={g}>{GENERIC_LABEL_FR[g]}</option>)}
        </select>
        <select name="detailedPosition" defaultValue={filters.detailedPosition ?? ''} aria-label="Poste précis">
          <option value="">Tous les postes précis</option>
          {DETAILED_POSITIONS.map((d) => <option key={d} value={d}>{POSITION_LABEL_FR[d]}</option>)}
        </select>
        <select name="sort" defaultValue={filters.sort} aria-label="Tri">
          {SORTS.map((s) => <option key={s} value={s}>Trier par {SORT_LABEL[s]}</option>)}
        </select>
        <button type="submit">Filtrer</button>
      </form>

      {rows.length === 0 ? (
        <p className="empty">Aucun joueur ne correspond à ces filtres</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Joueur</th><th>Club</th><th>Poste</th><th>L5</th><th>L15</th><th>L40</th><th>% titu</th>
                <th>Prochain match</th><th>Indice adv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug}>
                  <td><Link href={`/joueurs/${r.slug}`}>{r.name}</Link></td>
                  <td>{r.team ?? '—'}</td>
                  <td>{r.usualPosition ? POSITION_LABEL_FR[r.usualPosition] : GENERIC_LABEL_FR[r.position]}</td>
                  <td className="num">{fmtScore(r.l5)}</td>
                  <td className="num">{fmtScore(r.l15)}</td>
                  <td className="num">{fmtScore(r.l40)}</td>
                  <td className="num">{fmtPct(r.startRate)}</td>
                  <td>
                    {r.nextOpponent && r.nextOpponentSlug ? (
                      <Link href={`/equipes/${r.nextOpponentSlug}`}>{r.nextIsHome ? 'vs' : '@'} {r.nextOpponent}</Link>
                    ) : '—'}
                  </td>
                  <td className={`num ${indexClass(r.nextIndex)} ${r.nextLowSample ? 'low-sample' : ''}`}>
                    {r.nextIndex === null ? '—' : fmtIndex(r.nextIndex)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pager">
        {pageNum > 1 && <Link href={pageHref(pageNum - 1)}>← Précédent</Link>}
        {rows.length === PAGE_SIZE && <Link href={pageHref(pageNum + 1)}>Suivant →</Link>}
      </nav>
    </main>
  );
}
