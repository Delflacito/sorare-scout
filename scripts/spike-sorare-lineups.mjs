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

// Historique par saison : quelles compétitions couvre stats(seasonStartYear) ? que donnent careerSeasons / seasonAppearances ?
const P = (c) => `{ anyPlayer(slug: "kylian-mbappe-lottin") { ... on Player { ${c} } } }`;
await probe('stats (arguments)', (c) => P(`stats(seasonStartYear: 2024, ${c}) { appearances }`), [
  'competitionSlug: "laliga-es"', 'competitionSlugs: ["laliga-es"]', 'xyzCompetition: "x"', 'allCompetitions: true', 'xyzArg: 1',
]);
await probe('careerSeasons', P, ['careerSeasons { xyz }', 'careerSeasons']);
await probe('seasonAppearances', P, ['seasonAppearances { xyz }', 'seasonAppearances(seasonStartYear: 2024) { xyz }', 'seasonAppearances']);
await probe('Stats (autres champs)', (c) => P(`stats(seasonStartYear: 2024) { ${c} }`), [
  'xyzCompetition', 'competition { slug }', 'season { startYear }', 'xyzSeason', 'substituteIn', 'xyzSub', 'redCards', 'cleanSheet', 'xyzClean', 'team { slug }', 'xyzTeam',
]);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
