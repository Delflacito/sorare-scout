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

// Prix plancher manquant (Ferri, Read) et ventes aux enchères.
const PR = 'slug seasonYear liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents wei } } }';
for (const slug of ['ignacio-ferri-julia', 'givairo-read']) {
  await sample(`floor-${slug}`, `{ anyPlayer(slug: "${slug}") { ... on Player {
    inSeason: lowestPriceAnyCard(rarity: limited, inSeason: true) { ${PR} }
    anySeason: lowestPriceAnyCard(rarity: limited, inSeason: false) { ${PR} }
    tokenPrices(rarity: limited, last: 3) { nodes { date amounts { eurCents } card { seasonYear } } }
  } } }`);
}
await probe('TokenPrice (type de vente)', (c) => `{ anyPlayer(slug: "givairo-read") { ... on Player { tokenPrices(rarity: limited, last: 2) { nodes { ${c} } } } } }`, [
  'deal { __typename }', 'xyzDeal', 'xyzAuction', 'auction', 'xyzType', 'xyzKind', 'xyzSource', 'primary', 'xyzPrimary',
]);
await probe('AnyCard (offres)', (c) => `{ anyPlayer(slug: "givairo-read") { ... on Player { lowestPriceAnyCard(rarity: limited, inSeason: true) { ${c} } } } }`, [
  'xyzAuction', 'liveAuction', 'xyzOffer', 'latestEnglishAuction { id }', 'xyzPrimary',
]);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
