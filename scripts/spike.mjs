// Spike de faisabilité (Task 0) — à lancer sur une machine ayant accès à Internet :
//   node scripts/spike.mjs
// Lit .env.local, interroge Sorare et API-Football, écrit les réponses brutes dans spike-output/.
// Envoie ensuite le dossier spike-output/ (ou son contenu) pour finaliser docs/spike-results.md.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const out = new URL('../spike-output/', import.meta.url);
mkdirSync(out, { recursive: true });
const save = (name, data) => {
  writeFileSync(new URL(name, out), JSON.stringify(data, null, 2));
  console.log('écrit', name);
};

async function sorare(query, variables = {}) {
  const res = await fetch('https://api.sorare.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(env.SORARE_API_KEY ? { APIKEY: env.SORARE_API_KEY } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const typeQuery = (name) => `{ __type(name: "${name}") { name kind fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind ofType { name kind ofType { name } } } } } possibleTypes { name } } }`;

// 1. Schéma Sorare : types utiles
for (const t of ['Query', 'Football', 'Game', 'GameOfFootball', 'FootballGame', 'Formation', 'Club', 'Competition', 'So5Score', 'PlayerGameScore', 'PlayerGameScoreInterface', 'AnyPlayerInterface', 'Player', 'PlayerGameStats']) {
  save(`sorare-type-${t}.json`, await sorare(typeQuery(t)));
}
// Recherche de tout type lié aux compos
const all = await sorare('{ __schema { types { name kind } } }');
save('sorare-all-types.json', all);
const names = (all.body?.data?.__schema?.types ?? []).map((t) => t.name);
const lineupTypes = names.filter((n) => /formation|lineup|grid/i.test(n));
console.log('Types Sorare liés aux compos :', lineupTypes);
for (const t of lineupTypes.slice(0, 15)) save(`sorare-type-${t}.json`, await sorare(typeQuery(t)));

// 2. Essai de requête de données (peut échouer si le schéma diffère : l'erreur est instructive)
save('sorare-try-competition.json', await sorare(`{
  football { competition(slug: "ligue-1-fr") { slug displayName clubs(first: 3) { nodes { slug name } } } }
}`));

// 3. API-Football
async function af(path) {
  const res = await fetch(`https://v3.football.api-sports.io${path}`, { headers: { 'x-apisports-key': env.API_FOOTBALL_KEY } });
  return { status: res.status, remaining: res.headers.get('x-ratelimit-requests-remaining'), body: await res.json().catch(() => null) };
}
if (env.API_FOOTBALL_KEY) {
  save('af-status.json', await af('/status'));
  save('af-league-61.json', await af('/leagues?id=61&current=true'));
  const season = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const fx = await af(`/fixtures?league=61&season=${season}&last=3`);
  save('af-fixtures-61.json', fx);
  for (const f of (fx.body?.response ?? []).slice(0, 3)) {
    save(`af-lineups-${f.fixture.id}.json`, await af(`/fixtures/lineups?fixture=${f.fixture.id}`));
  }
} else {
  console.log('API_FOOTBALL_KEY absente : partie API-Football ignorée');
}
console.log('Terminé. Résultats dans spike-output/');
