import type postgres from 'postgres';
import { getSql } from './client';
import type { DetailedPosition, GenericPosition } from '@/domain/types';

export const SORTS = ['l5', 'l15', 'l40', 'startRate', 'nextIndex'] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export interface SearchFilters {
  q?: string;
  competition?: string;
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
          ${f.q ? sql`and unaccent(p.name) ilike unaccent(${`%${f.q}%`})` : sql``}
          ${f.competition ? sql`and c.slug = ${f.competition}` : sql``}
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

    async listCompetitions(): Promise<{ slug: string; name: string }[]> {
      const rows = await sql`select slug, name from competitions order by name`;
      return rows.map((r) => ({ slug: r.slug, name: r.name }));
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;

export const getQueries = (): Queries => createQueries(getSql());
