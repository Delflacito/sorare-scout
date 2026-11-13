import Link from 'next/link';
import { getQueries, type PlayerSplitRow } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR, type GenericPosition } from '@/domain/types';
import { MIN_GAMES, contextLabel, fmtDecisive, nextCell, tierCode, type SplitCell } from '@/domain/splits';
import { NoteTags, legend } from '@/components/Splits';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { fmtScore } from '@/lib/format';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const GENERIC = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];

function Avg({ c, gk }: { c: SplitCell | null; gk: boolean }) {
  return (
    <td className={`num ${!c || c.games < MIN_GAMES ? 'muted' : ''}`} title={c ? `AA ${fmtScore(c.allAround)} · ${fmtDecisive(gk, c.decisive)}` : undefined}>
      {c ? <>{Math.round(c.score)} <small>({c.games})</small></> : '—'}
    </td>
  );
}

/** Un tableau par taille de championnat : les colonnes suivent ses tranches (3 tiers ou 4 quarts). */
function SplitsTable({ rows }: { rows: PlayerSplitRow[] }) {
  const { tiers } = rows[0].splits;
  return (
    <div className="table-wrap">
      <table aria-label="Profils lieu × adversaire">
        <thead>
          <tr>
            <th>Joueur</th><th>Poste</th><th title="Moyenne en championnat (matchs joués)">Moy.</th>
            {(['Dom.', 'Ext.'] as const).flatMap((v) => tiers.map((t, i) => (
              <th key={`${v}${i}`} title={`${v === 'Dom.' ? 'Domicile' : 'Extérieur'} contre les clubs classés ${t.from} à ${t.to}`}>
                {v === 'Dom.' ? 'D' : 'E'}·{tierCode(tiers, i)} <small>{t.from}-{t.to}</small>
              </th>
            )))}
            <th title="Lieu et tranche de l'adversaire du prochain match ; moyenne du joueur dans ce contexte">Prochain</th>
            <th title={legend(rows[0].splits)}>Traits marquants</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.splits;
            const c = nextCell(s);
            return (
              <tr key={r.slug}>
                <td>
                  <span className="cell-player">
                    <PlayerAvatar name={r.name} url={r.pictureUrl} size={28} />
                    <Link href={`/joueurs/${r.slug}`}>{r.name}</Link>
                    {r.team && <ClubLogo name={r.team} url={r.teamPictureUrl} size={16} />}
                  </span>
                </td>
                <td>{r.usualPosition ? POSITION_LABEL_FR[r.usualPosition] : GENERIC_LABEL_FR[r.position]}</td>
                <td className="num">{Math.round(s.overall.score)} <small>({s.overall.games})</small></td>
                {s.tiers.map((_, i) => <Avg gk={s.goalkeeper} key={`h${i}`} c={s.cells[i].home} />)}
                {s.tiers.map((_, i) => <Avg gk={s.goalkeeper} key={`a${i}`} c={s.cells[i].away} />)}
                <td className="profils-ctx">{c ? <>{Math.round(c.score)} <small>({c.games}) {contextLabel(s)}</small></> : contextLabel(s) ?? '—'}</td>
                <td>
                  {s.notes.length ? (
                    <NoteTags s={s} />
                  ) : <span className="muted">Régulier</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProfilsPage({ searchParams }: { searchParams?: SearchParams }) {
  const p = (await searchParams) ?? {};
  const queries = getQueries();
  const competitions = await queries.listCompetitions();
  const competition = one(p.competition) ?? competitions[0]?.slug;
  const position = oneOf(one(p.position), GENERIC);
  const favorable = one(p.favorables) === '1';
  const href = (o: { competition?: string; position?: GenericPosition | null; favorable?: boolean }) => {
    const qs = new URLSearchParams(Object.entries({
      competition: o.competition ?? competition,
      position: o.position === null ? undefined : o.position ?? position,
      favorables: (o.favorable ?? favorable) ? '1' : undefined,
    }).filter(([, v]) => v) as [string, string][]);
    return `/profils${qs.size ? `?${qs}` : ''}`;
  };
  const all = competition ? await queries.getSplits({ competition, position }) : [];
  const rows = all
    .filter((r) => r.splits.overall.games >= MIN_GAMES)
    .filter((r) => !favorable || (r.splits.notes.some((n) => n.next === 'good') && !r.splits.notes.some((n) => n.next === 'bad')))
    .sort((a, b) => b.splits.overall.score - a.splits.overall.score);
  const bySize = [...new Set(rows.map((r) => r.splits.teams))].sort((a, b) => b - a);

  return (
    <main className="gw">
      <h1>Profils</h1>
      <p className="subtitle">
        Moyenne de chaque joueur à domicile et à l’extérieur selon le niveau de l’adversaire (classement actuel), sur les matchs de championnat
        de la saison. Entre parenthèses : nombre de matchs ; grisé sous {MIN_GAMES} matchs. Survole une case pour l’AA et le décisif.
      </p>
      <div className="gw-toolbar">
        <nav className="chip-row" aria-label="Championnat">
          {competitions.map((c) => (
            <Link key={c.slug} href={href({ competition: c.slug })} aria-current={competition === c.slug ? 'page' : undefined}>{c.name}</Link>
          ))}
        </nav>
        <nav className="chip-row" aria-label="Poste">
          <Link href={href({ position: null })} aria-current={position ? undefined : 'page'}>Tous les postes</Link>
          {GENERIC.map((g) => (
            <Link key={g} href={href({ position: g })} aria-current={position === g ? 'page' : undefined}>{GENERIC_LABEL_FR[g]}</Link>
          ))}
        </nav>
        <nav className="chip-row" aria-label="Prochain match">
          <Link href={href({ favorable: false })} aria-current={favorable ? undefined : 'page'}>Tous les profils</Link>
          <Link href={href({ favorable: true })} aria-current={favorable ? 'page' : undefined}>Favorables au prochain match</Link>
        </nav>
      </div>
      {rows.length === 0
        ? <p className="empty">Aucun joueur avec au moins {MIN_GAMES} matchs de championnat pour ces filtres</p>
        : bySize.map((n) => <SplitsTable key={n} rows={rows.filter((r) => r.splits.teams === n)} />)}
    </main>
  );
}
