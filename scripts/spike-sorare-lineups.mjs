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

// Galerie d'un utilisateur : vendeur d'une offre en cours, puis ses cartes.
const owner = await gql('{ tokens { liveSingleSaleOffers(playerSlug: "naif-aguerd", first: 1) { nodes { sender { ... on User { slug nickname } } senderSide { anyCards { slug user { slug nickname } } } } } } }');
out.samples.owner = owner.errors ? owner.errors.map((e) => e.message).join(' | ') : owner.data;
const slug = owner.data?.tokens?.liveSingleSaleOffers?.nodes?.[0]?.senderSide?.anyCards?.[0]?.user?.slug
  ?? owner.data?.tokens?.liveSingleSaleOffers?.nodes?.[0]?.sender?.slug ?? 'xyz';
for (const [k, q] of Object.entries({
  userCards: `{ user(slug: "${slug}") { slug nickname cards(first: 3) { nodes { slug rarityTyped seasonYear player { slug } } } } }`,
  userAnyCards: `{ user(slug: "${slug}") { slug anyCards(first: 3) { nodes { slug rarityTyped seasonYear anyPlayer { slug } } } } }`,
  userFootball: `{ user(slug: "${slug}") { slug footballCards(first: 3) { nodes { slug } } } }`,
  userCardsRarity: `{ user(slug: "${slug}") { anyCards(rarities: [limited], first: 3) { totalCount nodes { slug seasonYear } } } }`,
  userByNickname: `{ user(slug: "${slug}") { slug } nick: userByNickname(nickname: "${slug}") { slug } }`,
  purchase: `{ user(slug: "${slug}") { anyCards(first: 1) { nodes { slug latestPrimaryOffer { id } ownershipHistory { amounts { eurCents } from } } } } }`,
})) await sample(k, q);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
