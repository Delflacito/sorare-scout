import { readFileSync } from 'node:fs';
import { createSorareClient } from '@/sources/sorare';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/sorare/${name}.json`, 'utf8'));

function fakeFetch(byQuery: [RegExp, unknown][]) {
  const requests: { headers: Headers; body: { query: string; variables: Record<string, unknown> } }[] = [];
  const impl = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ headers: new Headers(init?.headers), body });
    const hit = byQuery.find(([re]) => re.test(body.query));
    return new Response(JSON.stringify(hit ? hit[1] : { errors: [{ message: 'unexpected' }] }), { status: 200 });
  };
  return { impl: impl as typeof fetch, requests };
}

describe('client Sorare', () => {
  it('envoie la clé dans l’en-tête APIKEY et liste les clubs', async () => {
    const f = fakeFetch([[/clubs/, fixture('clubs')]]);
    const clubs = await createSorareClient('k3y', f.impl).clubs('ligue-1-fr');
    expect(clubs).toEqual([
      { slug: 'psg', name: 'Paris Saint-Germain', competitionSlug: 'ligue-1-fr' },
      { slug: 'om', name: 'Olympique de Marseille', competitionSlug: 'ligue-1-fr' },
    ]);
    expect(f.requests[0].headers.get('APIKEY')).toBe('k3y');
  });

  it('matchs d’un club : passés et à venir, statut normalisé', async () => {
    const f = fakeFetch([[/latestGames/, fixture('club-games')]]);
    const games = await createSorareClient('k', f.impl).clubGames('psg');
    expect(games).toEqual([
      { id: 'Game:1', date: '2026-10-25T19:00:00Z', homeClubSlug: 'psg', awayClubSlug: 'om', homeGoals: 2, awayGoals: 1, status: 'played' },
      { id: 'Game:0', date: '2026-10-18T19:00:00Z', homeClubSlug: 'lens', awayClubSlug: 'psg', homeGoals: null, awayGoals: null, status: 'postponed' },
      { id: 'Game:2', date: '2026-11-01T20:00:00Z', homeClubSlug: 'psg', awayClubSlug: 'lyon', homeGoals: null, awayGoals: null, status: 'scheduled' },
    ]);
  });

  it('scores d’un match', async () => {
    const f = fakeFetch([[/playerGameScores/, fixture('game-scores')]]);
    const scores = await createSorareClient('k', f.impl).gameScores('Game:1');
    expect(scores[0]).toEqual({
      playerSlug: 'nuno-mendes', displayName: 'Nuno Mendes', clubSlug: 'psg', position: 'Defender',
      score: 72.4, decisive: 35, allAround: 37.4, minutes: 90,
    });
    expect(scores[1]).toMatchObject({ playerSlug: 'theo-hernandez', clubSlug: 'om', decisive: 0, allAround: 0, minutes: 0 });
  });

  it('erreur GraphQL → exception explicite', async () => {
    const f = fakeFetch([]);
    await expect(createSorareClient('k', f.impl).clubs('x')).rejects.toThrow(/Sorare GraphQL: unexpected/);
  });
});
