import type postgres from 'postgres';
import type { DetailedPosition, GenericPosition } from '@/domain/types';
import type { Conceded } from '@/domain/metrics';

export type FixtureStatus = 'played' | 'scheduled' | 'postponed';
export type RunStatus = 'running' | 'ok' | 'error' | 'quota_exhausted';

export interface CompetitionInput { slug: string; name: string; apifootballId?: number | null }
export interface TeamInput { name: string; sorareSlug: string; apifootballId?: number | null; competitionId: number }
export interface PlayerInput { name: string; sorareSlug: string; apifootballId?: number | null; position: GenericPosition; teamId: number }
export interface FixtureInput {
  date: string; competitionId: number; homeTeamId: number; awayTeamId: number;
  homeGoals: number | null; awayGoals: number | null; status: FixtureStatus; sorareGameId: string;
}
export interface AppearanceInput {
  fixtureId: number; playerId: number; teamId: number; grid: string | null; detailedPosition: DetailedPosition | null;
  started: boolean; minutes: number; score: number; decisive: number; allAround: number;
}
export interface UnmatchedInput { source: 'sorare' | 'apifootball'; externalId: string; name: string; club: string | null; fixtureId: number | null }
export interface PlayerSummaryRow {
  playerId: number; l5: number; l15: number; l40: number; stdDev5: number;
  startRate5: number; avgMinutes5: number; startRate15: number; avgMinutes15: number;
  decisive5: number; allAround5: number; decisive15: number; allAround15: number;
  usualPosition: DetailedPosition | null;
}

type Sql = postgres.Sql | postgres.TransactionSql;

function createBaseRepo(sql: Sql) {
  return {
    sql,

    async upsertCompetition(c: CompetitionInput): Promise<number> {
      const [r] = await sql`
        insert into competitions (slug, name, apifootball_id) values (${c.slug}, ${c.name}, ${c.apifootballId ?? null})
        on conflict (slug) do update set name = excluded.name,
          apifootball_id = coalesce(excluded.apifootball_id, competitions.apifootball_id)
        returning id`;
      return r.id;
    },

    async upsertTeam(t: TeamInput): Promise<number> {
      const [r] = await sql`
        insert into teams (name, sorare_slug, apifootball_id, competition_id)
        values (${t.name}, ${t.sorareSlug}, ${t.apifootballId ?? null}, ${t.competitionId})
        on conflict (sorare_slug) do update set name = excluded.name, competition_id = excluded.competition_id,
          apifootball_id = coalesce(excluded.apifootball_id, teams.apifootball_id)
        returning id`;
      return r.id;
    },

    async upsertPlayer(p: PlayerInput): Promise<number> {
      const [r] = await sql`
        insert into players (name, sorare_slug, apifootball_id, position, team_id)
        values (${p.name}, ${p.sorareSlug}, ${p.apifootballId ?? null}, ${p.position}, ${p.teamId})
        on conflict (sorare_slug) do update set name = excluded.name, position = excluded.position,
          team_id = excluded.team_id, apifootball_id = coalesce(excluded.apifootball_id, players.apifootball_id)
        returning id`;
      return r.id;
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

    async setFixtureApiFootballId(fixtureId: number, apifootballFixtureId: number): Promise<void> {
      await sql`update fixtures set apifootball_fixture_id = ${apifootballFixtureId} where id = ${fixtureId}`;
    },

    async markLineupsImported(fixtureId: number, homeFormation: string | null, awayFormation: string | null): Promise<void> {
      await sql`update fixtures set lineups_imported = true, home_formation = ${homeFormation}, away_formation = ${awayFormation}
        where id = ${fixtureId}`;
    },

    async fixturesNeedingLineups(): Promise<{ id: number; apifootballFixtureId: number }[]> {
      const rows = await sql`
        select id, apifootball_fixture_id from fixtures
        where status = 'played' and not lineups_imported and apifootball_fixture_id is not null
        order by date`;
      return rows.map((r) => ({ id: r.id, apifootballFixtureId: r.apifootball_fixture_id }));
    },

    async upsertAppearance(a: AppearanceInput): Promise<void> {
      await sql`
        insert into appearances (fixture_id, player_id, team_id, grid, detailed_position, started, minutes,
          sorare_score, decisive_score, all_around_score)
        values (${a.fixtureId}, ${a.playerId}, ${a.teamId}, ${a.grid}, ${a.detailedPosition}, ${a.started}, ${a.minutes},
          ${a.score}, ${a.decisive}, ${a.allAround})
        on conflict (fixture_id, player_id) do update set team_id = excluded.team_id, grid = excluded.grid,
          detailed_position = excluded.detailed_position, started = excluded.started, minutes = excluded.minutes,
          sorare_score = excluded.sorare_score, decisive_score = excluded.decisive_score,
          all_around_score = excluded.all_around_score`;
    },

    async addUnmatched(u: UnmatchedInput): Promise<void> {
      await sql`
        insert into unmatched_players (source, external_id, name, club, fixture_id)
        values (${u.source}, ${u.externalId}, ${u.name}, ${u.club}, ${u.fixtureId})
        on conflict do nothing`;
    },

    async replaceConceded(rows: Conceded[]): Promise<void> {
      await sql`delete from team_conceded_by_position`;
      if (!rows.length) return;
      await sql`insert into team_conceded_by_position ${sql(
        rows.map((r) => ({
          team_id: Number(r.teamId), detailed_position: r.position, window_size: r.window, average: r.average,
          league_average: r.leagueAverage, index: r.index, observations: r.observations, low_sample: r.lowSample,
        })),
      )}`;
    },

    async replacePlayerSummaries(rows: PlayerSummaryRow[]): Promise<void> {
      await sql`delete from player_summary`;
      if (!rows.length) return;
      await sql`insert into player_summary ${sql(
        rows.map((r) => ({
          player_id: r.playerId, l5: r.l5, l15: r.l15, l40: r.l40, std_dev5: r.stdDev5,
          start_rate5: r.startRate5, avg_minutes5: r.avgMinutes5, start_rate15: r.startRate15, avg_minutes15: r.avgMinutes15,
          decisive5: r.decisive5, all_around5: r.allAround5, decisive15: r.decisive15, all_around15: r.allAround15,
          usual_position: r.usualPosition,
        })),
      )}`;
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
