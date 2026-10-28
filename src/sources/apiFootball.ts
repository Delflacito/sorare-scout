import { fetchWithRetry } from './http';

export const API_FOOTBALL_URL = 'https://v3.football.api-sports.io';
export const AF_LEAGUES = { ligue1: 61, premierLeague: 39, laliga: 140, serieA: 135, bundesliga: 78 } as const;

export class QuotaExhaustedError extends Error {
  constructor() {
    super('Quota API-Football atteint');
  }
}

export interface AfFixture { id: number; date: string; homeTeamId: number; awayTeamId: number; homeName: string; awayName: string; status: string }
export interface AfLineupPlayer { playerId: number; name: string; grid: string | null; started: boolean }
export interface AfLineup { teamId: number; formation: string | null; players: AfLineupPlayer[] }

interface RawLineupPlayer { player: { id: number; name: string; grid: string | null } }

export interface ApiFootballOptions {
  fetchImpl?: typeof fetch;
  /** Requêtes autorisées par jour (offre gratuite : 100). */
  dailyBudget?: number;
  /** Écart minimal entre deux requêtes (offre gratuite : ~10 requêtes / minute). */
  minIntervalMs?: number;
  /** Attente avant de réessayer quand la limite par minute est atteinte. */
  rateLimitWaitMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createApiFootballClient(apiKey: string, opts: ApiFootballOptions = {}) {
  const { fetchImpl = fetch, dailyBudget = 100, minIntervalMs = 6500, rateLimitWaitMs = 60_000 } = opts;
  let remaining = dailyBudget;
  let lastCall = 0;

  async function get<T>(path: string, retried = false): Promise<T> {
    if (remaining <= 0) throw new QuotaExhaustedError();
    remaining--;
    const wait = lastCall + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetchWithRetry(`${API_FOOTBALL_URL}${path}`, { headers: { 'x-apisports-key': apiKey } }, { fetchImpl });
    const header = res.headers.get('x-ratelimit-requests-remaining');
    if (header !== null && Number(header) < remaining) remaining = Number(header);
    const json = (await res.json()) as { errors: unknown; response: T };
    const errors = json.errors && typeof json.errors === 'object' && !Array.isArray(json.errors) ? (json.errors as Record<string, string>) : {};
    if (errors.requests) {
      remaining = 0;
      throw new QuotaExhaustedError();
    }
    if (errors.rateLimit && !retried) {
      await sleep(rateLimitWaitMs);
      return get<T>(path, true);
    }
    if (!res.ok || Object.keys(errors).length) throw new Error(`API-Football ${path}: ${JSON.stringify(json.errors) || res.status}`);
    return json.response;
  }

  return {
    async fixtures(leagueId: number, season: number): Promise<AfFixture[]> {
      const rows = await get<{ fixture: { id: number; date: string; status: { short: string } }; teams: { home: { id: number; name: string }; away: { id: number; name: string } } }[]>(
        `/fixtures?league=${leagueId}&season=${season}`);
      return rows.map((r) => ({
        id: r.fixture.id, date: r.fixture.date, status: r.fixture.status.short,
        homeTeamId: r.teams.home.id, awayTeamId: r.teams.away.id, homeName: r.teams.home.name, awayName: r.teams.away.name,
      }));
    },

    async lineups(fixtureId: number): Promise<AfLineup[]> {
      const rows = await get<{ team: { id: number }; formation: string | null; startXI: RawLineupPlayer[]; substitutes: RawLineupPlayer[] }[]>(
        `/fixtures/lineups?fixture=${fixtureId}`);
      const toPlayer = (started: boolean) => (p: RawLineupPlayer): AfLineupPlayer => ({
        playerId: p.player.id, name: p.player.name, grid: p.player.grid ?? null, started,
      });
      return rows.map((r) => ({
        teamId: r.team.id,
        formation: r.formation ?? null,
        players: [...(r.startXI ?? []).map(toPlayer(true)), ...(r.substitutes ?? []).map(toPlayer(false))],
      }));
    },

    remaining: () => remaining,
  };
}

export type ApiFootballClient = ReturnType<typeof createApiFootballClient>;
