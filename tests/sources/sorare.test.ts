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
    const f = fakeFetch([[/teams/, fixture('clubs')]]);
    const clubs = await createSorareClient('k3y', f.impl).clubs('ligue-1-fr');
    expect(clubs).toEqual([
      { slug: 'psg', name: 'Paris Saint-Germain', competitionSlug: 'ligue-1-fr' },
      { slug: 'om', name: 'Olympique de Marseille', competitionSlug: 'ligue-1-fr' },
    ]);
    expect(f.requests[0].headers.get('APIKEY')).toBe('k3y');
  });

  it('matchs d’un club : passés et à venir, compétition et statut normalisé', async () => {
    const f = fakeFetch([[/latestGames/, fixture('club-games')]]);
    const games = await createSorareClient('k', f.impl).clubGames('psg-paris');
    expect(games.map((g) => [g.id, g.competitionSlug, g.status, g.homeClubSlug, g.awayClubSlug, g.homeGoals])).toEqual([
      ['Game:aaa', 'ligue-1-fr', 'played', 'psg-paris', 'olympique-lyonnais-lyon', 2],
      ['Game:bbb', 'champions-league-europe', 'played', 'psg-paris', 'barcelona-barcelona', 1],
      ['Game:ccc', 'ligue-1-fr', 'postponed', 'lens-lens', 'psg-paris', null],
      ['Game:ddd', 'ligue-1-fr', 'scheduled', 'psg-paris', 'marseille-marseille', null],
    ]);
  });

  it('détail d’un match : compos, scores, décisif et All-Around', async () => {
    const f = fakeFetch([[/startingLineup/, fixture('game-detail')]]);
    const d = await createSorareClient('k', f.impl).gameDetail('Game:aaa');
    expect(f.requests[0].body.variables).toEqual({ id: 'aaa' });
    expect(d.home.starting.map((r) => r.length)).toEqual([1, 4, 3, 3]);
    expect(d.home.starting[1][0]).toEqual({ slug: 'achraf-hakimi', displayName: 'Achraf Hakimi' });
    expect(d.home.bench).toEqual([{ slug: 'lee-kang-in', displayName: 'Lee Kang-in' }]);
    expect(d.scores[0]).toEqual({
      playerSlug: 'desire-doue', displayName: 'Désiré Doué', position: 'Forward',
      score: 53.6, decisive: 35, allAround: 18.6, minutes: 90, started: true,
    });
    expect(d.scores[1]).toMatchObject({ playerSlug: 'lee-kang-in', minutes: 20, started: false, decisive: 0, allAround: 0 });
    expect(d.scores[2]).toMatchObject({ playerSlug: 'absent-player', minutes: 0, started: false });
  });

  it('erreur GraphQL → exception explicite', async () => {
    const f = fakeFetch([]);
    await expect(createSorareClient('k', f.impl).clubs('x')).rejects.toThrow(/Sorare GraphQL: unexpected/);
  });
});
