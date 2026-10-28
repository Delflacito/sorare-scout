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
  fixtureId: number; date: string; opponent: string; isHome: boolean; score: number; minutes: number;
  status: GameStatus; position: DetailedPosition | null; decisive: number; allAround: number;
}

export interface TeamView { id: number; name: string; slug: string; competition: string | null }
export interface TeamFixtureView {
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean;
  goalsFor: number | null; goalsAgainst: number | null;
}

export interface UnmatchedView { source: 'sorare' | 'apifootball'; name: string; club: string | null; fixture: string | null; date: string | null }
export interface ImportRunView {
  startedAt: string; finishedAt: string | null; status: 'running' | 'ok' | 'error' | 'quota_exhausted';
  fixturesImported: number; errors: string[];
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
          select f.id, f.date, f.home_team_id, f.away_team_id, coalesce(a.team_id, (select team_id from p)) as team_id,
            a.sorare_score, a.minutes, a.started, a.detailed_position, a.decisive_score, a.all_around_score
          from fixtures f
          left join appearances a on a.fixture_id = f.id and a.player_id = (select id from p)
          where f.status = 'played' and f.lineups_imported
            and (a.player_id is not null or (select team_id from p) in (f.home_team_id, f.away_team_id))
        )
        select g.*, o.name as opponent from games g
        join teams o on o.id = case when g.home_team_id = g.team_id then g.away_team_id else g.home_team_id end
        order by g.date desc limit ${limit}`;
      return rows.map((g) => ({
        fixtureId: g.id, date: (g.date as Date).toISOString(), opponent: g.opponent, isHome: g.home_team_id === g.team_id,
        score: g.sorare_score ?? 0, minutes: g.minutes ?? 0,
        status: g.started ? 'started' : g.minutes > 0 ? 'sub' : 'absent',
        position: g.detailed_position, decisive: g.decisive_score ?? 0, allAround: g.all_around_score ?? 0,
      }));
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

    async getUnmatched(): Promise<UnmatchedView[]> {
      const rows = await sql`
        select u.source, u.name, u.club, f.date, h.name as home, a.name as away
        from unmatched_players u
        left join fixtures f on f.id = u.fixture_id
        left join teams h on h.id = f.home_team_id
        left join teams a on a.id = f.away_team_id
        order by f.date desc nulls last, u.name`;
      return rows.map((r) => ({
        source: r.source, name: r.name, club: r.club,
        fixture: r.home ? `${r.home} – ${r.away}` : null, date: r.date ? (r.date as Date).toISOString() : null,
      }));
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

    /** Fin du dernier import ayant importé des données (statut ok ou quota atteint). */
    async getLastSuccessfulImport(): Promise<string | null> {
      const [r] = await sql`select finished_at from import_runs where status in ('ok', 'quota_exhausted') and finished_at is not null
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
