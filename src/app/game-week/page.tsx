import Link from 'next/link';
import { getQueries, type GameWeekPlayer, type GameWeekSort } from '@/db/queries';
import { CardStatusIcon, ClassicHint } from '@/components/ClassicHint';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR, type GenericPosition } from '@/domain/types';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { ScorePill } from '@/components/ScorePill';
import { StatusBadges } from '@/components/StatusBadges';
import { Venue } from '@/components/Venue';
import { fmtDate, fmtPct, fmtScore, roundLabel } from '@/lib/format';
import { START_RATE_LEVELS, one, startRateLabel, startRateParam, type SearchParams } from '@/lib/params';
import { OtwButton } from '@/components/Otw';
import { MyCardsToggle, OwnedMark } from '@/components/MyCards';
import { STREAK_TIERS, streakTiersOf, type StreakTier } from '@/lib/roi';
import { BIG4, BIG4_NAME, CONTENDER, slugsOf } from '@/lib/competitions';
import { PSEUDO } from '@/lib/squad';
import { SplitHint } from '@/components/Splits';
import type { PlayerSplits } from '@/domain/splits';

type SplitsMap = Map<string, PlayerSplits>;

export const dynamic = 'force-dynamic';

const SECTIONS: [GenericPosition, string][] = [
  ['Goalkeeper', 'Gardiens'], ['Defender', 'Défenseurs'], ['Midfielder', 'Milieux'], ['Forward', 'Attaquants'],
];
const PER_POSITION = 20;

/** Écart entre le score potentiel et le niveau habituel, en points et en %. */
function Boost({ p }: { p: GameWeekPlayer }) {
  const diff = p.projected - p.base;
  const pct = p.base ? Math.round((diff / p.base) * 100) : 0;
  const sign = diff >= 0 ? '+' : '−';
  return (
    <span className={`gw-boost ${pct >= 10 ? 'hot' : pct <= -10 ? 'cold' : ''}`} title="Écart avec le niveau habituel">
      {sign}{fmtScore(Math.abs(diff))} <span className="gw-boost-pct">({sign}{Math.abs(pct)} %)</span>
    </span>
  );
}

function MatchLine({ p }: { p: GameWeekPlayer }) {
  return (
    <span className="gw-match">
      <Venue isHome={p.isHome} />
      <ClubLogo name={p.opponent} url={p.opponentPictureUrl} size={16} />
      <span className="gw-opp">{p.opponent}</span>
    </span>
  );
}

function PlayerRow({ p, rank, splits }: { p: GameWeekPlayer; rank: number; splits: SplitsMap }) {
  return (
    <li className="gw-row">
      <span className="gw-rank" aria-label={`Rang ${rank}`}>{rank}</span>
      <PlayerAvatar name={p.name} url={p.pictureUrl} size={40} />
      <div className="gw-who">
        <div className="gw-name">
          <OtwButton slug={p.slug} name={p.name} />
          <OwnedMark slug={p.slug} />
          <Link href={`/joueurs/${p.slug}`}>{p.name}</Link>
          <ClubLogo name={p.team} url={p.teamPictureUrl} size={16} />
          <SplitHint s={splits.get(p.slug)} />
          <CardStatusIcon status={p.cardStatus} />
          <StatusBadges compact playingStatus={p.playingStatus} injury={null} suspension={null} />
        </div>
        <MatchLine p={p} />
        <div className="gw-meta">
          <span>{fmtDate(p.date)}</span>
          <ClassicHint positions={p.classicPositions} />
          {p.usualPosition && <span className="gw-meta-pos" title="Poste occupé sur le terrain">{POSITION_LABEL_FR[p.usualPosition]}</span>}
          <span><abbr title="Moyenne des 10 derniers matchs joués (saisons précédentes comprises)">L10</abbr> {p.l10 === null ? '—' : fmtScore(p.l10)}</span>
          <span><abbr title="Part des matchs commencés comme titulaire">Titu</abbr> {fmtPct(p.startRate)}</span>
          {p.sorareProjection !== null && <span className="gw-meta-sorare"><abbr title="Projection officielle de Sorare">Sorare</abbr> {Math.round(p.sorareProjection)}</span>}
        </div>
      </div>
      <div className="gw-score">
        <ScorePill score={p.projected} precise title="Score potentiel" />
        <Boost p={p} />
      </div>
    </li>
  );
}

function PositionCard({ title, players, splits }: { title: string; players: GameWeekPlayer[]; splits: SplitsMap }) {
  return (
    <section className="card gw-section" aria-labelledby={`gw-${title}`}>
      <h2 className="card-title" id={`gw-${title}`}>{title}<span>{players.length} joueur{players.length > 1 ? 's' : ''}</span></h2>
      {players.length === 0
        ? <p className="empty">Aucun joueur à ce poste pour ces filtres</p>
        : <ol className="gw-list" aria-label={title}>{players.map((p, i) => <PlayerRow key={p.slug} p={p} rank={i + 1} splits={splits} />)}</ol>}
    </section>
  );
}

/** Équipe de 5 façon Sorare : le premier de chaque poste, plus le meilleur joueur de champ restant en « extra ». */
function lineup(all: GameWeekPlayer[], sort: GameWeekSort): { slot: string; p: GameWeekPlayer }[] {
  const metric = (x: GameWeekPlayer) => (sort === 'boost' ? x.projected - x.base : x.projected);
  const players = [...all].sort((x, y) => metric(y) - metric(x));
  const used = new Set<string>();
  const pick = (pos: GenericPosition) => players.find((x) => x.position === pos && !used.has(x.slug));
  const team: { slot: string; p: GameWeekPlayer }[] = [];
  for (const [pos] of SECTIONS) {
    const p = pick(pos);
    if (p) { used.add(p.slug); team.push({ slot: GENERIC_LABEL_FR[pos], p }); }
  }
  const extra = players.filter((x) => x.position !== 'Goalkeeper' && !used.has(x.slug))[0];
  if (extra) team.push({ slot: 'Extra', p: extra });
  return team;
}

const reward = (t: StreakTier) => (t.eur ? `${t.eur} €` : `${t.essence} essence`);

/** Le total potentiel de l'équipe face au palier de streak visé : atteint (avec la marge) ou ce qu'il manque. */
function TargetLine({ total, tier, full }: { total: number; tier: StreakTier; full: boolean }) {
  const gap = Math.round(total - tier.score);
  return (
    <p className={`gw-target ${gap >= 0 ? 'ok' : 'ko'}`} role="status">
      Palier {tier.score} pts ({reward(tier)}) : {gap >= 0 ? <><strong>atteint</strong>, {gap} pts de marge</> : <><strong>il manque {-gap} pts</strong></>}
      {!full && ' · équipe incomplète'}
    </p>
  );
}

function Lineup({ players, sort, mine, tier }: { players: GameWeekPlayer[]; sort: GameWeekSort; mine: boolean; tier: StreakTier | null }) {
  const team = lineup(players, sort);
  if (!team.length) return null;
  const total = team.reduce((t, x) => t + x.p.projected, 0);
  return (
    <section className="gw-lineup" aria-labelledby="gw-lineup-title">
      <div className="gw-lineup-head">
        <h2 id="gw-lineup-title">{mine ? 'Ta meilleure équipe' : sort === 'boost' ? 'Le 5 des plus gros boosts' : 'Équipe type de la journée'}</h2>
        <span className="gw-total">Total potentiel <strong>{Math.round(total)}</strong></span>
      </div>
      {tier && <TargetLine total={total} tier={tier} full={team.length === 5} />}
      <ul className="gw-lineup-grid">
        {team.map(({ slot, p }) => (
          <li key={p.slug} className="gw-slot">
            <span className="gw-slot-pos">{slot}</span>
            <PlayerAvatar name={p.name} url={p.pictureUrl} size={56} />
            <Link href={`/joueurs/${p.slug}`} className="gw-slot-name">{p.name}</Link>
            <span className="gw-slot-match"><Venue isHome={p.isHome} /> {p.opponent}</span>
            <ScorePill score={p.projected} size="lg" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function GameWeekPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const competition = one(p.competition);
  // Par défaut : titulaires au moins 3 fois sur les 5 derniers matchs.
  const titu = startRateParam(one(p.titu), 60);
  const sort: GameWeekSort = one(p.vue) === 'boost' ? 'boost' : 'projected';
  const cartesRaw = one(p.cartes)?.toLowerCase();
  const cartes = cartesRaw && PSEUDO.test(cartesRaw) ? cartesRaw : undefined;
  const tiers = competition === CONTENDER ? STREAK_TIERS.contender : streakTiersOf(competition);
  const tier = tiers?.find((t) => t.score === Number(one(p.palier))) ?? null;
  const href = (o: { competition?: string; titu?: number; vue?: GameWeekSort; cartes?: string | null; palier?: number | null }) => {
    const next = { competition, titu, vue: sort, cartes, palier: tier?.score, ...o };
    const qs = new URLSearchParams(Object.entries({
      competition: next.competition, titu: next.titu === 60 ? undefined : String(next.titu), vue: next.vue === 'boost' ? 'boost' : undefined,
      palier: next.palier && next.competition === competition ? String(next.palier) : undefined, cartes: next.cartes ?? undefined,
    }).filter(([, v]) => v) as [string, string][]);
    return `/game-week${qs.size ? `?${qs}` : ''}`;
  };
  const queries = getQueries();
  const [competitions, squad] = await Promise.all([queries.listCompetitions(), cartes ? queries.getSquad(cartes) : null]);
  // Journée propre à chaque championnat d'un groupe (Contender, Big 4) : leurs premiers matchs ne tombent pas le même jour.
  const fixtures = competition === CONTENDER || competition === BIG4
    ? (await Promise.all(slugsOf(competition).map((c) => queries.getGameWeekFixtures(c)))).flat().sort((a, b) => a.date.localeCompare(b.date))
    : await queries.getGameWeekFixtures(competition);
  // Mes cartes : seulement les joueurs possédés (toutes leurs lignes, pour composer l'équipe avec ce qu'on a).
  const owned = cartes ? [...new Set((squad ?? []).filter((e) => e.status === 'owned').map((e) => e.slug))] : undefined;
  const players = await queries.getGameWeekPlayers(fixtures.map((f) => f.id),
    { competition, minStartRate: titu / 100, limit: owned ? 50 : PER_POSITION, sort, slugs: owned });
  const splits: SplitsMap = new Map((await queries.getSplits({ slugs: [...new Set(players.map((p) => p.slug))] })).map((r) => [r.slug, r.splits]));

  return (
    <main className="gw">
      <div className="gw-head">
        <div>
          <h1>Ma Game Week</h1>
          <p className="subtitle">{fixtures.length ? roundLabel(fixtures) : 'Aucun match programmé'}</p>
        </div>
        <Link href={competition && competition !== CONTENDER && competition !== BIG4 ? `/journee?competition=${competition}` : '/journee'} className="gw-head-link">Adversaires poste par poste →</Link>
      </div>

      <div className="gw-toolbar">
        <nav className="chip-row" aria-label="Championnat">
          <Link href={href({ competition: undefined })} aria-current={competition ? undefined : 'page'}>Toutes les ligues</Link>
          <Link href={href({ competition: BIG4 })} aria-current={competition === BIG4 ? 'page' : undefined} title="Ligue 1, Bundesliga, LaLiga et Premier League">{BIG4_NAME}</Link>
          {competitions.map((c) => (
            <Link key={c.slug} href={href({ competition: c.slug })} aria-current={competition === c.slug ? 'page' : undefined}>{c.name}</Link>
          ))}
        </nav>
        <div className="gw-controls">
          <MyCardsToggle href={href({ cartes: null })} active={!!cartes} />
          <nav className="segmented" aria-label="Classement">
            <Link href={href({ vue: 'projected' })} aria-current={sort === 'projected' ? 'page' : undefined}>Meilleurs scores</Link>
            <Link href={href({ vue: 'boost' })} aria-current={sort === 'boost' ? 'page' : undefined}>Plus gros boosts</Link>
          </nav>
        </div>
        <nav className="chip-row sort-row" aria-label="Titularisations minimum">
          <span className="muted" title="Part des 5 derniers matchs du club commencés comme titulaire">Titulaire</span>
          {START_RATE_LEVELS.map((n) => (
            <Link key={n} href={href({ titu: n })} aria-current={titu === n ? 'page' : undefined}>{startRateLabel(n)}</Link>
          ))}
        </nav>
        {tiers ? (
          <nav className="chip-row sort-row" aria-label="Palier de streak visé">
            <span className="muted">Palier visé</span>
            <Link href={href({ palier: null })} aria-current={tier ? undefined : 'page'}>Aucun</Link>
            {tiers.map((t) => (
              <Link key={t.score} href={href({ palier: t.score })} aria-current={tier?.score === t.score ? 'page' : undefined}>{t.score} · {reward(t)}</Link>
            ))}
          </nav>
        ) : <p className="muted small">Choisis un championnat pour viser un palier de streak.</p>}
        <details className="gw-help">
          <summary>Comment lire ce classement</summary>
          {sort === 'boost'
            ? 'Matchs qui s’annoncent nettement au-dessus du niveau habituel (score potentiel − niveau habituel). '
            : 'Score potentiel : ce que chaque joueur devrait marquer selon son niveau, l’adversaire et le lieu. '}
          Blessés et suspendus exclus{titu > 0 && `, ainsi que les joueurs titulaires moins de ${titu} % du temps sur les 5 derniers matchs de leur club`}.
          {' '}Sous le score : écart avec le niveau habituel.
        </details>
      </div>

      {fixtures.length > 0 && (
        <>
          {cartes && players.length === 0 && <p className="empty">Aucune de tes cartes ne joue cette journée avec ces filtres (essaie « Titulaire : Tous »).</p>}
          <Lineup players={players} sort={sort} mine={!!cartes} tier={tier} />
          <div className="gw-grid">
            {SECTIONS.map(([pos, title]) => (
              <PositionCard key={pos} title={title} players={players.filter((x) => x.position === pos)} splits={splits} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
