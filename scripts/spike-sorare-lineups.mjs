// Sonde du schéma Sorare (l'introspection est désactivée) : cherche la compo / le placement des joueurs par match.
// Pour chaque champ candidat, l'erreur GraphQL indique s'il existe et, pour un objet, le type qu'il renvoie.
// Lancé par le workflow « Spike API » ; écrit spike-output/sorare-probe.json.
import { mkdirSync, writeFileSync } from 'node:fs';

const KEY = process.env.SORARE_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { probes: {}, samples: {} };

async function gql(query) {
  await sleep(350);
  const res = await fetch('https://api.sorare.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { APIKEY: KEY } : {}) },
    body: JSON.stringify({ query }),
  });
  return res.json().catch(() => ({ errors: [{ message: `HTTP ${res.status}` }] }));
}

/** wrap(field) construit la requête ; renvoie { champ: 'absent' | 'scalaire' | message d'erreur (type, args…) }. */
async function probe(label, wrap, candidates) {
  const result = {};
  for (const c of candidates) {
    const r = await gql(wrap(c));
    const msg = r.errors?.map((e) => e.message).join(' | ');
    if (!msg) result[c] = { ok: true, data: JSON.stringify(r.data).slice(0, 400) };
    else if (/doesn't exist on type/.test(msg)) result[c] = 'absent';
    else result[c] = msg.slice(0, 300);
  }
  out.probes[label] = result;
  console.log(label, Object.entries(result).filter(([, v]) => v !== 'absent').map(([k]) => k).join(', '));
}

const clubs = await gql('{ football { competition(slug: "ligue-1-fr") { clubs(first: 50) { nodes { slug name } } } } }');
const clubSlug = clubs.data?.football?.competition?.clubs?.nodes?.find((c) => /paris-saint-germain/.test(c.slug))?.slug
  ?? clubs.data?.football?.competition?.clubs?.nodes?.[0]?.slug;
out.clubSlug = clubSlug;

const GAME_LISTS = ['latestGames', 'upcomingGames', 'games', 'lastGames', 'pastGames', 'recentGames', 'nextGames', 'lastFiveGames', 'gamesAsHome'];
await probe('Club', (c) => `{ football { club(slug: "${clubSlug}") { ${c} } } }`, [
  ...GAME_LISTS, 'slug', 'name', 'activePlayers', 'players', 'domesticLeague', 'activeCompetitions',
]);
await probe('Football', (c) => `{ football { ${c} } }`, ['game', 'games', 'club', 'player', 'competition', 'so5', 'anyGame', 'fixture', 'so5Fixture']);
await probe('Query', (c) => `{ ${c} }`, ['game', 'anyGame', 'football', 'so5', 'node', 'nodes', 'anyPlayer', 'player', 'club']);

// Récupère quelques ids de matchs joués, via la première liste qui fonctionne.
let gameIds = [];
for (const list of GAME_LISTS) {
  for (const args of ['(first: 5)', '(last: 5)', '']) {
    const r = await gql(`{ football { club(slug: "${clubSlug}") { ${list}${args} { id date status } } } }`);
    const r2 = r.errors ? await gql(`{ football { club(slug: "${clubSlug}") { ${list}${args} { nodes { id date status } } } } }`) : r;
    const raw = r2.data?.football?.club?.[list];
    const games = Array.isArray(raw) ? raw : raw?.nodes;
    if (games?.length) {
      out.samples.gameList = { list, args, games };
      gameIds = games.map((g) => g.id);
      break;
    }
    out.samples[`try-${list}${args}`] = (r2.errors ?? r.errors)?.map((e) => e.message).join(' | ')?.slice(0, 300);
  }
  if (gameIds.length) break;
}
const gameId = gameIds[0];
out.gameId = gameId;

if (gameId) {
  const GAME_FIELDS = [
    'id', 'date', 'status', 'statusTyped', 'homeTeam', 'awayTeam', 'homeGoals', 'awayGoals', 'competition', 'so5Fixture',
    'homeFormation', 'awayFormation', 'formation', 'formations', 'lineups', 'lineup', 'homeLineup', 'awayLineup',
    'startingLineup', 'homeStartingLineup', 'playerGameScores', 'playerGameStats', 'so5Scores', 'scores', 'players',
    'homePlayers', 'awayPlayers', 'gameStats', 'stats', 'events', 'periodType', 'minute', 'coverageStatus',
  ];
  for (const root of [(c) => `{ football { game(id: "${gameId}") { ${c} } } }`, (c) => `{ anyGame(id: "${gameId}") { ... on GameOfFootball { ${c} } } }`]) {
    await probe(`Game via ${root('X').slice(2, 20)}`, root, GAME_FIELDS);
  }
  // Échantillons bruts si les champs existent
  for (const [name, q] of Object.entries({
    formationStarting: `{ football { game(id: "${gameId}") { homeFormation { startingLineup { slug displayName } bench { slug } } awayFormation { startingLineup { slug displayName } } } } }`,
    formationName: `{ football { game(id: "${gameId}") { homeFormation { name formation display } } } }`,
    scoresMin: `{ football { game(id: "${gameId}") { playerGameScores { score anyPlayer { slug displayName position } } } } }`,
  })) {
    const r = await gql(q);
    out.samples[name] = r.errors ? r.errors.map((e) => e.message).join(' | ').slice(0, 400) : JSON.stringify(r.data).slice(0, 3000);
  }
  const STAT_FIELDS = [
    'minsPlayed', 'formationPlace', 'formation_place', 'position', 'positionTyped', 'detailedPosition', 'playingPosition',
    'onGameSheet', 'gameStarted', 'substituteIn', 'substituteOut', 'team', 'teamId', 'goals', 'totalCross', 'accuratePass',
  ];
  await probe('PlayerGameStats', (c) => `{ football { game(id: "${gameId}") { playerGameScores { playerGameStats { ${c} } } } } }`, STAT_FIELDS);
  await probe('PlayerGameScore', (c) => `{ football { game(id: "${gameId}") { playerGameScores { ${c} } } } }`, [
    'score', 'scoreStatus', 'decisiveScore', 'allAroundStats', 'detailedScore', 'playerGameStats', 'anyPlayer', 'player',
    'positionTyped', 'position', 'formationPlace', 'anyPlayerGameStats',
  ]);
}

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
