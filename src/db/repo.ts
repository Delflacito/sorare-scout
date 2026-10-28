import type postgres from 'postgres';
import type { DetailedPosition, GenericPosition } from '@/domain/types';
import type { Conceded, ConcededOverall } from '@/domain/metrics';

export type FixtureStatus = 'played' | 'scheduled' | 'postponed';
export type RunStatus = 'running' | 'ok' | 'error';

/** isLeague : championnat suivi (par défaut) ; false pour une coupe ou une compétition de sélections. */
export interface CompetitionInput { slug: string; name: string; isLeague?: boolean }
export interface TeamInput { name: string; sorareSlug: string; competitionId: number; pictureUrl?: string | null; shortName?: string | null }
export type TeamKind = 'club' | 'national';
/** Équipe hors des championnats suivis (adversaire de coupe d'Europe, sélection nationale). */
export interface OtherTeamInput { name: string; sorareSlug: string; pictureUrl: string | null; kind: TeamKind }
export interface PlayerStatusInput {
  slug: string; pictureUrl: string | null; playingStatus: string | null;
  injury: { kind: string | null; expectedEnd: string | null } | null;
  suspension: { reason: string | null; end: string | null } | null;
  projection: number | null;
  nationalTeamId?: number | null;
  /** Club suivi dans l'effectif duquel Sorare le liste (club actuel). */
  teamId?: number | null;
  position?: GenericPosition | null;
  cardPositions?: GenericPosition[];
}
export interface PlayerInput { name: string; sorareSlug: string; position: GenericPosition; teamId: number }
export interface FixtureInput {
  date: string; competitionId: number; homeTeamId: number; awayTeamId: number;
  homeGoals: number | null; awayGoals: number | null; status: FixtureStatus; sorareGameId: string;
}
export interface AppearanceInput {
  fixtureId: number; playerId: number; teamId: number; grid: string | null; detailedPosition: DetailedPosition | null;
  started: boolean; minutes: number; score: number; decisive: number; allAround: number;
  /** Actions décisives (goals, goal_assist, clean_sheet_60…) et leur nombre. */
  actions?: Record<string, number>;
}
export interface PlayerProfileInput {
  slug: string; birthDate: string | null; country: { code: string; name: string; flagUrl: string | null } | null;
  activeClub?: { slug: string; name: string; pictureUrl: string | null } | null;
  seasons: { startYear: number; appearances: number; substituteIn: number; goals: number; assists: number; minutes: number; yellowCards: number; redCards: number }[];
}
export interface PlayerSummaryRow {
  playerId: number; l5: number; l15: number; l40: number; stdDev5: number;
  startRate5: number; avgMinutes5: number; startRate15: number; avgMinutes15: number;
  decisive5: number; allAround5: number; decisive15: number; allAround15: number;
  usualPosition: DetailedPosition | null;
  /** Niveau de base (L15 sur les matchs joués) et moyennes à domicile / à l'extérieur : base du score potentiel. */
  base: number | null;
  homeAvg: number | null;
  homeGames: number;
  awayAvg: number | null;
  awayGames: number;
  /** Prochain match de championnat et score potentiel pour ce match. */
  nextFixtureId?: number | null;
  nextProjected?: number | null;
}

export interface FixtureToComplete { id: number; sorareGameId: string; homeTeamId: number; awayTeamId: number }
/** league : championnat ; cup : autre compétition de club ; national : sélections. */
export type FixtureScope = 'league' | 'cup' | 'national';
export interface CompletedFixture {
  id: number; competitionId: number; homeTeamId: number; awayTeamId: number; date: string;
  homeGoals?: number | null; awayGoals?: number | null;
  /** Absent : championnat. */
  scope?: FixtureScope;
}
export interface AppearanceRow {
  fixtureId: number; playerId: number; teamId: number; detailedPosition: DetailedPosition | null;
  started: boolean; minutes: number; score: number; decisive: number; allAround: number;
}
export interface ConcededOverallRow extends ConcededOverall { rating: number | null }
export interface VenueFactorRow { competitionId: number; home: number; away: number; observations: number }
/** tracked : club d'un championnat suivi (ses joueurs sont importés). */
export interface TeamRow { id: number; name: string; sorareSlug: string; tracked?: boolean }

/**
 * Version du détail de match importé ; les matchs d'une version antérieure sont réimportés.
 * 2 : actions décisives ; 3 : pistons et ailiers des lignes de 5 repérés par leur placement Opta.
 */
export const STATS_VERSION = 3;
/** Délai avant de rafraîchir l'identité et l'historique d'un joueur. */
const PROFILE_REFRESH_DAYS = 7;

/** Nombre de tentatives d'import de compo pour un match avant de l'abandonner. */
export const MAX_LINEUP_ATTEMPTS = 5;

/** Lignes par insert groupé : reste sous la limite de 65 534 paramètres Postgres. */
const INSERT_CHUNK = 2000;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / INSERT_CHUNK) }, (_, i) => xs.slice(i * INSERT_CHUNK, (i + 1) * INSERT_CHUNK));

type Sql = postgres.Sql | postgres.TransactionSql;

function createBaseRepo(sql: Sql) {
  return {
    sql,

    async upsertCompetition(c: CompetitionInput): Promise<number> {
      const [r] = await sql`
        insert into competitions (slug, name, is_league) values (${c.slug}, ${c.name}, ${c.isLeague ?? true})
        on conflict (slug) do update set name = excluded.name, is_league = excluded.is_league
        returning id`;
      return r.id;
    },

    async upsertTeam(t: TeamInput): Promise<number> {
      const [r] = await sql`
        insert into teams (name, sorare_slug, competition_id, picture_url, short_name)
        values (${t.name}, ${t.sorareSlug}, ${t.competitionId}, ${t.pictureUrl ?? null}, ${t.shortName ?? null})
        on conflict (sorare_slug) do update set name = excluded.name, competition_id = excluded.competition_id,
          picture_url = coalesce(excluded.picture_url, teams.picture_url), short_name = coalesce(excluded.short_name, teams.short_name)
        returning id`;
      return r.id;
    },

    /** Équipe hors championnat suivi : créée si besoin, sans toucher au rattachement d'un club suivi. */
    async ensureTeam(t: OtherTeamInput): Promise<number> {
      const [r] = await sql`
        insert into teams (name, sorare_slug, picture_url, kind) values (${t.name}, ${t.sorareSlug}, ${t.pictureUrl}, ${t.kind})
        on conflict (sorare_slug) do update set picture_url = coalesce(teams.picture_url, excluded.picture_url)
        returning id`;
      return r.id;
    },

    /** Identifiants des joueurs déjà connus parmi ces slugs. */
    async playerIdsBySlugs(slugs: string[]): Promise<Map<string, number>> {
      if (!slugs.length) return new Map();
      const rows = await sql`select id, sorare_slug from players where sorare_slug = any(${slugs})`;
      return new Map(rows.map((r) => [r.sorare_slug as string, r.id as number]));
    },

    /** Sélections nationales des joueurs connus. */
    async nationalTeamsOfPlayers(): Promise<TeamRow[]> {
      const rows = await sql`select distinct t.id, t.name, t.sorare_slug from players p join teams t on t.id = p.national_team_id order by t.sorare_slug`;
      return rows.map((r) => ({ id: r.id, name: r.name, sorareSlug: r.sorare_slug }));
    },

    /** Détache de la compétition les clubs qui n'y figurent plus (relégués). */
    async detachTeams(competitionId: number, keepSorareSlugs: string[]): Promise<void> {
      await sql`update teams set competition_id = null
        where competition_id = ${competitionId} and not (sorare_slug = any(${keepSorareSlugs}))`;
    },

    async upsertPlayer(p: PlayerInput): Promise<number> {
      const [r] = await sql`
        insert into players (name, sorare_slug, position, team_id) values (${p.name}, ${p.sorareSlug}, ${p.position}, ${p.teamId})
        on conflict (sorare_slug) do update set name = excluded.name, position = excluded.position,
          team_id = coalesce(players.team_id, excluded.team_id)
        returning id`;
      return r.id;
    },

    /** Statut actuel des joueurs déjà connus ; renvoie le nombre de joueurs mis à jour. */
    async updatePlayerStatuses(rows: PlayerStatusInput[]): Promise<number> {
      let updated = 0;
      for (const r of rows) {
        const res = await sql`update players set picture_url = coalesce(${r.pictureUrl}, picture_url), playing_status = ${r.playingStatus},
          injury_kind = ${r.injury?.kind ?? null}, injury_end = ${r.injury?.expectedEnd ?? null},
          suspension_reason = ${r.suspension?.reason ?? null}, suspension_end = ${r.suspension?.end ?? null},
          sorare_projection = ${r.projection}, national_team_id = ${r.nationalTeamId ?? null}, status_updated_at = now(),
          team_id = coalesce(${r.teamId ?? null}, team_id), position = coalesce(${r.position ?? null}, position),
          card_positions = coalesce(${r.cardPositions?.length ? r.cardPositions : null}::text[], card_positions)
          where sorare_slug = ${r.slug}`;
        updated += res.count;
      }
      return updated;
    },

    async upsertFixture(f: FixtureInput): Promise<number> {
      const [r] = await sql`
        insert into fixtures (date, competition_id, home_team_id, away_team_id, home_goals, away_goals, status, sorare_game_id)
        values (${f.date}, ${f.competitionId}, ${f.homeTeamId}, ${f.awayTeamId}, ${f.homeGoals}, ${f.awayGoals}, ${f.status}, ${f.sorareGameId})
        on conflict (sorare_game_id) do update set date = excluded.date, home_goals = excluded.home_goals,
          away_goals = excluded.away_goals, status = excluded.status
        returning id`;
      return r.id;
    },

    /** Supprime les matchs antérieurs à `since` (et leurs participations). */
    async deleteFixturesBefore(since: string): Promise<number> {
      const rows = await sql`delete from fixtures where date < ${since} returning id`;
      return rows.length;
    },

    async markLineupsImported(fixtureId: number, homeFormation: string | null, awayFormation: string | null): Promise<void> {
      await sql`update fixtures set lineups_imported = true, home_formation = ${homeFormation}, away_formation = ${awayFormation},
        stats_version = ${STATS_VERSION} where id = ${fixtureId}`;
    },

    async fixturesNeedingLineups(): Promise<FixtureToComplete[]> {
      const rows = await sql`
        select id, sorare_game_id, home_team_id, away_team_id from fixtures
        where status = 'played' and (
          (not lineups_imported and lineups_attempts < ${MAX_LINEUP_ATTEMPTS})
          or (lineups_imported and stats_version < ${STATS_VERSION}))
        order by lineups_imported, date desc`;
      return rows.map((r) => ({ id: r.id, sorareGameId: r.sorare_game_id, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id }));
    },

    /** Compte une tentative d'import de compo infructueuse (au-delà de MAX_LINEUP_ATTEMPTS, le match est abandonné). */
    async countLineupAttempt(fixtureId: number): Promise<void> {
      await sql`update fixtures set lineups_attempts = lineups_attempts + 1 where id = ${fixtureId}`;
    },

    async teamsByCompetition(competitionId: number): Promise<TeamRow[]> {
      const rows = await sql`select id, name, sorare_slug from teams where competition_id = ${competitionId}`;
      return rows.map((r) => ({ id: r.id, name: r.name, sorareSlug: r.sorare_slug }));
    },

    async allTeams(): Promise<TeamRow[]> {
      const rows = await sql`select id, name, sorare_slug, competition_id is not null and kind = 'club' as tracked from teams`;
      return rows.map((r) => ({ id: r.id, name: r.name, sorareSlug: r.sorare_slug, tracked: r.tracked }));
    },

    async upsertAppearance(a: AppearanceInput): Promise<void> {
      await sql`
        insert into appearances (fixture_id, player_id, team_id, grid, detailed_position, started, minutes,
          sorare_score, decisive_score, all_around_score, decisive_actions)
        values (${a.fixtureId}, ${a.playerId}, ${a.teamId}, ${a.grid}, ${a.detailedPosition}, ${a.started}, ${a.minutes},
          ${a.score}, ${a.decisive}, ${a.allAround}, ${sql.json(a.actions ?? {})})
        on conflict (fixture_id, player_id) do update set team_id = excluded.team_id, grid = excluded.grid,
          detailed_position = excluded.detailed_position, started = excluded.started, minutes = excluded.minutes,
          sorare_score = excluded.sorare_score, decisive_score = excluded.decisive_score,
          all_around_score = excluded.all_around_score, decisive_actions = excluded.decisive_actions`;
    },

    async replaceConceded(rows: Conceded[]): Promise<void> {
      await sql`delete from team_conceded_by_position`;
      for (const chunk of chunks(rows)) await sql`insert into team_conceded_by_position ${sql(
        chunk.map((r) => ({
          team_id: Number(r.teamId), detailed_position: r.position, window_size: r.window, average: r.average,
          league_average: r.leagueAverage, index: r.index, observations: r.observations, low_sample: r.lowSample,
        })),
      )}`;
    },

    async replaceVenueFactors(rows: VenueFactorRow[]): Promise<void> {
      await sql`delete from venue_factors`;
      if (!rows.length) return;
      await sql`insert into venue_factors ${sql(
        rows.map((r) => ({ competition_id: r.competitionId, home_factor: r.home, away_factor: r.away, observations: r.observations })),
      )}`;
    },

    async replaceConcededOverall(rows: ConcededOverallRow[]): Promise<void> {
      await sql`delete from team_conceded_overall`;
      for (const chunk of chunks(rows)) await sql`insert into team_conceded_overall ${sql(
        chunk.map((r) => ({
          team_id: Number(r.teamId), window_size: r.window, average: r.average, league_average: r.leagueAverage,
          index: r.index, observations: r.observations, rating: r.rating,
        })),
      )}`;
    },

    async replacePlayerSummaries(rows: PlayerSummaryRow[]): Promise<void> {
      await sql`delete from player_summary`;
      for (const chunk of chunks(rows)) await sql`insert into player_summary ${sql(
        chunk.map((r) => ({
          player_id: r.playerId, l5: r.l5, l15: r.l15, l40: r.l40, std_dev5: r.stdDev5,
          start_rate5: r.startRate5, avg_minutes5: r.avgMinutes5, start_rate15: r.startRate15, avg_minutes15: r.avgMinutes15,
          decisive5: r.decisive5, all_around5: r.allAround5, decisive15: r.decisive15, all_around15: r.allAround15,
          usual_position: r.usualPosition, base: r.base,
          home_avg: r.homeAvg, home_games: r.homeGames, away_avg: r.awayAvg, away_games: r.awayGames,
          next_fixture_id: r.nextFixtureId ?? null, next_projected: r.nextProjected ?? null,
        })),
      )}`;
    },

    /**
     * Joueurs rattachés à un club suivi qui ne figurent plus dans aucun effectif (partis hors des championnats suivis) :
     * détachés, et leur profil est redemandé pour connaître leur nouveau club.
     */
    async releasePlayersNotIn(listedSlugs: string[]): Promise<number> {
      const rows = await sql`update players set team_id = null, profile_updated_at = null
        where team_id in (select id from teams where competition_id is not null and kind = 'club')
          and not (sorare_slug = any(${listedSlugs}))
        returning id`;
      return rows.length;
    },

    /** Joueurs dont l'identité et l'historique sont absents ou plus vieux qu'une semaine, les plus anciens d'abord. */
    async playersNeedingProfile(): Promise<string[]> {
      const rows = await sql`select sorare_slug from players
        where profile_updated_at is null or profile_updated_at < now() - make_interval(days => ${PROFILE_REFRESH_DAYS})
        order by profile_updated_at nulls first, id`;
      return rows.map((r) => r.sorare_slug);
    },

    /** Identité et historique par saison (l'historique d'un joueur est remplacé en entier). */
    async saveProfiles(profiles: PlayerProfileInput[]): Promise<void> {
      for (const p of profiles) {
        const [player] = await sql`update players set birth_date = ${p.birthDate}, country_code = ${p.country?.code ?? null},
          country_name = ${p.country?.name ?? null}, country_flag_url = ${p.country?.flagUrl ?? null}, profile_updated_at = now()
          where sorare_slug = ${p.slug} returning id`;
        if (!player) continue;
        // Club actuel hors des championnats suivis : seulement pour un joueur qui n'est plus dans un effectif suivi.
        if (p.activeClub) {
          const [club] = await sql`
            insert into teams (name, sorare_slug, picture_url, kind) values (${p.activeClub.name}, ${p.activeClub.slug}, ${p.activeClub.pictureUrl}, 'club')
            on conflict (sorare_slug) do update set picture_url = coalesce(teams.picture_url, excluded.picture_url)
            returning id`;
          await sql`update players set team_id = ${club.id} where id = ${player.id} and (team_id is null
            or team_id not in (select id from teams where competition_id is not null and kind = 'club'))`;
        }
        await sql`delete from player_seasons where player_id = ${player.id}`;
        if (p.seasons.length) await sql`insert into player_seasons ${sql(p.seasons.map((x) => ({
          player_id: player.id, start_year: x.startYear, appearances: x.appearances, substitute_in: x.substituteIn, goals: x.goals,
          assists: x.assists, minutes: x.minutes, yellow_cards: x.yellowCards, red_cards: x.redCards,
        })))}`;
      }
    },

    /** Marque des joueurs comme traités même si Sorare ne les connaît pas (évite de les redemander chaque jour). */
    async touchProfiles(slugs: string[]): Promise<void> {
      if (slugs.length) await sql`update players set profile_updated_at = now() where sorare_slug = any(${slugs})`;
    },

    /** Club actuel de chaque joueur. */
    async playerTeams(): Promise<Map<number, number>> {
      const rows = await sql`select id, team_id from players where team_id is not null`;
      return new Map(rows.map((r) => [r.id as number, r.team_id as number]));
    },

    /** Prochain match de championnat programmé de chaque équipe. */
    async nextLeagueFixtures(): Promise<Map<number, { fixtureId: number; opponentId: number; isHome: boolean; competitionId: number }>> {
      const rows = await sql`
        select distinct on (t.id) t.id as team_id, f.id, f.competition_id, f.home_team_id = t.id as is_home,
          case when f.home_team_id = t.id then f.away_team_id else f.home_team_id end as opponent_id
        from teams t
        join fixtures f on t.id in (f.home_team_id, f.away_team_id)
        join competitions c on c.id = f.competition_id and c.is_league
        where f.status = 'scheduled' and f.date > now()
        order by t.id, f.date`;
      return new Map(rows.map((r) => [r.team_id as number, { fixtureId: r.id, opponentId: r.opponent_id, isHome: r.is_home, competitionId: r.competition_id }]));
    },

    /** Matchs joués et complets, avec toutes leurs participations : entrée du recalcul des agrégats. */
    async aggregateInputs(): Promise<{ fixtures: CompletedFixture[]; appearances: AppearanceRow[] }> {
      const fixtures = await sql`
        select f.id, f.competition_id, f.home_team_id, f.away_team_id, f.date, f.home_goals, f.away_goals,
          case when c.is_league then 'league' when h.kind = 'national' then 'national' else 'cup' end as scope
        from fixtures f join competitions c on c.id = f.competition_id join teams h on h.id = f.home_team_id
        where f.status = 'played' and f.lineups_imported order by f.date`;
      const appearances = await sql`
        select a.fixture_id, a.player_id, a.team_id, a.detailed_position, a.started, a.minutes,
          a.sorare_score, a.decisive_score, a.all_around_score
        from appearances a join fixtures f on f.id = a.fixture_id
        where f.status = 'played' and f.lineups_imported`;
      return {
        fixtures: fixtures.map((f) => ({
          id: f.id, competitionId: f.competition_id, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id,
          date: (f.date as Date).toISOString(), homeGoals: f.home_goals, awayGoals: f.away_goals, scope: f.scope,
        })),
        appearances: appearances.map((a) => ({
          fixtureId: a.fixture_id, playerId: a.player_id, teamId: a.team_id, detailedPosition: a.detailed_position,
          started: a.started, minutes: a.minutes, score: a.sorare_score, decisive: a.decisive_score, allAround: a.all_around_score,
        })),
      };
    },

    async startRun(): Promise<number> {
      const [r] = await sql`insert into import_runs (status) values ('running') returning id`;
      return r.id;
    },

    async finishRun(id: number, status: RunStatus, fixturesImported: number, errors: string[]): Promise<void> {
      await sql`update import_runs set status = ${status}, finished_at = now(), fixtures_imported = ${fixturesImported},
        errors = ${sql.json(errors)} where id = ${id}`;
    },
  };
}

export type Repo = ReturnType<typeof createBaseRepo> & {
  /** Exécute fn dans une transaction avec un dépôt lié à celle-ci (imbriquée : réutilise la transaction courante). */
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
};

export function createRepo(sql: Sql): Repo {
  const repo: Repo = {
    ...createBaseRepo(sql),
    async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
      if (!('begin' in sql)) return fn(repo);
      return (await sql.begin((tx) => fn(createRepo(tx)))) as T;
    },
  };
  return repo;
}
