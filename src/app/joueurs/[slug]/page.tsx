import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries, type CompetitionTotalsView, type PlayerDetail, type PlayerGameView, type PlayerSeasonView, type UpcomingView } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR } from '@/domain/types';
import { projectForFixture } from '@/domain/projection';
import { ScoreChart } from '@/components/ScoreChart';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { StatusBadges } from '@/components/StatusBadges';
import { ageAt, fmtDate, fmtPct, fmtScore, indexClass, ratingClass } from '@/lib/format';
import { actionItems, describeActions } from '@/domain/actions';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { started: 'titulaire', sub: 'remplaçant', absent: 'absent' } as const;
const TABS = [['apercu', 'Aperçu'], ['matchs', 'Matchs'], ['historique', 'Historique']] as const;
type Tab = (typeof TABS)[number][0];
/** Matchs de la saison chargés pour le graphique (filtrable) et la liste. */
const SEASON_GAMES = 80;

const fmtBirth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const seasonLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

const fmtVenue = (factor: number) => {
  const pct = Math.round((factor - 1) * 100);
  return pct > 0 ? `+${pct} %` : pct < 0 ? `−${-pct} %` : '0 %';
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}

function Hero({ player, upcoming }: { player: PlayerDetail; upcoming: UpcomingView | null }) {
  const next = upcoming?.fixtures[0];
  const projected = next && upcoming ? projectForFixture(upcoming, next).projected : null;
  return (
    <section className="hero-card">
      <div className="hero-id">
        <PlayerAvatar name={player.name} url={player.pictureUrl} size={96} />
        <div>
          <h1>{player.name}</h1>
          <p className="hero-meta">
            {player.teamSlug ? (
              <Link href={`/equipes/${player.teamSlug}`} className="club-link">
                <ClubLogo name={player.team ?? ''} url={player.teamPictureUrl} size={22} />
                {player.team}
              </Link>
            ) : '—'}
            {player.competition && <span className="muted"> · {player.competition}</span>}
            <span className="pos-chip">{player.usualPosition ? POSITION_LABEL_FR[player.usualPosition] : GENERIC_LABEL_FR[player.position]}</span>
          </p>
          {(player.birthDate || player.country) && (
            <p className="hero-born">
              {player.country && (
                <>
                  {player.country.flagUrl && <img className="flag" src={player.country.flagUrl} alt="" />}
                  <span>{player.country.name}</span>
                </>
              )}
              {player.country && player.birthDate && <span aria-hidden="true">·</span>}
              {player.birthDate && <span>{ageAt(player.birthDate)} ans (né le {fmtBirth(player.birthDate)})</span>}
            </p>
          )}
          <StatusBadges playingStatus={player.playingStatus} injury={player.injury} suspension={player.suspension} />
        </div>
      </div>
      <div className="hero-next" data-testid="hero">
        {next ? (
          <>
            <div className="hero-next-label">Prochain match · {fmtDate(next.date)}</div>
            <div className="hero-next-match">
              {next.isHome ? 'vs' : '@'} <ClubLogo name={next.opponent} url={next.opponentPictureUrl} size={18} /> {next.opponent}
            </div>
            <div className="hero-figure">{projected === null ? '—' : fmtScore(projected)}</div>
            <div className="hero-next-label">Score potentiel s’il joue</div>
            {player.sorareProjection !== null && (
              <div className="hero-sorare"><span>Projection Sorare</span><strong>{Math.round(player.sorareProjection)}</strong></div>
            )}
          </>
        ) : (
          <div className="hero-next-label">Aucun match programmé</div>
        )}
      </div>
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
            <tr><th>Date</th><th>Match</th><th>Lieu</th><th>Score potentiel</th><th>Adv. au poste ({pos})</th><th>Qualité adv.</th></tr>
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
                      <span className="muted">{f.isHome ? 'vs' : '@'}</span>
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

function LastGamesTable({ games }: { games: PlayerGameView[] }) {
  if (!games.length) return <p className="empty">Aucun match importé</p>;
  return (
    <div className="table-wrap">
      <table aria-label="Derniers matchs">
        <thead>
          <tr><th>Date</th><th>Match</th><th>Score</th><th>Statut</th><th>Min.</th><th>Poste</th><th>Sorare</th><th>Actions</th><th>Décisif</th><th>All-Around</th></tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.fixtureId}>
              <td>{fmtDate(g.date)}</td>
              <td>
                <Link href={`/matchs/${g.fixtureId}`} className="club-link">
                  <span className="muted">{g.isHome ? 'vs' : '@'}</span>
                  <ClubLogo name={g.opponent} url={g.opponentPictureUrl} />
                  {g.opponent}
                </Link>
                {!g.isLeague && <span className="comp-chip">{g.competition}</span>}
              </td>
              <td className="num">{g.goalsFor ?? '–'} – {g.goalsAgainst ?? '–'}</td>
              <td>{STATUS_LABEL[g.status]}</td>
              <td className="num">{g.minutes}</td>
              <td>{g.position ? POSITION_LABEL_FR[g.position] : '—'}</td>
              <td className="num strong">{g.status === 'absent' ? '—' : fmtScore(g.score)}</td>
              <td className="actions-cell" title={describeActions(g.actions) || undefined}>
                {actionItems(g.actions).map((a) => (
                  <span key={a.stat} aria-label={`${a.count} ${a.count > 1 ? a.plural : a.singular}`}>{a.icon}{a.count > 1 ? `×${a.count}` : ''} </span>
                ))}
              </td>
              <td className="num">{g.status === 'absent' ? '—' : fmtScore(g.decisive)}</td>
              <td className="num">{g.status === 'absent' ? '—' : fmtScore(g.allAround)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonTotals({ rows }: { rows: CompetitionTotalsView[] }) {
  if (!rows.length) return <p className="empty">Aucun match joué cette saison</p>;
  const sum = (f: (r: CompetitionTotalsView) => number) => rows.reduce((t, r) => t + f(r), 0);
  const played = sum((r) => r.played);
  const average = played ? sum((r) => (r.average ?? 0) * r.played) / played : null;
  return (
    <div className="table-wrap">
      <table aria-label="Saison en cours par compétition">
        <thead>
          <tr><th>Compétition</th><th>Matchs</th><th>Titu.</th><th>Minutes</th><th>Buts</th><th>Passes déc.</th><th>Moy. Sorare</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.competition}>
              <td>{r.competition}</td>
              <td className="num">{r.played}</td><td className="num">{r.started}</td><td className="num">{r.minutes}</td>
              <td className="num">{r.goals}</td><td className="num">{r.assists}</td>
              <td className="num">{r.average === null ? '—' : fmtScore(r.average)}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="history-total">
              <td>Total</td>
              <td className="num">{played}</td><td className="num">{sum((r) => r.started)}</td><td className="num">{sum((r) => r.minutes)}</td>
              <td className="num">{sum((r) => r.goals)}</td><td className="num">{sum((r) => r.assists)}</td>
              <td className="num">{average === null ? '—' : fmtScore(average)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SeasonsTable({ rows }: { rows: PlayerSeasonView[] }) {
  if (!rows.length) return <p className="empty">Historique pas encore importé</p>;
  return (
    <div className="table-wrap">
      <table aria-label="Championnat, saison par saison">
        <thead>
          <tr><th>Saison</th><th>Matchs</th><th>Titu.</th><th>Minutes</th><th>Buts</th><th>Passes déc.</th><th>Cartons</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.startYear}>
              <td>{seasonLabel(r.startYear)}</td>
              <td className="num">{r.appearances}</td><td className="num">{r.appearances - r.substituteIn}</td>
              <td className="num">{r.minutes}</td><td className="num">{r.goals}</td><td className="num">{r.assists}</td>
              <td className="num">{r.yellowCards} 🟨 {r.redCards > 0 && <>{r.redCards} 🟥</>}</td>
            </tr>
          ))}
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
  const [totals, seasons] = tab === 'historique'
    ? await Promise.all([queries.getCompetitionTotals(slug), queries.getPlayerSeasons(slug)])
    : [[], []];
  const s = player.summary;

  return (
    <main className="player-page">
      <Hero player={player} upcoming={upcoming} />

      <nav className="tabs" aria-label="Sections de la fiche">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === 'apercu' ? `/joueurs/${slug}` : `/joueurs/${slug}?onglet=${key}`} aria-current={tab === key ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'apercu' && (
        <>
          {s ? (
            <div className="tiles">
              <Tile label="L5" value={fmtScore(s.l5)} hint={`écart-type ${fmtScore(s.stdDev5)}`} />
              <Tile label="L15" value={fmtScore(s.l15)} />
              <Tile label="L40" value={fmtScore(s.l40)} />
              <Tile label="Titularisations (5)" value={fmtPct(s.startRate5)} hint={`${Math.round(s.avgMinutes5)} min en moyenne`} />
              <Tile label="Décisif (L5)" value={fmtScore(s.decisive5)} hint={`L15 ${fmtScore(s.decisive15)}`} />
              <Tile label="All-Around (L5)" value={fmtScore(s.allAround5)} hint={`L15 ${fmtScore(s.allAround15)}`} />
            </div>
          ) : (
            <p className="empty">Pas encore de match importé pour ce joueur</p>
          )}

          <ScoreChart games={games} l15={s?.l15 ?? null} />

          <h2>Postes occupés récemment</h2>
          {player.positions.length ? (
            <p className="chips">{player.positions.map((p) => <span key={p.position}>{POSITION_LABEL_FR[p.position]} × {p.count}</span>)}</p>
          ) : (
            <p className="empty">Aucune titularisation récente</p>
          )}
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

      {tab === 'historique' && (
        <>
          <h2>Saison en cours, toutes compétitions</h2>
          <SeasonTotals rows={totals} />
          <h2>Championnat, saison par saison</h2>
          <SeasonsTable rows={seasons} />
          <p className="note">Statistiques de championnat fournies par Sorare (le club n’est pas précisé). Titu. = matchs − entrées en jeu.</p>
        </>
      )}
    </main>
  );
}
