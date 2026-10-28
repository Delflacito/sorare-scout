import type { GenericPosition } from '@/domain/types';
import { fetchWithRetry } from './http';
import { CLUBS_QUERY, CLUB_GAMES_QUERY, GAME_SCORES_QUERY } from './sorareQueries';

export const SORARE_URL = 'https://api.sorare.com/graphql';

/** Slugs Sorare des compétitions du Big 5. */
export const SORARE_COMPETITIONS = {
  ligue1: 'ligue-1-fr',
  premierLeague: 'premier-league-gb-eng',
  laliga: 'laliga-es',
  serieA: 'serie-a-it',
  bundesliga: 'bundesliga-de',
} as const;

export interface SorareClub { slug: string; name: string; competitionSlug: string }
export interface SorareGame {
  id: string; date: string; homeClubSlug: string; awayClubSlug: string;
  homeGoals: number | null; awayGoals: number | null; status: 'played' | 'scheduled' | 'postponed';
}
export interface SorarePlayerScore {
  playerSlug: string; displayName: string; clubSlug: string; position: GenericPosition;
  score: number; decisive: number; allAround: number; minutes: number;
}

interface RawGame {
  id: string; date: string; status: string; homeGoals: number | null; awayGoals: number | null;
  homeTeam: { slug: string }; awayTeam: { slug: string };
}
interface RawScore {
  score: number | null;
  decisiveScore: { totalScore: number } | null;
  allAroundStats: { totalScore: number }[] | null;
  playerGameStats: { minsPlayed: number | null; team: { slug: string } | null } | null;
  anyPlayer: { slug: string; displayName: string; position: GenericPosition };
}

function gameStatus(s: string): SorareGame['status'] {
  const v = s.toLowerCase();
  if (v === 'played') return 'played';
  if (v === 'postponed' || v === 'cancelled' || v === 'canceled' || v === 'suspended') return 'postponed';
  return 'scheduled';
}

const toGame = (g: RawGame): SorareGame => ({
  id: g.id, date: g.date, homeClubSlug: g.homeTeam.slug, awayClubSlug: g.awayTeam.slug,
  homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: gameStatus(g.status),
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
      const d = await query<{ football: { competition: { clubs: { nodes: { slug: string; name: string }[] } } } }>(
        CLUBS_QUERY, { slug: competitionSlug });
      return d.football.competition.clubs.nodes.map((c) => ({ slug: c.slug, name: c.name, competitionSlug }));
    },

    async clubGames(clubSlug: string): Promise<SorareGame[]> {
      const d = await query<{ football: { club: { latestGames: RawGame[]; upcomingGames: RawGame[] } } }>(
        CLUB_GAMES_QUERY, { slug: clubSlug });
      return [...d.football.club.latestGames, ...d.football.club.upcomingGames].map(toGame);
    },

    async gameScores(gameId: string): Promise<SorarePlayerScore[]> {
      const d = await query<{ football: { game: { playerGameScores: RawScore[] } } }>(GAME_SCORES_QUERY, { id: gameId });
      return d.football.game.playerGameScores.map((s) => ({
        playerSlug: s.anyPlayer.slug,
        displayName: s.anyPlayer.displayName,
        clubSlug: s.playerGameStats?.team?.slug ?? '',
        position: s.anyPlayer.position,
        score: s.score ?? 0,
        decisive: s.decisiveScore?.totalScore ?? 0,
        allAround: (s.allAroundStats ?? []).reduce((a, x) => a + x.totalScore, 0),
        minutes: s.playerGameStats?.minsPlayed ?? 0,
      }));
    },
  };
}

export type SorareClient = ReturnType<typeof createSorareClient>;
