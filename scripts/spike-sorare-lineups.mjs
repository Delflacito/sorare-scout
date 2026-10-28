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

// Statuts de tous les joueurs d'un club en une requête, et projections des prochains matchs.
const PLAYER_FIELDS = 'slug displayName playingStatus activeInjuries { status kind expectedEndDate } activeSuspensions { reason endDate }';
await sample('club-players', `{ football { club(slug: "psg-paris") { activePlayers(first: 60) { nodes { ${PLAYER_FIELDS} nextClassicFixtureProjectedScore } } } } }`);
await sample('club-players-no-proj', `{ football { club(slug: "psg-paris") { activePlayers(first: 60) { totalCount pageInfo { hasNextPage } nodes { ${PLAYER_FIELDS} } } } } }`);
await sample('club-players-100', `{ football { club(slug: "psg-paris") { activePlayers(first: 100) { nodes { slug } } } } }`);
await sample('players-batch', `{ players(slugs: ["lamine-yamal-nasraoui-ebana", "desire-doue"]) { slug nextClassicFixtureProjectedScore playingStatus } }`);
await sample('anyPlayers-batch', `{ anyPlayers(slugs: ["lamine-yamal-nasraoui-ebana", "desire-doue"]) { ... on Player { slug nextClassicFixtureProjectedScore } } }`);
await probe('Query (lots de joueurs)', (c) => `{ ${c}(slugs: ["desire-doue"]) { slug } }`, ['players', 'anyPlayers', 'footballPlayers']);
// Projections des prochains matchs : celles des 5 prochains matchs du PSG
const next = await gql('{ football { club(slug: "psg-paris") { upcomingGames(first: 5) { id date } } } }');
out.samples.next = next.data;
for (const g of next.data?.football?.club?.upcomingGames ?? []) {
  await sample(`proj-${g.date}`, `{ football { game(id: "${g.id.replace(/^Game:/, '')}") { playerGameScores { anyPlayer { slug } projection { score grade } } } } }`);
}

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
