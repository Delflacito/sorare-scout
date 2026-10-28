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

// Postes Sorare : anyPositions (ordre ? plusieurs ?) et champ de poste principal ; ordre des lignes de 5 (formationPlace).
for (const slug of ['timothy-weah', 'mats-wieffer', 'warren-zaire-emery', 'ainsley-maitland-niles', 'anthony-caci', 'achraf-hakimi']) {
  await sample(`pos-${slug}`, `{ anyPlayer(slug: "${slug}") { ... on Player { displayName anyPositions position activeClub { slug } } } }`);
}
await probe('Player (poste)', (c) => `{ anyPlayer(slug: "timothy-weah") { ... on Player { ${c} } } }`, ['position', 'xyzPosition', 'positions', 'cardPositions', 'activeClub { slug }', 'xyzClub']);
const mainz = await gql('{ football { club(slug: "mainz-05-mainz") { latestGames(first: 3) { nodes { id } } } } }');
for (const n of mainz.data?.football?.club?.latestGames?.nodes ?? []) {
  await sample(`lineup-${n.id}`, `{ football { game(id: "${n.id.replace(/^Game:/, '')}") {
    homeTeam { slug } homeFormation { startingLineup { slug displayName } }
    awayFormation { startingLineup { slug displayName } }
    playerGameScores { anyPlayer { slug } anyPlayerGameStats { ... on PlayerGameStats { formationPlace } } }
  } } }`);
}

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
