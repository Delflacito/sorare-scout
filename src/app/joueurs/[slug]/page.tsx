import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries, type PlayerDetail, type PlayerGameView, type UpcomingView } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR, POSITION_NAME_FR, cardLabel } from '@/domain/types';
import { projectForFixture } from '@/domain/projection';
import { ScoreChart } from '@/components/ScoreChart';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { StatusBadges } from '@/components/StatusBadges';
import { Venue } from '@/components/Venue';
import { ScorePill } from '@/components/ScorePill';
import { regularity } from '@/domain/metrics';
import { MiniPitch } from '@/components/MiniPitch';
import { MarketCard } from '@/components/MarketCard';
import { SalesChart } from '@/components/SalesChart';
import { seasonStart } from '@/ingest/leagues';
import { ageAt, fmtDate, fmtPct, fmtScore, indexClass, ratingClass, scoreTier, teamCode } from '@/lib/format';
import { actionItems, describeActions } from '@/domain/actions';
import { OtwButton } from '@/components/Otw';
import { SplitsCard } from '@/components/Splits';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { started: 'titulaire', sub: 'remplaçant', absent: 'absent' } as const;
const TABS = [['apercu', 'Aperçu'], ['matchs', 'Matchs'], ['statistiques', 'Statistiques'], ['marche', 'Marché']] as const;
type Tab = (typeof TABS)[number][0];
/** Matchs de la saison chargés pour le graphique (filtrable) et la liste. */
const SEASON_GAMES = 80;

const fmtBirth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShortDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

const fmtVenue = (factor: number) => {
  const pct = Math.round((factor - 1) * 100);
  return pct > 0 ? `+${pct} %` : pct < 0 ? `−${-pct} %` : '0 %';
};

/** Derniers matchs d'équipe (absences comprises) : moyenne des matchs joués, part de matchs joués, buts et passes. */
function lastN(games: PlayerGameView[], n: number) {
  const recent = games.slice(0, n);
  const played = recent.filter((g) => g.status !== 'absent');
  const sum = (stat: string) => recent.reduce((t, g) => t + (g.actions[stat] ?? 0), 0);
  return {
    games: recent.length, played: played.length,
    playedRate: recent.length ? played.length / recent.length : null,
    goals: sum('goals'), assists: sum('goal_assist'),
  };
}

function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pcard-attr">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Carte d'identité façon Sorare : nom, club, ligue, rôle, nationalité, âge, taille, maillot, terrain et photo. */
function Hero({ player }: { player: PlayerDetail }) {
  const first = player.firstName && player.lastName ? player.firstName : null;
  const last = first ? player.lastName! : player.name;
  return (
    <section className="pcard">
      <div className="pcard-main">
        <h1 className="pcard-name">
          {first && <span className="pcard-first">{first}</span>}{first && ' '}
          <span className="pcard-last">{last}</span>
        </h1>
        <OtwButton slug={player.slug} name={player.name} />
        <div className="pcard-pills">
          {player.teamSlug ? (
            <Link href={`/equipes/${player.teamSlug}`} className="pill-link">
              <ClubLogo name={player.team ?? ''} url={player.teamPictureUrl} size={22} />
              <span>{player.team}</span>
            </Link>
          ) : <span className="pill-link">Sans club suivi</span>}
          {player.competition && <span className="pill-link">{player.competition}</span>}
          <span className="pill-link pill-card" title="Postes où ses cartes Sorare peuvent être alignées">Carte : {cardLabel(player.cardPositions)}</span>
        </div>
        <StatusBadges playingStatus={player.playingStatus} injury={player.injury} suspension={player.suspension} />
        <dl className="pcard-attrs">
          <Attr label="Rôle sur le terrain">{player.usualPosition ? POSITION_NAME_FR[player.usualPosition] : GENERIC_LABEL_FR[player.position]}</Attr>
          {player.country && (
            <Attr label="Nationalité">
              {player.country.flagUrl && <img className="flag" src={player.country.flagUrl} alt="" />} {player.country.name}
            </Attr>
          )}
          {player.birthDate && (
            <Attr label="Âge"><span title={`Né le ${fmtBirth(player.birthDate)}`}>{ageAt(player.birthDate)} <small>ans</small></span></Attr>
          )}
          {player.shirtNumber !== null && <Attr label="Maillot">#{player.shirtNumber}</Attr>}
        </dl>
        {player.birthDate && <p className="pcard-born">Né le {fmtBirth(player.birthDate)}</p>}
      </div>
      <div className="pcard-side">
        <div className="pcard-photo">
          {player.bodyPictureUrl
            ? <img src={player.bodyPictureUrl} alt={player.name} />
            : <PlayerAvatar name={player.name} url={player.pictureUrl} size={120} />}
        </div>
        <MiniPitch positions={player.positions} />
      </div>
    </section>
  );
}

/** Prochain match : score potentiel s'il joue et projection Sorare. */
function NextMatch({ player, upcoming }: { player: PlayerDetail; upcoming: UpcomingView | null }) {
  const next = upcoming?.fixtures[0];
  const projected = next && upcoming ? projectForFixture(upcoming, next).projected : null;
  return (
    <section className="card next-card" data-testid="hero">
      {next ? (
        <>
          <div>
            <div className="card-kicker">Prochain match · {fmtDate(next.date)}</div>
            <div className="next-match">
              <Venue isHome={next.isHome} /> <ClubLogo name={next.opponent} url={next.opponentPictureUrl} size={20} /> {next.opponent}
            </div>
          </div>
          <div className="next-figures">
            <div>
              <div className="card-kicker">Score potentiel s’il joue</div>
              <div className={`next-figure ${projected === null ? '' : scoreTier(projected)}`}>{projected === null ? '—' : fmtScore(projected)}</div>
            </div>
            {player.sorareProjection !== null && (
              <div className="hero-sorare"><span>Projection Sorare</span><strong>{Math.round(player.sorareProjection)}</strong></div>
            )}
          </div>
        </>
      ) : (
        <div className="card-kicker">Aucun match programmé</div>
      )}
    </section>
  );
}

/** Forme : L5 / L15 / L40 et part de matchs joués ; mini-barres des 5 derniers matchs. */
function FormCard({ player, games }: { player: PlayerDetail; games: PlayerGameView[] }) {
  const s = player.summary;
  if (!s) return null;
  const cols: [string, number, number][] = [['L5', s.l5, 5], ['L15', s.l15, 15], ['L40', s.l40, 40]];
  return (
    <section className="card">
      <h2 className="card-title">Forme <span>Score · % joué</span></h2>
      <div className="card-cols">
        {cols.map(([label, value, n]) => {
          const r = lastN(games, n);
          return (
            <div key={label} className="card-col" data-testid={`form-${label}`}>
              <div className="card-col-label">{label}</div>
              <ScorePill score={value} size="lg" />
              <div className="card-col-sub">{r.playedRate === null ? '—' : fmtPct(r.playedRate)}</div>
            </div>
          );
        })}
      </div>
      <div className="card-foot">
        <span className="card-kicker">5 derniers matchs</span>
        <span className="mini-bars" aria-label={`5 derniers matchs : ${games.slice(0, 5).map((g) => (g.status === 'absent' ? 'absent' : Math.round(g.score))).join(', ')}`}>
          {[...games.slice(0, 5)].reverse().map((g) => (
            <i key={g.fixtureId} className={g.status === 'absent' ? 'absent' : scoreTier(g.score)}
              style={{ height: `${g.status === 'absent' ? 3 : Math.max(4, Math.round(g.score / 100 * 22))}px` }} />
          ))}
        </span>
      </div>
    </section>
  );
}

/** Régularité : part des 15 derniers matchs joués au-dessus de 40, 50 et 60 points (ce qui compte pour une streak). */
function RegularityCard({ games }: { games: PlayerGameView[] }) {
  const played = games.filter((g) => g.status !== 'absent').slice(0, 15);
  const r = regularity(played.map((g) => g.score));
  if (!r) return null;
  return (
    <section className="card" aria-label="Régularité">
      <h2 className="card-title">Régularité <span>{played.length} derniers matchs joués</span></h2>
      <div className="card-cols">
        {r.map(({ threshold, rate }) => (
          <div key={threshold} className="card-col">
            <div className="card-col-label">≥ {threshold} pts</div>
            <div className="regularity-value">{fmtPct(rate)}</div>
            <div className="card-col-sub">{Math.round(rate * played.length)}/{played.length}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Performance : buts et passes décisives sur les 5, 15 et 40 derniers matchs. */
function PerformanceCard({ games }: { games: PlayerGameView[] }) {
  if (!games.length) return null;
  return (
    <section className="card">
      <h2 className="card-title">Performance <span>Buts + passes</span></h2>
      <div className="card-cols">
        {([['L5', 5], ['L15', 15], ['L40', 40]] as const).map(([label, n]) => {
          const r = lastN(games, n);
          return (
            <div key={label} className="card-col">
              <div className="card-col-label">{label}</div>
              <div className="perf-box" aria-label={`${label} : ${r.goals} buts, ${r.assists} passes décisives`}>
                <span>⚽ {r.goals}</span>
                <span>🎯 {r.assists}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Temps de jeu et détail du score sur les 5 derniers matchs. */
function PlayingCard({ player }: { player: PlayerDetail }) {
  const s = player.summary;
  if (!s) return null;
  return (
    <section className="card">
      <h2 className="card-title">Temps de jeu <span>5 derniers matchs</span></h2>
      <dl className="card-stats">
        <div><dt>Titularisations</dt><dd>{fmtPct(s.startRate5)}</dd></div>
        <div><dt>Minutes</dt><dd>{Math.round(s.avgMinutes5)}′</dd></div>
        <div><dt>Décisif</dt><dd>{fmtScore(s.decisive5)}</dd></div>
        <div><dt>All-Around</dt><dd>{fmtScore(s.allAround5)}</dd></div>
      </dl>
    </section>
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
            <tr><th>Date</th><th>Match</th><th>Effet lieu</th><th>Score potentiel</th><th>Adv. au poste ({pos})</th><th>Qualité adv.</th></tr>
          </thead>
          <tbody>
            {upcoming.fixtures.map((f) => {
              const { venueFactor, projected } = projectForFixture(upcoming, f);
              const p = f.position;
              return (
                <tr key={f.fixtureId}>
                  <td>{fmtDate(f.date)}</td>
                  <td>
                    <Link href={`/equipes/${f.opponentSlug}`} className="club-link">
                      <Venue isHome={f.isHome} />
                      <ClubLogo name={f.opponent} url={f.opponentPictureUrl} />
                      {f.opponent}
                    </Link>
                  </td>
                  <td className="num">{fmtVenue(venueFactor)}</td>
                  <td className="num strong">{projected === null ? '—' : fmtScore(projected)}</td>
                  {p && p.average !== null ? (
                    <td className={`num ${indexClass(p.leagueAverage ? p.average / p.leagueAverage : null)} ${p.observations < 3 ? 'low-sample' : ''}`}
                      title={`${p.observations} observation(s)`}>
                      <span>{Math.round(p.average)} pts</span>{' '}
                      {p.leagueAverage !== null && <span className="muted">(ligue {Math.round(p.leagueAverage)})</span>}
                    </td>
                  ) : (
                    <td className="num">—</td>
                  )}
                  <td className={`num ${ratingClass(f.overall?.rating ?? null)}`}>
                    {f.overall?.rating == null ? '—' : `${f.overall.rating}/100`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Score potentiel s’il joue = niveau L15 {upcoming.base === null ? '—' : fmtScore(upcoming.base)} (matchs joués)
        × lieu (sa moyenne à domicile / à l’extérieur, ramenée vers l’avantage du championnat s’il a peu de matchs)
        × adversaire (40 % points concédés au poste, 60 % qualité générale ; adversaire moyen = ×1).
        Qualité adverse : note 1–100, 100 = adversaire le plus fort.
        {upcoming.startRate !== null && <> Probabilité d’être titulaire : {fmtPct(upcoming.startRate)} (5 derniers matchs).</>}
      </p>
    </>
  );
}

/** Résultat du match pour l'équipe du joueur : victoire, nul ou défaite. */
const resultOf = (g: PlayerGameView) =>
  g.goalsFor === null || g.goalsAgainst === null ? '' : g.goalsFor > g.goalsAgainst ? 'win' : g.goalsFor < g.goalsAgainst ? 'loss' : 'draw';

function LastGamesTable({ games }: { games: PlayerGameView[] }) {
  if (!games.length) return <p className="empty">Aucun match importé</p>;
  return (
    <div className="table-wrap">
      <table aria-label="Derniers matchs" className="games">
        <thead>
          <tr><th>Date</th><th>Match</th><th>Min.</th><th>Score</th></tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const own = { name: g.team, code: teamCode(g.team, g.teamShortName), logo: g.teamPictureUrl };
            const opp = { name: g.opponent, code: teamCode(g.opponent, g.opponentShortName), logo: g.opponentPictureUrl };
            const [home, away] = g.isHome ? [own, opp] : [opp, own];
            const [hg, ag] = g.isHome ? [g.goalsFor, g.goalsAgainst] : [g.goalsAgainst, g.goalsFor];
            return (
              <tr key={g.fixtureId}>
                <td className="game-date">
                  {fmtShortDate(g.date)}
                  {!g.isLeague && <span className="comp-chip">{g.competition}</span>}
                </td>
                <td>
                  <Link href={`/matchs/${g.fixtureId}`} className="game-line" aria-label={`${home.name} ${hg ?? '–'} – ${ag ?? '–'} ${away.name}`}>
                    <span className="game-team home" title={home.name}>{home.code}<ClubLogo name={home.name} url={home.logo} size={22} /></span>
                    <span className={`result-pill ${resultOf(g)}`}>{hg ?? '–'} – {ag ?? '–'}</span>
                    <span className="game-team" title={away.name}><ClubLogo name={away.name} url={away.logo} size={22} />{away.code}</span>
                  </Link>
                  {actionItems(g.actions).length > 0 && (
                    <div className="actions-cell" title={describeActions(g.actions)}>
                      {actionItems(g.actions).map((a) => (
                        <span key={a.stat} aria-label={`${a.count} ${a.count > 1 ? a.plural : a.singular}`}>{a.icon}{a.count > 1 ? `×${a.count}` : ''} </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {g.status === 'absent'
                    ? <span className="min-pill absent">{STATUS_LABEL.absent}</span>
                    : <span className={`min-pill ${g.status}`} title={`${STATUS_LABEL[g.status]}${g.position ? ` · ${POSITION_LABEL_FR[g.position]}` : ''}`}>{g.minutes}′</span>}
                </td>
                <td className="game-score">
                  {g.status === 'absent' ? null
                    : <ScorePill score={g.score} title={`Décisif ${fmtScore(g.decisive)} · All-Around ${fmtScore(g.allAround)}`} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function JoueurPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: SearchParams }) {
  const { slug } = await params;
  const tab: Tab = oneOf(one((await searchParams)?.onglet), TABS.map((t) => t[0])) ?? 'apercu';
  const queries = getQueries();
  const [player, games, upcoming] = await Promise.all([
    queries.getPlayer(slug), queries.getPlayerGames(slug, SEASON_GAMES), queries.getUpcoming(slug, 5),
  ]);
  if (!player) notFound();
  const sales = tab === 'marche' ? await queries.getPlayerSales(slug) : [];
  const splits = tab === 'apercu' ? (await queries.getSplits({ slugs: [slug] }))[0]?.splits : undefined;
  const season = new Date(seasonStart()).getUTCFullYear();
  const s = player.summary;

  return (
    <main className="player-page">
      <Hero player={player} />

      <nav className="tabs" aria-label="Sections de la fiche">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === 'apercu' ? `/joueurs/${slug}` : `/joueurs/${slug}?onglet=${key}`} aria-current={tab === key ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'apercu' && (
        <>
          <NextMatch player={player} upcoming={upcoming} />
          {s ? (
            <div className="cards">
              <FormCard player={player} games={games} />
              <RegularityCard games={games} />
              <MarketCard market={player.market} season={season} href={`/joueurs/${slug}?onglet=marche`} />
            </div>
          ) : (
            <p className="empty">Pas encore de match importé pour ce joueur</p>
          )}
          <SplitsCard s={splits} />
          <ScoreChart games={games} l15={s?.l15 ?? null} />
        </>
      )}

      {tab === 'matchs' && (
        <>
          <h2>Prochains matchs</h2>
          {upcoming && <UpcomingTable upcoming={upcoming} />}
          <h2>Derniers matchs</h2>
          <LastGamesTable games={games} />
        </>
      )}

      {tab === 'marche' && (
        <>
          <MarketCard market={player.market} season={season} />
          <SalesChart sales={sales} season={season} />
          <p className="note">
            Plancher : carte Limited la moins chère en vente ({String(season % 100).padStart(2, '0')} = saison en cours, C = Classic).
            Valeur estimée : prix moyen payé sur le marché pour un joueur de même niveau (L15), même forme (L5), même temps de jeu,
            même âge, même championnat et même poste ; un prix bien en dessous signale une carte sous-évaluée.
            Prix potentiel : prix attendu si le joueur marque son score potentiel au prochain match (son L5 et son L15 montent ou baissent d’autant).
            Estimations indicatives, le marché ne suit pas toujours.
          </p>
        </>
      )}

      {tab === 'statistiques' && (
        s ? (
          <div className="cards">
            <PlayingCard player={player} />
            <PerformanceCard games={games} />
          </div>
        ) : <p className="empty">Pas encore de match importé pour ce joueur</p>
      )}
    </main>
  );
}
