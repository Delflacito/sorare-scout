import type { GenericPosition } from '@/domain/types';
import { fetchWithRetry } from './http';
import { CLUBS_QUERY, CLUB_GAMES_QUERY, CLUB_PLAYERS_QUERY, GAME_DETAIL_QUERY } from './sorareQueries';

export const SORARE_URL = 'https://api.sorare.com/graphql';

/** Slugs Sorare des compétitions du Big 5. */
export const SORARE_COMPETITIONS = {
  ligue1: 'ligue-1-fr',
  premierLeague: 'premier-league-gb-eng',
  laliga: 'laliga-es',
  serieA: 'serie-a-it',
  bundesliga: 'bundesliga-de',
} as const;

export interface SorareClub { slug: string; name: string; shortName: string | null; pictureUrl: string | null; competitionSlug: string }
/** Statut actuel d'un joueur (STARTER, REGULAR, SUBSTITUTE, NOT_PLAYING…), blessure, suspension, projection Sorare du prochain match. */
export interface SorarePlayerStatus {
  slug: string; pictureUrl: string | null; playingStatus: string | null;
  injury: { kind: string | null; expectedEnd: string | null } | null;
  suspension: { reason: string | null; end: string | null } | null;
  projection: number | null;
}
interface RawPlayerStatus {
  slug: string; squaredPictureUrl: string | null; playingStatus: string | null;
  activeInjuries: { kind: string | null; expectedEndDate: string | null }[] | null;
  activeSuspensions: { reason: string | null; endDate: string | null }[] | null;
  nextClassicFixtureProjectedScore: number | null;
}
export interface SorareGame {
  id: string; date: string; homeClubSlug: string; awayClubSlug: string; competitionSlug: string | null;
  homeGoals: number | null; awayGoals: number | null; status: 'played' | 'scheduled' | 'postponed';
}
export interface SorareLineupPlayer { slug: string; displayName: string }
/** Compo d'une équipe : titulaires par ligne (gardien d'abord, chaque ligne de droite à gauche) et remplaçants. */
export interface SorareTeamLineup { starting: SorareLineupPlayer[][]; bench: SorareLineupPlayer[] }
export interface SorarePlayerScore {
  playerSlug: string; displayName: string; position: GenericPosition;
  score: number; decisive: number; allAround: number; minutes: number; started: boolean;
}
export interface SorareGameDetail { home: SorareTeamLineup; away: SorareTeamLineup; scores: SorarePlayerScore[] }

interface RawGame {
  id: string; date: string; statusTyped: string; homeGoals: number | null; awayGoals: number | null;
  homeTeam: { slug: string }; awayTeam: { slug: string }; competition: { slug: string } | null;
}
interface RawLineup { startingLineup: SorareLineupPlayer[][] | null; bench: SorareLineupPlayer[] | null }
interface RawScore {
  score: number | null;
  anyPlayer: { slug: string; displayName: string; anyPositions: GenericPosition[] };
  anyPlayerGameStats: { minsPlayed: number | null; gameStarted: number | null; formationPlace: number | null } | null;
  detailedScore: { category: string; stat: string; totalScore: number }[] | null;
}

/** Catégories du détail de score qui ne relèvent pas de l'All-Around (le décisif est porté par level_score). */
const NOT_ALL_AROUND = new Set(['UNKNOWN', 'POSITIVE_DECISIVE_STAT', 'NEGATIVE_DECISIVE_STAT']);

const toLineup = (l: RawLineup | null): SorareTeamLineup => ({ starting: l?.startingLineup ?? [], bench: l?.bench ?? [] });

function toScore(s: RawScore): SorarePlayerScore {
  const details = s.detailedScore ?? [];
  const sum = (xs: typeof details) => Math.round(xs.reduce((a, x) => a + x.totalScore, 0) * 10) / 10;
  return {
    playerSlug: s.anyPlayer.slug,
    displayName: s.anyPlayer.displayName,
    position: s.anyPlayer.anyPositions[0] ?? 'Midfielder',
    score: s.score ?? 0,
    decisive: sum(details.filter((d) => d.stat === 'level_score')),
    allAround: sum(details.filter((d) => !NOT_ALL_AROUND.has(d.category))),
    minutes: s.anyPlayerGameStats?.minsPlayed ?? 0,
    started: s.anyPlayerGameStats?.gameStarted === 1,
  };
}

function gameStatus(s: string): SorareGame['status'] {
  const v = s.toLowerCase();
  if (v === 'played') return 'played';
  if (v === 'postponed' || v === 'cancelled' || v === 'canceled' || v === 'suspended') return 'postponed';
  return 'scheduled';
}

const toGame = (g: RawGame): SorareGame => ({
  id: g.id, date: g.date, homeClubSlug: g.homeTeam.slug, awayClubSlug: g.awayTeam.slug, competitionSlug: g.competition?.slug ?? null,
  homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: gameStatus(g.statusTyped),
});

export function createSorareClient(apiKey: string | undefined, fetchImpl: typeof fetch = fetch) {
  async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchWithRetry(
      SORARE_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { APIKEY: apiKey } : {}) },
        body: JSON.stringify({ query: q, variables }),
      },
      { fetchImpl },
    );
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (!res.ok || json.errors?.length || !json.data) {
      throw new Error(`Sorare GraphQL: ${json.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`}`);
    }
    return json.data;
  }

  return {
    async clubs(competitionSlug: string): Promise<SorareClub[]> {
      const d = await query<{ football: { competition: { teams: { nodes: { slug: string; name: string; shortName: string | null; pictureUrl: string | null }[] } } } }>(
        CLUBS_QUERY, { slug: competitionSlug });
      return d.football.competition.teams.nodes.map((c) => ({
        slug: c.slug, name: c.name, shortName: c.shortName ?? null, pictureUrl: c.pictureUrl ?? null, competitionSlug,
      }));
    },

    async clubPlayers(clubSlug: string): Promise<SorarePlayerStatus[]> {
      const d = await query<{ football: { club: { activePlayers: { nodes: RawPlayerStatus[] } } } }>(CLUB_PLAYERS_QUERY, { slug: clubSlug });
      return d.football.club.activePlayers.nodes.map((p) => {
        const injury = p.activeInjuries?.[0];
        const suspension = p.activeSuspensions?.[0];
        return {
          slug: p.slug, pictureUrl: p.squaredPictureUrl ?? null, playingStatus: p.playingStatus ?? null,
          injury: injury ? { kind: injury.kind ?? null, expectedEnd: injury.expectedEndDate ?? null } : null,
          suspension: suspension ? { reason: suspension.reason ?? null, end: suspension.endDate ?? null } : null,
          projection: p.nextClassicFixtureProjectedScore ?? null,
        };
      });
    },

    async clubGames(clubSlug: string): Promise<SorareGame[]> {
      const d = await query<{ football: { club: { latestGames: { nodes: RawGame[] }; upcomingGames: RawGame[] } } }>(
        CLUB_GAMES_QUERY, { slug: clubSlug });
      return [...d.football.club.latestGames.nodes, ...d.football.club.upcomingGames].map(toGame);
    },

    async gameDetail(gameId: string): Promise<SorareGameDetail> {
      const d = await query<{ football: { game: { homeFormation: RawLineup | null; awayFormation: RawLineup | null; playerGameScores: RawScore[] } } }>(
        GAME_DETAIL_QUERY, { id: gameId.replace(/^Game:/, '') });
      const g = d.football.game;
      return { home: toLineup(g.homeFormation), away: toLineup(g.awayFormation), scores: g.playerGameScores.map(toScore) };
    },
  };
}

export type SorareClient = ReturnType<typeof createSorareClient>;
