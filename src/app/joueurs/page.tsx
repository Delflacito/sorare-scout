import { CardStatusIcon } from '@/components/ClassicHint';
import Link from 'next/link';
import { getQueries, PAGE_SIZE, SORTS, type PlayerListRow, type Sort } from '@/db/queries';
import { DETAILED_POSITIONS, GENERIC_LABEL_FR, POSITION_LABEL_FR, cardLabel, type GenericPosition } from '@/domain/types';
import { fmtEur, fmtPct, fmtScore, indexClass } from '@/lib/format';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { ScorePill } from '@/components/ScorePill';
import { StatusBadges } from '@/components/StatusBadges';
import { NotOwnedToggle, OwnedMark } from '@/components/MyCards';
import { PSEUDO } from '@/lib/squad';
import { OtwButton } from '@/components/Otw';
import { Venue } from '@/components/Venue';
import { START_RATE_LEVELS, one, oneOf, startRateLabel, startRateParam, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const GENERIC = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];
const SORT_LABEL: Record<Sort, string> = {
  projected: 'Score potentiel', nextIndex: 'Adversaire le plus facile', l5: 'L5', l10: 'L10', l40: 'L40', startRate: '% titu',
};

/** Facilité du prochain adversaire à ce poste : points qu'il concède par rapport à la moyenne de la ligue. */
function Opponent({ r }: { r: PlayerListRow }) {
  if (r.nextIndex === null) return null;
  const pct = Math.round((r.nextIndex - 1) * 100);
  const cls = indexClass(r.nextIndex);
  const label = cls === 'hot' ? 'favorable' : cls === 'cold' ? 'difficile' : 'moyen';
  return (
    <span className={`opp-badge ${cls} ${r.nextLowSample ? 'low-sample' : ''}`}
      title={`Il concède ${pct >= 0 ? '+' : '−'}${Math.abs(pct)} % de points à ce poste par rapport à la moyenne de la ligue${r.nextLowSample ? ' (moins de 3 matchs observés)' : ''}`}>
      <span className="opp-word">Adversaire </span>{label} <span className="opp-pct">{pct >= 0 ? '+' : '−'}{Math.abs(pct)} %</span>
    </span>
  );
}

function PlayerRow({ r }: { r: PlayerListRow }) {
  return (
    <li className="gw-row no-rank">
      <OtwButton slug={r.slug} name={r.name} />
      <PlayerAvatar name={r.name} url={r.pictureUrl} size={40} />
      <div className="gw-who">
        <div className="gw-name">
          <OwnedMark slug={r.slug} />
          <Link href={`/joueurs/${r.slug}`}>{r.name}</Link>
          <StatusBadges compact playingStatus={r.playingStatus}
            injury={r.injuryKind ? { kind: r.injuryKind, end: null } : null}
            suspension={r.suspensionReason ? { reason: r.suspensionReason, end: null } : null} />
          <CardStatusIcon status={r.cardStatus} />
        </div>
        <div className="gw-match">
          {r.team && <ClubLogo name={r.team} url={r.teamPictureUrl} size={16} />}
          <span className="gw-opp">{r.team ?? '—'}</span>
          <span className="muted">· {cardLabel(r.cardPositions)}{r.usualPosition && ` · ${POSITION_LABEL_FR[r.usualPosition]}`}</span>
        </div>
        <div className="gw-match next-line">
          {r.nextOpponent ? (
            <>
              <span className="muted next-label">Prochain :</span>
              {r.nextIsHome !== null && <Venue isHome={r.nextIsHome} />}
              <span className="gw-opp">{r.nextOpponent}</span>
              <Opponent r={r} />
            </>
          ) : <span className="muted">Pas de match programmé</span>}
        </div>
        <div className="gw-meta">
          <span><abbr title="Moyenne des 5 derniers matchs">L5</abbr> {fmtScore(r.l5)}</span>
          <span><abbr title="Moyenne des 10 derniers matchs joués (saisons précédentes comprises)">L10</abbr> {r.l10 === null ? '—' : fmtScore(r.l10)}</span>
          <span className="gw-meta-pos"><abbr title="Moyenne des 40 dernières notes (matchs joués)">L40</abbr> {fmtScore(r.l40)}</span>
          <span><abbr title="Part des matchs commencés comme titulaire">Titu</abbr> {fmtPct(r.startRate)}</span>
          <span title="Carte de la saison la moins chère en vente">Plancher {r.floorInSeason === null ? '—' : fmtEur(r.floorInSeason)}</span>
          <span title="Dernière vente d’une carte de la saison">Dernier achat {r.lastSale === null ? '—' : fmtEur(r.lastSale)}</span>
        </div>
      </div>
      <div className="gw-score">
        <ScorePill score={r.nextProjected} precise title="Score potentiel au prochain match" />
        {r.sorareProjection !== null && <span className="gw-boost" title="Projection officielle de Sorare">Sorare {Math.round(r.sorareProjection)}</span>}
      </div>
    </li>
  );
}

export default async function JoueursPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const sansRaw = one(p.sans)?.toLowerCase();
  const sans = sansRaw && PSEUDO.test(sansRaw) ? sansRaw : undefined;
  const pageNum = Math.max(1, Number(one(p.page)) || 1);
  const filters = {
    q: one(p.q),
    position: oneOf(one(p.position), GENERIC),
    competition: one(p.competition),
    team: one(p.team),
    detailedPosition: oneOf(one(p.detailedPosition), DETAILED_POSITIONS),
    available: one(p.dispo) === '1' || undefined,
    minStartRate: startRateParam(one(p.titu), 0) / 100 || undefined,
    sort: oneOf(one(p.sort), SORTS) ?? 'projected',
    offset: (pageNum - 1) * PAGE_SIZE,
    sans,
  };
  const queries = getQueries();
  const squad = sans ? await queries.getSquad(sans) : null;
  const excludeSlugs = squad ? squad.filter((e) => e.status === 'owned').map((e) => e.slug) : undefined;
  const [rows, competitions, teams] = await Promise.all([queries.searchPlayers(excludeSlugs ? { ...filters, excludeSlugs } : filters), queries.listCompetitions(), queries.listTeams()]);
  // Lien qui garde les filtres en cours et en change certains (retour en page 1 sauf demande).
  const href = (o: Partial<Omit<typeof filters, 'offset'>> & { page?: number } = {}) => {
    const { available, minStartRate, offset: _, ...rest } = { ...filters, page: undefined, ...o };
    const qs = new URLSearchParams(Object.entries({
      ...rest, sort: rest.sort === 'projected' ? undefined : rest.sort, dispo: available ? '1' : undefined,
      titu: minStartRate ? String(Math.round(minStartRate * 100)) : undefined, page: rest.page && rest.page > 1 ? String(rest.page) : undefined,
    }).filter(([, v]) => v) as [string, string][]);
    return `/joueurs${qs.size ? `?${qs}` : ''}`;
  };
  const activeFilters = [filters.sans, filters.q, filters.position, filters.competition, filters.team, filters.detailedPosition, filters.available, filters.minStartRate].filter(Boolean).length;
  const advanced = [filters.team, filters.detailedPosition, filters.available].filter(Boolean).length;

  return (
    <main className="gw">
      <h1>Joueurs</h1>
      <div className="gw-toolbar">
        <form method="get" className="player-search" role="search">
          <div className="search-line">
            <input name="q" type="search" placeholder="Nom du joueur" defaultValue={filters.q} aria-label="Nom du joueur" />
            <button type="submit">Rechercher</button>
          </div>
          {filters.competition && <input type="hidden" name="competition" value={filters.competition} />}
          {filters.position && <input type="hidden" name="position" value={filters.position} />}
          {filters.sort !== 'projected' && <input type="hidden" name="sort" value={filters.sort} />}
          {filters.sans && <input type="hidden" name="sans" value={filters.sans} />}
          {filters.minStartRate && <input type="hidden" name="titu" value={Math.round(filters.minStartRate * 100)} />}
          <details className="more-filters" open={advanced > 0}>
            <summary>Plus de filtres{advanced > 0 && ` (${advanced})`}</summary>
            <div className="filters">
              <select name="team" defaultValue={filters.team ?? ''} aria-label="Club">
                <option value="">Tous les clubs</option>
                {teams.filter((t) => !filters.competition || t.competitionSlug === filters.competition)
                  .map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <select name="detailedPosition" defaultValue={filters.detailedPosition ?? ''} aria-label="Poste précis">
                <option value="">Tous les postes sur le terrain</option>
                {DETAILED_POSITIONS.map((d) => <option key={d} value={d}>{POSITION_LABEL_FR[d]}</option>)}
              </select>
              <label className="check">
                <input type="checkbox" name="dispo" value="1" defaultChecked={filters.available} /> Masquer blessés et suspendus
              </label>
            </div>
          </details>
          {activeFilters > 0 && <Link href="/joueurs" className="reset">Effacer les filtres ({activeFilters})</Link>}
        </form>

        <nav className="chip-row" aria-label="Championnat">
          <Link href={href({ competition: undefined, team: undefined })} aria-current={filters.competition ? undefined : 'page'}>Toutes les ligues</Link>
          {competitions.map((c) => (
            <Link key={c.slug} href={href({ competition: c.slug, team: undefined })} aria-current={filters.competition === c.slug ? 'page' : undefined}>{c.name}</Link>
          ))}
        </nav>
        <nav className="chip-row" aria-label="Poste">
          <Link href={href({ position: undefined })} aria-current={filters.position ? undefined : 'page'}>Tous les postes</Link>
          {GENERIC.map((g) => (
            <Link key={g} href={href({ position: g })} aria-current={filters.position === g ? 'page' : undefined}>{GENERIC_LABEL_FR[g]}</Link>
          ))}
        </nav>
        <nav className="chip-row sort-row" aria-label="Titularisations minimum">
          <span className="muted" title="Part des 5 derniers matchs du club commencés comme titulaire">Titulaire</span>
          {START_RATE_LEVELS.map((n) => (
            <Link key={n} href={href({ minStartRate: n / 100 || undefined })}
              aria-current={Math.round((filters.minStartRate ?? 0) * 100) === n ? 'page' : undefined}>{startRateLabel(n)}</Link>
          ))}
        </nav>
        <div className="chip-row"><NotOwnedToggle href={href({ sans: undefined })} active={!!filters.sans} /></div>
        <nav className="chip-row sort-row" aria-label="Trier par">
          <span className="muted">Trier par</span>
          {SORTS.map((s) => (
            <Link key={s} href={href({ sort: s })} aria-current={filters.sort === s ? 'page' : undefined}>{SORT_LABEL[s]}</Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>Aucun joueur ne correspond à ces filtres</p>
          <p className="small">Élargis la recherche (ligue, club ou poste) ou <Link href="/joueurs">efface tous les filtres</Link>.</p>
        </div>
      ) : (
        <section className="card gw-section">
          <ol className="gw-list" aria-label="Joueurs">{rows.map((r) => <PlayerRow key={r.slug} r={r} />)}</ol>
        </section>
      )}
      <nav className="pager" aria-label="Pagination">
        {pageNum > 1 && <Link href={href({ page: pageNum - 1 })}>← Précédent</Link>}
        {(pageNum > 1 || rows.length === PAGE_SIZE) && <span className="muted">Page {pageNum}</span>}
        {rows.length === PAGE_SIZE && <Link href={href({ page: pageNum + 1 })}>Suivant →</Link>}
      </nav>
    </main>
  );
}
