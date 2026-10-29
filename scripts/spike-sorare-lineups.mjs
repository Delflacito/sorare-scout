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

// Requêtes réelles par lot (champ racine players) : profils et marché, 20 joueurs.
const roster = await gql('{ football { club(slug: "psg-paris") { activePlayers(first: 20) { nodes { slug } } } } }');
const slugs = (roster.data?.football?.club?.activePlayers?.nodes ?? []).map((n) => n.slug);
const SEASON_STATS = 'appearances substituteIn goals assists minutesPlayed yellowCards redCards';
const PRICE = 'seasonYear liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents wei } } }';
async function run(name, q) {
  const t = Date.now();
  const res = await fetch('https://api.sorare.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json', APIKEY: KEY },
    body: JSON.stringify({ query: q, variables: { slugs } }) });
  const j = await res.json();
  out.samples[name] = { ms: Date.now() - t, n: j.data?.players?.length, errors: j.errors?.map((e) => e.message).slice(0, 3), first: JSON.stringify(j.data?.players?.[0] ?? null).slice(0, 600) };
}
await run('profiles20', `query P($slugs: [String!]!) { players(slugs: $slugs) { ... on Player { slug firstName lastName height shirtNumber pictureUrl birthDate country { code name flagUrl } activeClub { slug name pictureUrl } s2026: stats(seasonStartYear: 2026) { ${SEASON_STATS} } s2025: stats(seasonStartYear: 2025) { ${SEASON_STATS} } } } }`);
await run('market20', `query M($slugs: [String!]!) { players(slugs: $slugs) { ... on Player { slug inSeason: lowestPriceAnyCard(rarity: limited, inSeason: true) { ${PRICE} } anySeason: lowestPriceAnyCard(rarity: limited, inSeason: false) { ${PRICE} } tokenPrices(rarity: limited, last: 30) { nodes { date amounts { eurCents usdCents wei } card { seasonYear } } } } } }`);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
