// Sonde du schéma Sorare (l'introspection est désactivée) : blessures, suspensions, compos probables, projections.
// Pour chaque champ candidat, l'erreur GraphQL indique s'il existe et, pour un objet, le type qu'il renvoie ;
// des noms approximatifs font répondre « Did you mean … » avec les vrais champs proches.
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

async function probe(label, wrap, candidates) {
  const result = {};
  for (const c of candidates) {
    const r = await gql(wrap(c));
    const msg = r.errors?.map((e) => e.message).join(' | ');
    if (!msg) result[c] = { ok: true, data: JSON.stringify(r.data).slice(0, 800) };
    else if (/doesn't exist on type/.test(msg) && !/Did you mean/.test(msg)) result[c] = 'absent';
    else result[c] = msg.slice(0, 400);
  }
  out.probes[label] = result;
}

async function sample(name, query) {
  const r = await gql(query);
  out.samples[name] = r.errors ? r.errors.map((e) => e.message).join(' | ').slice(0, 600) : r.data;
}

const PLAYER = 'lamine-yamal-nasraoui-ebana';
const NEXT_GAME = 'b0b4da9b-1789-4b4c-bd51-54eef22ccd4a'; // prochain match à domicile du PSG

// Joueur : point d'entrée et champs de statut (blessure, suspension, compo probable, projection)
await probe('Racine joueur', (c) => `{ football { ${c}(slug: "${PLAYER}") { slug } } }`, ['player', 'anyPlayer']);
await probe('Racine joueur (Query)', (c) => `{ ${c}(slug: "${PLAYER}") { slug } }`, ['anyPlayer', 'player']);
const P = (sel) => `{ anyPlayer(slug: "${PLAYER}") { ... on Player { ${sel} } } }`;
await probe('Player', P, [
  'activeInjuries', 'injuries', 'injury', 'injured', 'activeSuspensions', 'suspensions', 'suspended', 'status', 'playerStatus',
  'playingStatus', 'availability', 'availabilityStatus', 'fitness', 'xyzInjury', 'xyzSuspension', 'xyzStatus',
  'nextGame', 'nextClassicFixtureProjectedScore', 'projectedScore', 'projection', 'projections', 'xyzProjection',
  'lastFiveSo5Appearances', 'startingProbability', 'lineupProbability', 'probableLineup', 'xyzProbability', 'xyzLineup',
  'averageScore', 'lastFifteenSo5AverageScore', 'so5Scores', 'xyzAverage',
]);
await sample('player-basic', P('slug displayName activeInjuries { status expectedEndDate kind } activeSuspensions { reason endDate }'));
await sample('player-injury-any', P('activeInjuries { __typename }'));
await sample('player-status', P('playingStatus'));
await sample('player-next', P('nextGame { id date } nextClassicFixtureProjectedScore'));

// Match à venir : compos probables, projections par joueur
const G = (sel) => `{ football { game(id: "${NEXT_GAME}") { ${sel} } } }`;
await probe('Game (à venir)', G, [
  'homeProbableLineup', 'probableLineups', 'probableLineup', 'expectedLineups', 'predictedLineups', 'homeFormation', 'xyzProbable',
  'xyzLineup', 'odds', 'bettingOdds', 'winProbability', 'homeWinProbability', 'xyzOdds', 'xyzProbability',
  'playerGameScores', 'projections', 'xyzProjection',
]);
await sample('game-next-formation', G('homeFormation { startingLineup { slug } bench { slug } }'));
await sample('game-next-pgs', G('playerGameScores { anyPlayer { slug } projectedScore scoreStatus }'));
await probe('PlayerGameScore (à venir)', (c) => G(`playerGameScores { anyPlayer { slug } ${c} }`), [
  'projectedScore', 'projection', 'expectedScore', 'xyzProjection', 'xyzExpected', 'scoreStatus', 'gameStarted', 'lineupStatus',
  'xyzLineup', 'xyzStarting',
]);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
