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

// Marché : dernières ventes (last, season), carte vendue, prix plancher en ETH et taux de change.
const MP = (c) => `{ anyPlayer(slug: "kylian-mbappe-lottin") { ... on Player { ${c} } } }`;
const tries = {
  'tp-last': 'tokenPrices(rarity: limited, last: 5) { nodes { date amounts { eurCents } } }',
  'tp-season-int': 'tokenPrices(rarity: limited, last: 5, season: 2026) { nodes { date amounts { eurCents } } }',
  'tp-season-xyz': 'tokenPrices(rarity: limited, last: 2, season: xyz) { nodes { date } }',
  'tp-card': 'tokenPrices(rarity: limited, last: 3) { nodes { date card { slug seasonYear } } }',
  'tp-node-xyzc': 'tokenPrices(rarity: limited, last: 2) { nodes { xyzCard xyzSeason } }',
  'tp-args-xyz2': 'tokenPrices(rarity: limited, last: 2, xyzCollection: 1) { nodes { date } }',
  'lp-amounts': 'lowestPriceAnyCard(rarity: limited) { slug seasonYear liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents wei referenceCurrency } } } }',
  'lp-inseason': 'lowestPriceAnyCard(rarity: limited, inSeason: true) { slug seasonYear }',
  'lp-season': 'lowestPriceAnyCard(rarity: limited, season: 2026) { slug seasonYear }',
};
for (const [k, q] of Object.entries(tries)) await sample(k, MP(q));
await probe('Root (taux)', (c) => `{ ${c} }`, ['config { exchangeRate { id } }', 'config { xyzRate }', 'exchangeRate { id }', 'xyzExchange']);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
