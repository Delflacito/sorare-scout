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

// Marché : arguments et champs de tokenPrices, lowestPriceAnyCard, cardSupply.
const MP = (c) => `{ anyPlayer(slug: "kylian-mbappe-lottin") { ... on Player { ${c} } } }`;
const tries = {
  'tp-noargs': 'tokenPrices { nodes { date } }',
  'tp-rarity': 'tokenPrices(rarity: limited) { nodes { date } }',
  'tp-first': 'tokenPrices(rarity: limited, first: 5) { nodes { date amounts { eurCents } } }',
  'tp-node-xyz': 'tokenPrices(rarity: limited, first: 3) { nodes { xyzAmount xyzDate xyzCard xyzDeal } }',
  'tp-node-guess': 'tokenPrices(rarity: limited, first: 3) { nodes { id date amount amounts { eurCents usdCents wei } } }',
  'tp-args-xyz': 'tokenPrices(rarity: limited, first: 3, xyzSeason: true) { nodes { date } }',
  'lp-noargs': 'lowestPriceAnyCard { slug }',
  'lp-rarity': 'lowestPriceAnyCard(rarity: limited) { slug }',
  'lp-args-xyz': 'lowestPriceAnyCard(rarity: limited, xyzSeason: true) { slug }',
  'lp-fields-xyz': 'lowestPriceAnyCard(rarity: limited) { xyzPrice xyzOffer xyzSeason }',
  'lp-offer': 'lowestPriceAnyCard(rarity: limited) { slug seasonYear inSeasonEligible liveSingleSaleOffer { receiverSide { amounts { eurCents } } } }',
  'lp-offer2': 'lowestPriceAnyCard(rarity: limited) { slug liveSingleSaleOffer { xyzPrice xyzSide } }',
  'cs': 'cardSupply { xyz }',
  'cs2': 'cardSupply { limited season { startYear } }',
};
for (const [k, q] of Object.entries(tries)) await sample(k, MP(q));

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
