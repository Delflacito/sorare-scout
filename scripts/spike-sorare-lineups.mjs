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
const clubs = await gql('{ football { competition(slug: "ligue-1-fr") { clubs(first: 50) { nodes { slug name } } } } }');
const nodes = clubs.data?.football?.competition?.clubs?.nodes ?? [];
out.allClubs = nodes;
const clubSlug = nodes.find((c) => /paris/i.test(c.name) && /saint/i.test(c.name))?.slug ?? nodes[0]?.slug;
const games = await gql(`{ football { club(slug: "${clubSlug}") { latestGames(first: 3) { nodes { id date statusTyped } } } } }`);
const played = (games.data?.football?.club?.latestGames?.nodes ?? []).filter((g) => g.statusTyped === 'played');
out.playedGames = played;
const fullId = played[0]?.id;
const uuid = fullId?.replace(/^Game:/, '');
out.clubSlug = clubSlug;
out.gameId = fullId;

// Quel format d'identifiant accepte football.game ?
for (const id of [uuid, fullId]) await sample(`game-id-${id === uuid ? 'uuid' : 'full'}`, `{ football { game(id: "${id}") { date statusTyped homeGoals awayGoals homeTeam { slug } awayTeam { slug } } } }`);
const idOk = out.samples['game-id-uuid']?.football ? uuid : fullId;
const G = (sel) => `{ football { game(id: "${idOk}") { ${sel} } } }`;

// Remplaçant de Competition.clubs (obsolète)
const C = (sel) => `{ football { competition(slug: "ligue-1-fr") { ${sel} } } }`;
await probe('Competition', (c) => C(c), [
  'clubs', 'teams', 'clubList', 'participants', 'contestants', 'activeClubs', 'currentClubs', 'clubMemberships',
  'memberships', 'seasons', 'currentSeason', 'season', 'standings', 'leaderboard', 'games', 'upcomingGames', 'xyzClubs', 'xyz',
]);
await sample('teams', C('teams(first: 50) { nodes { slug name } }'));
await sample('teams-list', C('teams { slug name }'));
await sample('teams-any', C('teams(first: 50) { nodes { ... on Club { slug name } } }'));

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
