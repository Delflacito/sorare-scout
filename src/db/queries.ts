import type postgres from 'postgres';
import { getSql } from './client';
import type { DetailedPosition, GenericPosition } from '@/domain/types';

export const SORTS = ['l5', 'l15', 'l40', 'startRate', 'nextIndex'] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export interface SearchFilters {
  q?: string;
  competition?: string;
  team?: string;
  position?: GenericPosition;
  detailedPosition?: DetailedPosition;
  sort: Sort;
  offset: number;
}

export interface PlayerListRow {
  slug: string; name: string; position: GenericPosition; team: string | null; teamSlug: string | null; competition: string | null;
  usualPosition: DetailedPosition | null; l5: number; l15: number; l40: number; startRate: number;
  nextOpponent: string | null; nextOpponentSlug: string | null; nextIsHome: boolean | null;
  nextIndex: number | null; nextLowSample: boolean | null;
}

export interface ConcededView {
  position: DetailedPosition; average: number | null; leagueAverage: number | null; index: number | null;
  observations: number; lowSample: boolean;
}

export interface PlayerSummaryView {
  l5: number; l15: number; l40: number; stdDev5: number; startRate5: number; avgMinutes5: number;
  startRate15: number; avgMinutes15: number; decisive5: number; allAround5: number; decisive15: number; allAround15: number;
}

export interface PlayerDetail {
  slug: string; name: string; position: GenericPosition; team: string | null; teamSlug: string | null; competition: string | null;
  usualPosition: DetailedPosition | null; summary: PlayerSummaryView | null;
  positions: { position: DetailedPosition; count: number }[];
  next: { opponent: string; opponentSlug: string; isHome: boolean; date: string } | null;
  nextConceded: ConcededView | null;
}

export type GameStatus = 'started' | 'sub' | 'absent';
export interface PlayerGameView {
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean;
  goalsFor: number | null; goalsAgainst: number | null; score: number; minutes: number;
  status: GameStatus; position: DetailedPosition | null; decisive: number; allAround: number;
}

export interface TeamView { id: number; name: string; slug: string; competition: string | null }
export interface TeamFixtureView {
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean;
  goalsFor: number | null; goalsAgainst: number | null;
}

export interface ImportRunView {
  startedAt: string; finishedAt: string | null; status: 'running' | 'ok' | 'error';
  fixturesImported: number; errors: string[];
}

export interface UpcomingFixture {
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean;
  /** Concédé par l'adversaire au poste habituel du joueur (5 derniers matchs). */
  position: { average: number | null; index: number | null; observations: number } | null;
  /** Concédé par l'adversaire tous postes confondus (5 derniers matchs). */
  overall: { average: number | null; index: number | null; observations: number } | null;
}
export interface UpcomingView {
  form: number | null; startRate: number | null; usualPosition: DetailedPosition | null; fixtures: UpcomingFixture[];
}

export interface MatchPlayerView {
  side: 'home' | 'away'; slug: string; name: string; detailedPosition: DetailedPosition | null; grid: string | null;
  started: boolean; minutes: number; score: number; decisive: number; allAround: number;
}
export interface MatchSideView { name: string; slug: string; goals: number | null; formation: string | null }
export interface MatchView {
  id: number; date: string; status: 'played' | 'scheduled' | 'postponed'; competition: string;
  home: MatchSideView; away: MatchSideView; players: MatchPlayerView[];
}

const toConceded = (r: postgres.Row): ConcededView => ({
  position: r.detailed_position, average: r.average, leagueAverage: r.league_average, index: r.index,
  observations: r.observations, lowSample: r.low_sample,
});

export function createQueries(sql: postgres.Sql) {
  const SORT_SQL: Record<Sort, postgres.PendingQuery<postgres.Row[]>> = {
    l5: sql`s.l5`, l15: sql`s.l15`, l40: sql`s.l40`, startRate: sql`s.start_rate5`, nextIndex: sql`cp.index`,
  };

  /** Prochain match programmé de chaque équipe. */
  const nextFixtures = () => sql`
    select distinct on (t.id) t.id as team_id, f.id as fixture_id, f.date,
      case when f.home_team_id = t.id then f.away_team_id else f.home_team_id end as opponent_id,
      f.home_team_id = t.id as is_home
    from teams t join fixtures f on f.home_team_id = t.id or f.away_team_id = t.id
    where f.status = 'scheduled' and f.date > now()
    order by t.id, f.date`;

  return {
    async searchPlayers(f: SearchFilters): Promise<PlayerListRow[]> {
      const rows = await sql`
        with next_fx as (${nextFixtures()})
        select p.sorare_slug, p.name, p.position, t.name as team, t.sorare_slug as team_slug, c.name as competition,
          s.usual_position, s.l5, s.l15, s.l40, s.start_rate5,
          o.name as next_opponent, o.sorare_slug as next_opponent_slug, n.is_home, cp.index as next_index, cp.low_sample
        from players p
        join player_summary s on s.player_id = p.id
        left join teams t on t.id = p.team_id
        left join competitions c on c.id = t.competition_id
        left join next_fx n on n.team_id = p.team_id
        left join teams o on o.id = n.opponent_id
        left join team_conceded_by_position cp
          on cp.team_id = n.opponent_id and cp.detailed_position = s.usual_position and cp.window_size = 5
        where true
          ${f.q ? sql`and extensions.unaccent(p.name) ilike extensions.unaccent(${`%${f.q}%`})` : sql``}
          ${f.competition ? sql`and c.slug = ${f.competition}` : sql``}
          ${f.team ? sql`and t.sorare_slug = ${f.team}` : sql``}
          ${f.position ? sql`and p.position = ${f.position}` : sql``}
          ${f.detailedPosition ? sql`and s.usual_position = ${f.detailedPosition}` : sql``}
        order by ${SORT_SQL[f.sort]} desc nulls last, p.name
        limit ${PAGE_SIZE} offset ${f.offset}`;
      return rows.map((r) => ({
        slug: r.sorare_slug, name: r.name, position: r.position, team: r.team, teamSlug: r.team_slug, competition: r.competition,
        usualPosition: r.usual_position, l5: r.l5, l15: r.l15, l40: r.l40, startRate: r.start_rate5,
        nextOpponent: r.next_opponent, nextOpponentSlug: r.next_opponent_slug, nextIsHome: r.is_home,
        nextIndex: r.next_index, nextLowSample: r.low_sample,
      }));
    },

    async getPlayer(slug: string): Promise<PlayerDetail | null> {
      const [r] = await sql`
        with next_fx as (${nextFixtures()})
        select p.id, p.sorare_slug, p.name, p.position, t.name as team, t.sorare_slug as team_slug, c.name as competition,
          s.*, o.name as next_opponent, o.sorare_slug as next_opponent_slug, n.is_home, n.date as next_date, n.opponent_id
        from players p
        left join player_summary s on s.player_id = p.id
        left join teams t on t.id = p.team_id
        left join competitions c on c.id = t.competition_id
        left join next_fx n on n.team_id = p.team_id
        left join teams o on o.id = n.opponent_id
        where p.sorare_slug = ${slug}`;
      if (!r) return null;
      const positions = await sql`
        select detailed_position, count(*)::int as count from (
          select a.detailed_position from appearances a join fixtures f on f.id = a.fixture_id
          where a.player_id = ${r.id} and a.started and a.detailed_position is not null
          order by f.date desc limit 10
        ) recent group by detailed_position order by count desc`;
      const [conceded] = r.opponent_id && r.usual_position
        ? await sql`select * from team_conceded_by_position
            where team_id = ${r.opponent_id} and detailed_position = ${r.usual_position} and window_size = 5`
        : [];
      return {
        slug: r.sorare_slug, name: r.name, position: r.position, team: r.team, teamSlug: r.team_slug, competition: r.competition,
        usualPosition: r.usual_position,
        summary: r.l5 === null ? null : {
          l5: r.l5, l15: r.l15, l40: r.l40, stdDev5: r.std_dev5, startRate5: r.start_rate5, avgMinutes5: r.avg_minutes5,
          startRate15: r.start_rate15, avgMinutes15: r.avg_minutes15, decisive5: r.decisive5, allAround5: r.all_around5,
          decisive15: r.decisive15, allAround15: r.all_around15,
        },
        positions: positions.map((x) => ({ position: x.detailed_position, count: x.count })),
        next: r.next_opponent
          ? { opponent: r.next_opponent, opponentSlug: r.next_opponent_slug, isHome: r.is_home, date: (r.next_date as Date).toISOString() }
          : null,
        nextConceded: conceded ? toConceded(conceded) : null,
      };
    },

    /**
     * Derniers matchs complets du joueur : ceux où il a une participation, plus ceux de son club actuel où il était absent.
     * Du plus récent au plus ancien.
     */
    async getPlayerGames(slug: string, limit: number): Promise<PlayerGameView[]> {
      const rows = await sql`
        with p as (select id, team_id from players where sorare_slug = ${slug}),
        games as (
          select f.id, f.date, f.home_team_id, f.away_team_id, f.home_goals, f.away_goals,
            coalesce(a.team_id, (select team_id from p)) as team_id,
            a.sorare_score, a.minutes, a.started, a.detailed_position, a.decisive_score, a.all_around_score
          from fixtures f
          left join appearances a on a.fixture_id = f.id and a.player_id = (select id from p)
          where f.status = 'played' and f.lineups_imported
            and (a.player_id is not null or (select team_id from p) in (f.home_team_id, f.away_team_id))
        )
        select g.*, o.name as opponent, o.sorare_slug as opponent_slug from games g
        join teams o on o.id = case when g.home_team_id = g.team_id then g.away_team_id else g.home_team_id end
        order by g.date desc limit ${limit}`;
      return rows.map((g) => ({
        fixtureId: g.id, date: (g.date as Date).toISOString(), opponent: g.opponent, opponentSlug: g.opponent_slug,
        isHome: g.home_team_id === g.team_id,
        goalsFor: g.home_team_id === g.team_id ? g.home_goals : g.away_goals,
        goalsAgainst: g.home_team_id === g.team_id ? g.away_goals : g.home_goals,
        score: g.sorare_score ?? 0, minutes: g.minutes ?? 0,
        status: g.started ? 'started' : g.minutes > 0 ? 'sub' : 'absent',
        position: g.detailed_position, decisive: g.decisive_score ?? 0, allAround: g.all_around_score ?? 0,
      }));
    },

    /** Prochains matchs du club du joueur, avec ce qu'en dit l'adversaire (base du score potentiel). */
    async getUpcoming(slug: string, limit: number): Promise<UpcomingView | null> {
      const [p] = await sql`
        select p.id, p.team_id, s.form, s.start_rate5, s.usual_position
        from players p left join player_summary s on s.player_id = p.id where p.sorare_slug = ${slug}`;
      if (!p) return null;
      const rows = p.team_id ? await sql`
        with next as (
          select f.id, f.date, f.home_team_id = ${p.team_id} as is_home,
            case when f.home_team_id = ${p.team_id} then f.away_team_id else f.home_team_id end as opponent_id
          from fixtures f
          where ${p.team_id} in (f.home_team_id, f.away_team_id) and f.status = 'scheduled' and f.date > now()
          order by f.date limit ${limit}
        )
        select n.*, o.name as opponent, o.sorare_slug as opponent_slug,
          cp.average as pos_average, cp.index as pos_index, cp.observations as pos_obs,
          co.average as all_average, co.index as all_index, co.observations as all_obs
        from next n
        join teams o on o.id = n.opponent_id
        left join team_conceded_by_position cp
          on cp.team_id = n.opponent_id and cp.detailed_position = ${p.usual_position} and cp.window_size = 5
        left join team_conceded_overall co on co.team_id = n.opponent_id and co.window_size = 5
        order by n.date` : [];
      return {
        form: p.form, startRate: p.start_rate5, usualPosition: p.usual_position,
        fixtures: rows.map((r) => ({
          fixtureId: r.id, date: (r.date as Date).toISOString(), opponent: r.opponent, opponentSlug: r.opponent_slug, isHome: r.is_home,
          position: r.pos_obs === null ? null : { average: r.pos_average, index: r.pos_index, observations: r.pos_obs },
          overall: r.all_obs === null ? null : { average: r.all_average, index: r.all_index, observations: r.all_obs },
        })),
      };
    },

    async getMatch(id: number): Promise<MatchView | null> {
      const [f] = await sql`
        select f.id, f.date, f.status, f.home_goals, f.away_goals, f.home_formation, f.away_formation, f.home_team_id,
          c.name as competition, h.name as home_name, h.sorare_slug as home_slug, a.name as away_name, a.sorare_slug as away_slug
        from fixtures f
        join competitions c on c.id = f.competition_id
        join teams h on h.id = f.home_team_id
        join teams a on a.id = f.away_team_id
        where f.id = ${id}`;
      if (!f) return null;
      const players = await sql`
        select a.team_id, p.sorare_slug, p.name, a.detailed_position, a.grid, a.started, a.minutes,
          a.sorare_score, a.decisive_score, a.all_around_score
        from appearances a join players p on p.id = a.player_id
        where a.fixture_id = ${id}
        order by a.team_id = ${f.home_team_id} desc, a.started desc, a.grid nulls last, a.minutes desc, p.name`;
      return {
        id: f.id, date: (f.date as Date).toISOString(), status: f.status, competition: f.competition,
        home: { name: f.home_name, slug: f.home_slug, goals: f.home_goals, formation: f.home_formation },
        away: { name: f.away_name, slug: f.away_slug, goals: f.away_goals, formation: f.away_formation },
        players: players.map((r) => ({
          side: r.team_id === f.home_team_id ? 'home' : 'away', slug: r.sorare_slug, name: r.name,
          detailedPosition: r.detailed_position, grid: r.grid, started: r.started, minutes: r.minutes,
          score: r.sorare_score, decisive: r.decisive_score, allAround: r.all_around_score,
        })),
      };
    },

    async getTeam(slug: string): Promise<TeamView | null> {
      const [r] = await sql`select t.id, t.name, t.sorare_slug, c.name as competition
        from teams t left join competitions c on c.id = t.competition_id where t.sorare_slug = ${slug}`;
      return r ? { id: r.id, name: r.name, slug: r.sorare_slug, competition: r.competition } : null;
    },

    async getConceded(teamId: number, window: number): Promise<ConcededView[]> {
      const rows = await sql`select * from team_conceded_by_position where team_id = ${teamId} and window_size = ${window}`;
      return rows.map(toConceded);
    },

    /** Derniers matchs complets de l'équipe (ceux qui entrent dans la fenêtre du concédé). */
    async getTeamFixtures(teamId: number, limit: number): Promise<TeamFixtureView[]> {
      const rows = await sql`
        select f.id, f.date, f.home_team_id, f.home_goals, f.away_goals, o.name as opponent, o.sorare_slug as opponent_slug
        from fixtures f
        join teams o on o.id = case when f.home_team_id = ${teamId} then f.away_team_id else f.home_team_id end
        where ${teamId} in (f.home_team_id, f.away_team_id) and f.status = 'played' and f.lineups_imported
        order by f.date desc limit ${limit}`;
      return rows.map((r) => {
        const isHome = r.home_team_id === teamId;
        return {
          fixtureId: r.id, date: (r.date as Date).toISOString(), opponent: r.opponent, opponentSlug: r.opponent_slug, isHome,
          goalsFor: isHome ? r.home_goals : r.away_goals, goalsAgainst: isHome ? r.away_goals : r.home_goals,
        };
      });
    },

    async getLastRun(): Promise<ImportRunView | null> {
      const [r] = await sql`select * from import_runs order by id desc limit 1`;
      return r
        ? {
            startedAt: (r.started_at as Date).toISOString(), finishedAt: r.finished_at ? (r.finished_at as Date).toISOString() : null,
            status: r.status, fixturesImported: r.fixtures_imported, errors: r.errors,
          }
        : null;
    },

    /** Fin du dernier import réussi. */
    async getLastSuccessfulImport(): Promise<string | null> {
      const [r] = await sql`select finished_at from import_runs where status = 'ok' and finished_at is not null
        order by finished_at desc limit 1`;
      return r ? (r.finished_at as Date).toISOString() : null;
    },

    /** Clubs actuellement rattachés à une compétition suivie. */
    async listTeams(): Promise<{ slug: string; name: string }[]> {
      const rows = await sql`select sorare_slug, name from teams where competition_id is not null order by name`;
      return rows.map((r) => ({ slug: r.sorare_slug, name: r.name }));
    },

    async listCompetitions(): Promise<{ slug: string; name: string }[]> {
      const rows = await sql`select slug, name from competitions order by name`;
      return rows.map((r) => ({ slug: r.slug, name: r.name }));
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;

export const getQueries = (): Queries => createQueries(getSql());
