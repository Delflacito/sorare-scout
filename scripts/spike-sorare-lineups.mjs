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

// Plusieurs joueurs par requête : les alias de anyPlayer sont refusés (« Duplicated root field »).
const SL = '["kylian-mbappe-lottin", "vitinha"]';
for (const [k, q] of Object.entries({
  anyPlayers: `{ anyPlayers(slugs: ${SL}) { ... on Player { slug birthDate } } }`,
  anyPlayersNodes: `{ anyPlayers(slugs: ${SL}) { nodes { ... on Player { slug birthDate } } } }`,
  players: `{ players(slugs: ${SL}) { slug birthDate } }`,
  footballPlayers: `{ football { players(slugs: ${SL}) { slug birthDate } } }`,
  footballAnyPlayers: `{ football { anyPlayers(slugs: ${SL}) { ... on Player { slug birthDate } } } }`,
  footballPlayer: `{ football { a: player(slug: "kylian-mbappe-lottin") { slug } b: player(slug: "vitinha") { slug } } }`,
  rootXyz: '{ xyzPlayers }',
  footballXyz: '{ football { xyzPlayers } }',
})) await sample(k, q);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
