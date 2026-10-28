import { readFileSync } from 'node:fs';
import { createApiFootballClient, QuotaExhaustedError } from '@/sources/apiFootball';

const FAST = { minIntervalMs: 0, rateLimitWaitMs: 1 };
const body = (name: string) => readFileSync(`tests/fixtures/apifootball/${name}.json`, 'utf8');

function fakeFetch(payload: string, headers: Record<string, string> = {}) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(payload, { status: 200, headers });
  }) as typeof fetch;
  return { impl, urls };
}

describe('client API-Football', () => {
  it('matchs d’une ligue', async () => {
    const f = fakeFetch(body('fixtures'));
    const fx = await createApiFootballClient('k', { fetchImpl: f.impl, ...FAST }).fixtures(61, 2026);
    expect(fx).toEqual([{ id: 1001, date: '2026-10-25T19:00:00+00:00', homeTeamId: 85, awayTeamId: 81, homeName: 'Paris Saint Germain', awayName: 'Marseille', status: 'FT' }]);
    expect(f.urls[0]).toContain('/fixtures?league=61&season=2026');
  });

  it('compos : formation, grid, titulaires et remplaçants', async () => {
    const f = fakeFetch(body('lineups'));
    const [psg, om] = await createApiFootballClient('k', { fetchImpl: f.impl, ...FAST }).lineups(1001);
    expect(psg.formation).toBe('4-3-3');
    expect(psg.teamId).toBe(85);
    expect(psg.players).toContainEqual({ playerId: 42, name: 'Nuno Mendes', grid: '2:1', started: true });
    expect(psg.players).toContainEqual({ playerId: 77, name: 'L. Hernández', grid: null, started: false });
    expect(om.formation).toBe('3-4-2-1');
  });

  it('compo non publiée → []', async () => {
    const f = fakeFetch('{"errors":[],"results":0,"response":[]}');
    expect(await createApiFootballClient('k', { fetchImpl: f.impl, ...FAST }).lineups(1)).toEqual([]);
  });

  it('budget épuisé → QuotaExhaustedError sans appel réseau', async () => {
    const f = fakeFetch(body('lineups'));
    const c = createApiFootballClient('k', { fetchImpl: f.impl, dailyBudget: 1, ...FAST });
    await c.lineups(1);
    expect(c.remaining()).toBe(0);
    await expect(c.lineups(2)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(f.urls).toHaveLength(1);
  });

  it('quota serveur à 0 (en-tête) → remaining 0', async () => {
    const f = fakeFetch(body('lineups'), { 'x-ratelimit-requests-remaining': '0' });
    const c = createApiFootballClient('k', { fetchImpl: f.impl, ...FAST });
    await c.lineups(1);
    await expect(c.lineups(2)).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('erreur "requests" → QuotaExhaustedError', async () => {
    const f = fakeFetch('{"errors":{"requests":"You have reached the request limit for the day"},"response":[]}');
    await expect(createApiFootballClient('k', { fetchImpl: f.impl, ...FAST }).lineups(1)).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('limite par minute atteinte : attend puis réessaie', async () => {
    const payloads = ['{"errors":{"rateLimit":"Too many requests"},"response":[]}', body('lineups')];
    let n = 0;
    const impl = (async () => new Response(payloads[n++], { status: 200 })) as typeof fetch;
    const lineups = await createApiFootballClient('k', { fetchImpl: impl, ...FAST }).lineups(1);
    expect(lineups).toHaveLength(2);
    expect(n).toBe(2);
  });

  it('espace les requêtes d’au moins minIntervalMs', async () => {
    const f = fakeFetch(body('lineups'));
    const c = createApiFootballClient('k', { fetchImpl: f.impl, minIntervalMs: 50, rateLimitWaitMs: 1 });
    const t0 = Date.now();
    await c.lineups(1);
    await c.lineups(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  });
});
