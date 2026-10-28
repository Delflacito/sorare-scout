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
const PAST_GAME = '1038dc4a-ca15-454a-b30a-dc7748e8be75'; // Angers – Lorient, joué

const PROJ = (game) => (c) => `{ football { game(id: "${game}") { playerGameScores { anyPlayer { slug } projection { ${c} } } } } }`;
const FIELDS = [
  'score', 'projectedScore', 'value', 'grade', 'decisiveScore', 'allAroundScore', 'averageScore', 'reliability', 'confidence',
  'startingProbability', 'startOdds', 'lineupStatus', 'playingStatus', 'minutes', 'expectedMinutes', 'status', 'xyzScore',
  'xyzProbability', 'xyzStatus', 'xyzMinutes', 'xyz',
];
await probe('Projection (à venir)', PROJ(NEXT_GAME), FIELDS);
await probe('Projection (match joué)', PROJ(PAST_GAME), FIELDS.slice(0, 6));
await probe('Injury', (c) => `{ anyPlayer(slug: "${PLAYER}") { ... on Player { injuries { ${c} } } } }`, [
  'status', 'kind', 'expectedEndDate', 'startDate', 'active', 'xyz',
]);
await probe('Player (statut)', (c) => `{ anyPlayer(slug: "${PLAYER}") { ... on Player { ${c} } } }`, [
  'playingStatus', 'xyzPlayingStatus', 'reliability', 'xyzReliability', 'startingProbability', 'nextGameStartingProbability',
]);
await sample('injuries-history', `{ anyPlayer(slug: "${PLAYER}") { ... on Player { injuries { status kind expectedEndDate startDate } } } }`);
// Échantillon de statuts de jeu dans un club
await sample('psg-statuses', `{ football { club(slug: "psg-paris") { activePlayers(first: 40) { nodes { slug playingStatus activeInjuries { status kind expectedEndDate } activeSuspensions { reason endDate } } } } } }`);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
