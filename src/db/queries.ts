import type postgres from 'postgres';
import { getSql } from './client';
import type { DetailedPosition, GenericPosition } from '@/domain/types';

export const SORTS = ['projected', 'l5', 'l15', 'l40', 'startRate', 'nextIndex'] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export interface SearchFilters {
  q?: string;
  competition?: string;
  team?: string;
  position?: GenericPosition;
  detailedPosition?: DetailedPosition;
  /** Masque les joueurs blessés ou suspendus. */
  available?: boolean;
  sort: Sort;
  offset: number;
}

export interface PlayerListRow {
  slug: string; name: string; position: GenericPosition; team: string | null; teamSlug: string | null; competition: string | null;
  usualPosition: DetailedPosition | null; l5: number; l15: number; l40: number; startRate: number;
  nextOpponent: string | null; nextOpponentSlug: string | null; nextIsHome: boolean | null;
  nextIndex: number | null; nextLowSample: boolean | null;
  pictureUrl: string | null; teamPictureUrl: string | null; playingStatus: string | null;
  injuryKind: string | null; suspensionReason: string | null; sorareProjection: number | null;
  /** Score potentiel du prochain match de championnat. */
  nextProjected: number | null;
  /** Postes où ses cartes Sorare peuvent être alignées. */
  cardPositions: GenericPosition[];
}

export interface GameWeekFixture {
  id: number; date: string; competition: string;
  home: { slug: string; name: string; pictureUrl: string | null; rating: number | null };
  away: { slug: string; name: string; pictureUrl: string | null; rating: number | null };
}
export interface GameWeekPlayer {
  slug: string; name: string; position: GenericPosition; usualPosition: DetailedPosition | null;
  team: string; teamPictureUrl: string | null; pictureUrl: string | null;
  opponent: string; opponentPictureUrl: string | null; isHome: boolean; date: string;
  projected: number; startRate: number; l15: number; playingStatus: string | null; sorareProjection: number | null;
  /** Niveau habituel (L15 sur les matchs joués) : le score potentiel s'en écarte selon l'adversaire et le lieu. */
  base: number;
  cardPositions: GenericPosition[];
}
/** Concédé par l'adversaire à chaque poste (5 derniers matchs), vu depuis une équipe qui joue la journée. */
export interface RoundMatchup {
  fixtureId: number; date: string; team: string; teamSlug: string; teamPictureUrl: string | null;
  opponent: string; opponentSlug: string; opponentPictureUrl: string | null; isHome: boolean;
  /** Qualité défensive de l'adversaire, 1–100 (100 = le plus fort). */
  opponentRating: number | null;
  byPosition: Partial<Record<DetailedPosition, { average: number | null; index: number | null; observations: number }>>;
}
/** projected : meilleurs scores potentiels ; boost : plus gros gains par rapport au niveau habituel. */
export type GameWeekSort = 'projected' | 'boost';
export interface GameWeekFilters { competition?: string; position?: GenericPosition; startersOnly: boolean; limit: number; sort?: GameWeekSort }

/** Joueur indisponible : blessé ou suspendu. */
const UNAVAILABLE = 'p.injury_kind is not null or p.injury_end is not null or p.suspension_reason is not null or p.suspension_end is not null';

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
  pictureUrl: string | null; teamPictureUrl: string | null; teamShortName: string | null; playingStatus: string | null;
  injury: { kind: string | null; end: string | null } | null;
  suspension: { reason: string | null; end: string | null } | null;
  sorareProjection: number | null;
  birthDate: string | null;
  country: { code: string; name: string; flagUrl: string | null } | null;
  firstName: string | null; lastName: string | null; height: number | null; shirtNumber: number | null;
  cardPositions: GenericPosition[];
  market: PlayerMarketView | null;
  /** Photo détourée de la carte Sorare (à défaut, la photo carrée). */
  bodyPictureUrl: string | null;
}

/** Marché Limited d'un joueur (prix en euros). */
export interface PlayerMarketView {
  floorInSeason: number | null; floorClassic: number | null; referencePrice: number | null; recentPrice: number | null;
  priceTrend7: number | null; sales30: number; fairPrice: number | null; valueRatio: number | null;
  potentialPrice: number | null; potentialGain: number | null;
}
export interface SaleView { date: string; eur: number; inSeason: boolean }
export type TradingView = 'sous' | 'sur' | 'gw';
export interface TradingFilters { view: TradingView; competition?: string; position?: GenericPosition; maxPrice?: number; fixtureIds?: number[]; limit: number }
export interface TradingRow {
  slug: string; name: string; pictureUrl: string | null; team: string | null; teamPictureUrl: string | null; cardPositions: GenericPosition[];
  usualPosition: DetailedPosition | null; l5: number; l15: number; startRate: number;
  price: number; fairPrice: number | null; valueRatio: number | null; priceTrend7: number | null; sales30: number;
  potentialPrice: number | null; potentialGain: number | null; nextProjected: number | null;
  nextOpponent: string | null; nextOpponentPictureUrl: string | null; nextIsHome: boolean | null; nextDate: string | null;
}

/** Statistiques de championnat d'une saison (Sorare). */
export interface PlayerSeasonView {
  startYear: number; appearances: number; substituteIn: number; goals: number; assists: number;
  minutes: number; yellowCards: number; redCards: number;
}
/** Saison en cours, par compétition, d'après les matchs importés. */
export interface CompetitionTotalsView {
  competition: string; isLeague: boolean; played: number; started: number; minutes: number;
  goals: number; assists: number; average: number | null;
}

export type GameStatus = 'started' | 'sub' | 'absent';
export interface PlayerGameView {
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean;
  opponentPictureUrl: string | null; opponentShortName: string | null;
  goalsFor: number | null; goalsAgainst: number | null; score: number; minutes: number;
  status: GameStatus; position: DetailedPosition | null; decisive: number; allAround: number;
  /** Compétition du match ; isLeague = false pour une coupe ou un match de sélection. */
  competition: string; isLeague: boolean;
  actions: Record<string, number>;
  /** Équipe du joueur pour ce match (club ou sélection). */
  team: string; teamShortName: string | null; teamPictureUrl: string | null;
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
  fixtureId: number; date: string; opponent: string; opponentSlug: string; isHome: boolean; opponentPictureUrl: string | null;
  /** Concédé par l'adversaire au poste habituel du joueur (5 derniers matchs) et moyenne de la ligue à ce poste. */
  position: { average: number | null; leagueAverage: number | null; observations: number } | null;
  /** Qualité défensive générale de l'adversaire (10 derniers matchs) : indice et note de 1 à 100 (100 = le plus fort). */
  overall: { index: number | null; rating: number | null; observations: number } | null;
  /** Avantage du terrain mesuré dans le championnat (domicile ou extérieur, selon le lieu du match). */
  leagueVenueFactor: number;
}
export interface UpcomingView {
  /** Niveau de base (L15 sur les matchs joués) et moyennes du joueur à domicile / à l'extérieur. */
  base: number | null; homeAvg: number | null; homeGames: number; awayAvg: number | null; awayGames: number;
  startRate: number | null; usualPosition: DetailedPosition | null; fixtures: UpcomingFixture[];
}

export interface MatchPlayerView {
  side: 'home' | 'away'; slug: string; name: string; detailedPosition: DetailedPosition | null; grid: string | null;
  started: boolean; minutes: number; score: number; decisive: number; allAround: number;
}
export interface MatchSideView { name: string; slug: string; goals: number | null; formation: string | null; pictureUrl: string | null }
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
    projected: sql`s.next_projected`, l5: sql`s.l5`, l15: sql`s.l15`, l40: sql`s.l40`, startRate: sql`s.start_rate5`, nextIndex: sql`cp.index`,
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
          o.name as next_opponent, o.sorare_slug as next_opponent_slug, n.is_home, cp.index as next_index, cp.low_sample,
          p.picture_url, t.picture_url as team_picture_url, p.playing_status, p.injury_kind, p.suspension_reason, p.sorare_projection,
          s.next_projected, coalesce(p.card_positions, array[p.position]) as card_positions
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
          ${f.position ? sql`and ${f.position} = any(coalesce(p.card_positions, array[p.position]))` : sql``}
          ${f.detailedPosition ? sql`and s.usual_position = ${f.detailedPosition}` : sql``}
          ${f.available ? sql`and not (${sql.unsafe(UNAVAILABLE)})` : sql``}
        order by ${SORT_SQL[f.sort]} desc nulls last, p.name
        limit ${PAGE_SIZE} offset ${f.offset}`;
      return rows.map((r) => ({
        slug: r.sorare_slug, name: r.name, position: r.position, team: r.team, teamSlug: r.team_slug, competition: r.competition,
        usualPosition: r.usual_position, l5: r.l5, l15: r.l15, l40: r.l40, startRate: r.start_rate5,
        nextOpponent: r.next_opponent, nextOpponentSlug: r.next_opponent_slug, nextIsHome: r.is_home,
        nextIndex: r.next_index, nextLowSample: r.low_sample,
        pictureUrl: r.picture_url, teamPictureUrl: r.team_picture_url, playingStatus: r.playing_status,
        injuryKind: r.injury_kind, suspensionReason: r.suspension_reason, sorareProjection: r.sorare_projection,
        nextProjected: r.next_projected, cardPositions: r.card_positions,
      }));
    },

    /**
     * Prochaine journée : matchs de championnat programmés dans les 4 jours qui suivent le premier d'entre eux.
     * Les championnats jouent rarement le même jour : une fenêtre de 4 jours couvre une Game Week Sorare.
     */
    async getGameWeekFixtures(competition?: string): Promise<GameWeekFixture[]> {
      const rows = await sql`
        with upcoming as (
          select f.*, c.name as competition from fixtures f join competitions c on c.id = f.competition_id and c.is_league
          where f.status = 'scheduled' and f.date > now() ${competition ? sql`and c.slug = ${competition}` : sql``}
        )
        select u.id, u.date, u.competition,
          h.sorare_slug as home_slug, h.name as home_name, h.picture_url as home_picture, ho.rating as home_rating,
          a.sorare_slug as away_slug, a.name as away_name, a.picture_url as away_picture, ao.rating as away_rating
        from upcoming u
        join teams h on h.id = u.home_team_id
        join teams a on a.id = u.away_team_id
        left join team_conceded_overall ho on ho.team_id = h.id and ho.window_size = 10
        left join team_conceded_overall ao on ao.team_id = a.id and ao.window_size = 10
        where u.date < (select min(date) from upcoming) + interval '4 days'
        order by u.date, u.id`;
      return rows.map((r) => ({
        id: r.id, date: (r.date as Date).toISOString(), competition: r.competition,
        home: { slug: r.home_slug, name: r.home_name, pictureUrl: r.home_picture, rating: r.home_rating },
        away: { slug: r.away_slug, name: r.away_name, pictureUrl: r.away_picture, rating: r.away_rating },
      }));
    },

    /** Meilleurs scores potentiels de la journée par poste, hors blessés et suspendus. */
    async getGameWeekPlayers(fixtureIds: number[], f: GameWeekFilters): Promise<GameWeekPlayer[]> {
      if (!fixtureIds.length) return [];
      const rows = await sql`
        select * from (
          select p.sorare_slug, p.name, g.position, s.usual_position, t.name as team, t.picture_url as team_picture, p.picture_url,
            o.name as opponent, o.picture_url as opponent_picture, fx.home_team_id = t.id as is_home, fx.date,
            s.next_projected, s.start_rate5, s.l15, s.base, p.playing_status, p.sorare_projection,
            coalesce(p.card_positions, array[p.position]) as card_positions,
            row_number() over (partition by g.position order by
              ${f.sort === 'boost' ? sql`s.next_projected - s.base` : sql`s.next_projected`} desc, p.name) as rank
          from player_summary s
          join players p on p.id = s.player_id
          -- Une ligne par poste où ses cartes peuvent être alignées.
          cross join lateral unnest(coalesce(p.card_positions, array[p.position])) as g(position)
          join teams t on t.id = p.team_id
          join fixtures fx on fx.id = s.next_fixture_id
          join teams o on o.id = case when fx.home_team_id = t.id then fx.away_team_id else fx.home_team_id end
          where s.next_fixture_id = any(${fixtureIds}) and s.next_projected is not null and s.base is not null
            and not (${sql.unsafe(UNAVAILABLE)}) and coalesce(p.playing_status, '') <> 'NOT_PLAYING'
            ${f.startersOnly ? sql`and s.start_rate5 >= 0.6` : sql``}
            ${f.position ? sql`and g.position = ${f.position}` : sql``}
        ) x where rank <= ${f.limit}
        order by array_position(array['Goalkeeper','Defender','Midfielder','Forward'], position), rank`;
      return rows.map((r) => ({
        slug: r.sorare_slug, name: r.name, position: r.position, usualPosition: r.usual_position,
        team: r.team, teamPictureUrl: r.team_picture, pictureUrl: r.picture_url,
        opponent: r.opponent, opponentPictureUrl: r.opponent_picture, isHome: r.is_home, date: (r.date as Date).toISOString(),
        projected: r.next_projected, startRate: r.start_rate5, l15: r.l15, base: r.base, playingStatus: r.playing_status, sorareProjection: r.sorare_projection,
        cardPositions: r.card_positions,
      }));
    },

    /** Pour chaque équipe de la journée : ce que son adversaire concède à chaque poste. */
    async getRoundMatchups(fixtureIds: number[]): Promise<RoundMatchup[]> {
      if (!fixtureIds.length) return [];
      const sides = await sql`
        select f.id, f.date, s.team_id, s.opponent_id, s.is_home,
          t.name as team, t.sorare_slug as team_slug, t.picture_url as team_picture,
          o.name as opponent, o.sorare_slug as opponent_slug, o.picture_url as opponent_picture, co.rating
        from fixtures f
        cross join lateral (values (f.home_team_id, f.away_team_id, true), (f.away_team_id, f.home_team_id, false)) s(team_id, opponent_id, is_home)
        join teams t on t.id = s.team_id
        join teams o on o.id = s.opponent_id
        left join team_conceded_overall co on co.team_id = s.opponent_id and co.window_size = 10
        where f.id = any(${fixtureIds})
        order by f.date, f.id, s.is_home desc`;
      const conceded = await sql`select team_id, detailed_position, average, index, observations from team_conceded_by_position
        where window_size = 5 and team_id = any(${sides.map((s) => s.opponent_id)})`;
      const byTeam = new Map<number, RoundMatchup['byPosition']>();
      for (const c of conceded) {
        const m = byTeam.get(c.team_id) ?? {};
        m[c.detailed_position as DetailedPosition] = { average: c.average, index: c.index, observations: c.observations };
        byTeam.set(c.team_id, m);
      }
      return sides.map((s) => ({
        fixtureId: s.id, date: (s.date as Date).toISOString(), team: s.team, teamSlug: s.team_slug, teamPictureUrl: s.team_picture,
        opponent: s.opponent, opponentSlug: s.opponent_slug, opponentPictureUrl: s.opponent_picture, isHome: s.is_home,
        opponentRating: s.rating, byPosition: byTeam.get(s.opponent_id) ?? {},
      }));
    },

    async getPlayer(slug: string): Promise<PlayerDetail | null> {
      const [r] = await sql`
        with next_fx as (${nextFixtures()})
        select p.id, p.sorare_slug, p.name, p.position, t.name as team, t.sorare_slug as team_slug, c.name as competition,
          p.picture_url, t.picture_url as team_picture_url, t.short_name as team_short_name, p.playing_status,
          p.injury_kind, p.injury_end::text as injury_end, p.suspension_reason, p.suspension_end::text as suspension_end, p.sorare_projection,
          p.birth_date::text as birth_date, p.country_code, p.country_name, p.country_flag_url,
          p.first_name, p.last_name, p.height, p.shirt_number, p.body_picture_url,
          coalesce(p.card_positions, array[p.position]) as card_positions,
          p.floor_in_season, p.floor_classic, pm.reference_price, pm.recent_price, pm.price_trend7, pm.sales30, pm.fair_price,
          pm.value_ratio, pm.potential_price, pm.potential_gain, p.market_updated_at,
          s.*, o.name as next_opponent, o.sorare_slug as next_opponent_slug, n.is_home, n.date as next_date, n.opponent_id
        from players p
        left join player_summary s on s.player_id = p.id
        left join player_market pm on pm.player_id = p.id
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
        pictureUrl: r.picture_url, teamPictureUrl: r.team_picture_url, teamShortName: r.team_short_name, playingStatus: r.playing_status,
        injury: r.injury_kind || r.injury_end ? { kind: r.injury_kind, end: r.injury_end } : null,
        suspension: r.suspension_reason || r.suspension_end ? { reason: r.suspension_reason, end: r.suspension_end } : null,
        sorareProjection: r.sorare_projection,
        birthDate: r.birth_date,
        country: r.country_code ? { code: r.country_code, name: r.country_name, flagUrl: r.country_flag_url } : null,
        firstName: r.first_name, lastName: r.last_name, height: r.height, shirtNumber: r.shirt_number, bodyPictureUrl: r.body_picture_url,
        cardPositions: r.card_positions,
        market: r.market_updated_at ? {
          floorInSeason: r.floor_in_season, floorClassic: r.floor_classic, referencePrice: r.reference_price, recentPrice: r.recent_price,
          priceTrend7: r.price_trend7, sales30: r.sales30 ?? 0, fairPrice: r.fair_price, valueRatio: r.value_ratio,
          potentialPrice: r.potential_price, potentialGain: r.potential_gain,
        } : null,
      };
    },

    /** Ventes Limited des 60 derniers jours, de la plus ancienne à la plus récente. */
    async getPlayerSales(slug: string): Promise<SaleView[]> {
      const rows = await sql`select s.sold_at, s.price_eur, s.in_season from card_sales s join players p on p.id = s.player_id
        where p.sorare_slug = ${slug} order by s.sold_at`;
      return rows.map((r) => ({ date: (r.sold_at as Date).toISOString(), eur: r.price_eur, inSeason: r.in_season }));
    },

    /**
     * Trading : « sous » / « sur » = cartes les plus sous- ou surévaluées d'après leurs performances (au moins 3 ventes en 4 semaines) ;
     * « gw » = plus fort potentiel de hausse avant la Game Week (`fixtureIds`), joueurs disponibles et titulaires réguliers.
     */
    async getTrading(f: TradingFilters): Promise<TradingRow[]> {
      const order = f.view === 'sous' ? sql`pm.value_ratio asc` : f.view === 'sur' ? sql`pm.value_ratio desc` : sql`pm.potential_gain desc`;
      const rows = await sql`
        select p.sorare_slug, p.name, p.picture_url, t.name as team, t.picture_url as team_picture,
          coalesce(p.card_positions, array[p.position]) as card_positions, s.usual_position, s.l5, s.l15, s.start_rate5,
          pm.reference_price, pm.fair_price, pm.value_ratio, pm.price_trend7, pm.sales30, pm.potential_price, pm.potential_gain,
          s.next_projected, o.name as next_opponent, o.picture_url as next_opponent_picture, fx.home_team_id = t.id as next_is_home, fx.date as next_date
        from player_market pm
        join players p on p.id = pm.player_id
        join player_summary s on s.player_id = p.id
        join teams t on t.id = p.team_id
        join competitions c on c.id = t.competition_id
        left join fixtures fx on fx.id = s.next_fixture_id
        left join teams o on o.id = case when fx.home_team_id = t.id then fx.away_team_id else fx.home_team_id end
        where pm.fair_price is not null and pm.sales30 >= 3
          ${f.view === 'gw' ? sql`and s.next_fixture_id = any(${f.fixtureIds ?? []}) and pm.potential_gain is not null
            and s.start_rate5 >= 0.6 and not (${sql.unsafe(UNAVAILABLE)}) and coalesce(p.playing_status, '') <> 'NOT_PLAYING'` : sql``}
          ${f.competition ? sql`and c.slug = ${f.competition}` : sql``}
          ${f.position ? sql`and ${f.position} = any(coalesce(p.card_positions, array[p.position]))` : sql``}
          ${f.maxPrice ? sql`and pm.reference_price <= ${f.maxPrice}` : sql``}
        order by ${order}, p.name
        limit ${f.limit}`;
      return rows.map((r) => ({
        slug: r.sorare_slug, name: r.name, pictureUrl: r.picture_url, team: r.team, teamPictureUrl: r.team_picture, cardPositions: r.card_positions,
        usualPosition: r.usual_position, l5: r.l5, l15: r.l15, startRate: r.start_rate5,
        price: r.reference_price, fairPrice: r.fair_price, valueRatio: r.value_ratio, priceTrend7: r.price_trend7, sales30: r.sales30,
        potentialPrice: r.potential_price, potentialGain: r.potential_gain, nextProjected: r.next_projected,
        nextOpponent: r.next_opponent, nextOpponentPictureUrl: r.next_opponent_picture, nextIsHome: r.next_is_home,
        nextDate: r.next_date ? (r.next_date as Date).toISOString() : null,
      }));
    },

    async getPlayerSeasons(slug: string): Promise<PlayerSeasonView[]> {
      const rows = await sql`select s.* from player_seasons s join players p on p.id = s.player_id
        where p.sorare_slug = ${slug} order by s.start_year desc`;
      return rows.map((r) => ({
        startYear: r.start_year, appearances: r.appearances, substituteIn: r.substitute_in, goals: r.goals, assists: r.assists,
        minutes: r.minutes, yellowCards: r.yellow_cards, redCards: r.red_cards,
      }));
    },

    /** Saison en cours par compétition (matchs où le joueur a joué), championnat d'abord. */
    async getCompetitionTotals(slug: string): Promise<CompetitionTotalsView[]> {
      const rows = await sql`
        select c.name as competition, c.is_league, count(*)::int as played, count(*) filter (where a.started)::int as started,
          sum(a.minutes)::int as minutes,
          coalesce(sum((a.decisive_actions->>'goals')::int), 0)::int as goals,
          coalesce(sum((a.decisive_actions->>'goal_assist')::int), 0)::int as assists,
          avg(a.sorare_score) as average
        from appearances a join players p on p.id = a.player_id
        join fixtures f on f.id = a.fixture_id join competitions c on c.id = f.competition_id
        where p.sorare_slug = ${slug} and a.minutes > 0
        group by c.name, c.is_league order by c.is_league desc, played desc, c.name`;
      return rows.map((r) => ({
        competition: r.competition, isLeague: r.is_league, played: r.played, started: r.started, minutes: r.minutes,
        goals: r.goals, assists: r.assists, average: r.average,
      }));
    },

    /**
     * Derniers matchs complets du joueur : ceux où il a une participation, plus ceux de son club actuel où il était absent.
     * Du plus récent au plus ancien.
     */
    async getPlayerGames(slug: string, limit: number): Promise<PlayerGameView[]> {
      const rows = await sql`
        with p as (select id, team_id from players where sorare_slug = ${slug}),
        games as (
          select f.id, f.date, f.home_team_id, f.away_team_id, f.home_goals, f.away_goals, f.competition_id,
            coalesce(a.team_id, (select team_id from p)) as team_id,
            a.sorare_score, a.minutes, a.started, a.detailed_position, a.decisive_score, a.all_around_score, a.decisive_actions
          from fixtures f
          left join appearances a on a.fixture_id = f.id and a.player_id = (select id from p)
          where f.status = 'played' and f.lineups_imported
            and (a.player_id is not null or (select team_id from p) in (f.home_team_id, f.away_team_id))
        )
        select g.*, o.name as opponent, o.sorare_slug as opponent_slug, o.picture_url as opponent_picture_url,
          o.short_name as opponent_short_name, c.name as competition, c.is_league,
          tm.name as team, tm.short_name as team_short_name, tm.picture_url as team_picture_url from games g
        join competitions c on c.id = g.competition_id
        join teams tm on tm.id = g.team_id
        join teams o on o.id = case when g.home_team_id = g.team_id then g.away_team_id else g.home_team_id end
        order by g.date desc limit ${limit}`;
      return rows.map((g) => ({
        fixtureId: g.id, date: (g.date as Date).toISOString(), opponent: g.opponent, opponentSlug: g.opponent_slug,
        opponentPictureUrl: g.opponent_picture_url, opponentShortName: g.opponent_short_name,
        isHome: g.home_team_id === g.team_id,
        goalsFor: g.home_team_id === g.team_id ? g.home_goals : g.away_goals,
        goalsAgainst: g.home_team_id === g.team_id ? g.away_goals : g.home_goals,
        score: g.sorare_score ?? 0, minutes: g.minutes ?? 0,
        status: g.started ? 'started' : g.minutes > 0 ? 'sub' : 'absent',
        position: g.detailed_position, decisive: g.decisive_score ?? 0, allAround: g.all_around_score ?? 0,
        competition: g.competition, isLeague: g.is_league, actions: g.decisive_actions ?? {},
        team: g.team, teamShortName: g.team_short_name, teamPictureUrl: g.team_picture_url,
      }));
    },

    /** Prochains matchs du club du joueur, avec ce qu'en dit l'adversaire (base du score potentiel). */
    async getUpcoming(slug: string, limit: number): Promise<UpcomingView | null> {
      const [p] = await sql`
        select p.id, p.team_id, s.base, s.home_avg, s.home_games, s.away_avg, s.away_games, s.start_rate5, s.usual_position
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
        select n.*, o.name as opponent, o.sorare_slug as opponent_slug, o.picture_url as opponent_picture_url,
          cp.average as pos_average, cp.league_average as pos_league, cp.observations as pos_obs,
          coalesce(cp.league_average, (select avg(league_average) from team_conceded_by_position
            where detailed_position = ${p.usual_position} and window_size = 5)) as pos_league_any,
          co.index as all_index, co.rating as all_rating, co.observations as all_obs,
          case when n.is_home then v.home_factor else v.away_factor end as venue_factor
        from next n
        join teams o on o.id = n.opponent_id
        left join team_conceded_by_position cp
          on cp.team_id = n.opponent_id and cp.detailed_position = ${p.usual_position} and cp.window_size = 5
        left join team_conceded_overall co on co.team_id = n.opponent_id and co.window_size = 10
        left join venue_factors v on v.competition_id = o.competition_id
        order by n.date` : [];
      return {
        base: p.base, homeAvg: p.home_avg, homeGames: p.home_games ?? 0, awayAvg: p.away_avg, awayGames: p.away_games ?? 0,
        startRate: p.start_rate5, usualPosition: p.usual_position,
        fixtures: rows.map((r) => ({
          fixtureId: r.id, date: (r.date as Date).toISOString(), opponent: r.opponent, opponentSlug: r.opponent_slug, isHome: r.is_home,
          opponentPictureUrl: r.opponent_picture_url,
          position: r.pos_league_any === null ? null
            : { average: r.pos_average, leagueAverage: r.pos_league_any, observations: r.pos_obs ?? 0 },
          overall: r.all_obs === null ? null : { index: r.all_index, rating: r.all_rating, observations: r.all_obs },
          leagueVenueFactor: r.venue_factor ?? 1,
        })),
      };
    },

    async getMatch(id: number): Promise<MatchView | null> {
      const [f] = await sql`
        select f.id, f.date, f.status, f.home_goals, f.away_goals, f.home_formation, f.away_formation, f.home_team_id,
          c.name as competition, h.name as home_name, h.sorare_slug as home_slug, a.name as away_name, a.sorare_slug as away_slug,
          h.picture_url as home_picture, a.picture_url as away_picture
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
        home: { name: f.home_name, slug: f.home_slug, goals: f.home_goals, formation: f.home_formation, pictureUrl: f.home_picture },
        away: { name: f.away_name, slug: f.away_slug, goals: f.away_goals, formation: f.away_formation, pictureUrl: f.away_picture },
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

    /** Derniers matchs de championnat complets de l'équipe (ceux qui entrent dans la fenêtre du concédé). */
    async getTeamFixtures(teamId: number, limit: number): Promise<TeamFixtureView[]> {
      const rows = await sql`
        select f.id, f.date, f.home_team_id, f.home_goals, f.away_goals, o.name as opponent, o.sorare_slug as opponent_slug
        from fixtures f
        join competitions c on c.id = f.competition_id and c.is_league
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
      const rows = await sql`select slug, name from competitions where is_league order by name`;
      return rows.map((r) => ({ slug: r.slug, name: r.name }));
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;

export const getQueries = (): Queries => createQueries(getSql());
