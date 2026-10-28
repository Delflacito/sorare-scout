// Sonde du schéma Sorare (l'introspection est désactivée) : détaille TeamFormation (compo par match).
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

async function probe(label, wrap, candidates) {
  const result = {};
  for (const c of candidates) {
    const r = await gql(wrap(c));
    const msg = r.errors?.map((e) => e.message).join(' | ');
    if (!msg) result[c] = { ok: true, data: JSON.stringify(r.data).slice(0, 600) };
    else if (/doesn't exist on type/.test(msg) && !/Did you mean/.test(msg)) result[c] = 'absent';
    else result[c] = msg.slice(0, 300);
  }
  out.probes[label] = result;
}

async function sample(name, query) {
  const r = await gql(query);
  out.samples[name] = r.errors ? r.errors.map((e) => e.message).join(' | ').slice(0, 500) : r.data;
}

// Un match joué récent de PSG (ou du premier club de Ligue 1)
const clubs = await gql('{ football { competition(slug: "ligue-1-fr") { clubs(first: 50) { nodes { slug } } } } }');
const nodes = clubs.data?.football?.competition?.clubs?.nodes ?? [];
const clubSlug = nodes.find((c) => /paris-saint-germain/.test(c.slug))?.slug ?? nodes[0]?.slug;
const games = await gql(`{ football { club(slug: "${clubSlug}") { latestGames(first: 3) { nodes { id date statusTyped } } } } }`);
const fullId = games.data?.football?.club?.latestGames?.nodes?.find((g) => g.statusTyped === 'played')?.id;
const uuid = fullId?.replace(/^Game:/, '');
out.clubSlug = clubSlug;
out.gameId = fullId;

// Quel format d'identifiant accepte football.game ?
for (const id of [uuid, fullId]) await sample(`game-id-${id === uuid ? 'uuid' : 'full'}`, `{ football { game(id: "${id}") { date statusTyped homeGoals awayGoals homeTeam { slug } awayTeam { slug } } } }`);
const idOk = out.samples['game-id-uuid']?.football ? uuid : fullId;
const G = (sel) => `{ football { game(id: "${idOk}") { ${sel} } } }`;

// Noms volontairement approximatifs : Sorare répond « Did you mean … » avec les vrais champs proches.
await probe('TeamFormation', (c) => G(`homeFormation { ${c} }`), [
  'startingLineup', 'startingLineUp', 'starters', 'starting', 'bench', 'benchPlayers', 'substitutes', 'subs',
  'formation', 'formationName', 'formationType', 'display', 'code', 'type', 'value', 'shape', 'system', 'tactic',
  'lineup', 'lineups', 'players', 'rows', 'lines', 'positions', 'slots', 'grid', 'team', 'id', 'xyz',
]);
await probe('PlayerGameScore', (c) => G(`playerGameScores { ${c} }`), [
  'score', 'scoreStatus', 'positionTyped', 'position', 'formationPlace', 'detailedScore { category }', 'xyz',
]);
await probe('AnyPlayerGameStats', (c) => G(`playerGameScores { anyPlayerGameStats { ${c} } }`), [
  'minsPlayed', 'formationPlace', 'formationPosition', 'position', 'positionTyped', 'fieldPosition', 'gameStarted',
  'onGameSheet', 'substituteIn', 'team', 'teamSlug', 'xyz',
]);
await probe('AnyPlayer', (c) => G(`playerGameScores { anyPlayer { ${c} } }`), ['slug', 'displayName', 'anyPositions', 'position', 'positionTyped', 'xyz']);

// Échantillons bruts avec les champs les plus probables
await sample('formation-raw', G(`homeTeam { slug } homeFormation { startingLineup { slug displayName } bench { slug displayName } }`));
await sample('formation-raw-any', G(`homeFormation { startingLineup { ... on Player { slug displayName } } }`));
await sample('scores-raw', G(`playerGameScores { score anyPlayer { slug displayName anyPositions } anyPlayerGameStats { ... on PlayerGameStats { minsPlayed formationPlace } } }`));

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
