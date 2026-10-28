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

// Fiche joueur : naissance, nationalité, historique par saison, détail des actions décisives.
const P = (c) => `{ anyPlayer(slug: "kylian-mbappe-lottin") { ... on Player { ${c} } } }`;
await probe('Player (identité)', P, [
  'birthDate', 'age', 'country { code slug name }', 'country { flagUrl }', 'nationality', 'xyzCountry', 'birthPlace', 'height', 'preferredFoot',
]);
await probe('Player (saisons)', P, [
  'stats(seasonStartYear: 2024) { xyz }', 'xyzStats', 'seasonStats', 'careerStats', 'statsBySeason', 'seasons { xyz }',
  'clubMemberships { xyz }', 'memberships { xyz }', 'xyzMembership',
]);
await probe('Stats (champs)', (c) => P(`stats(seasonStartYear: 2024) { ${c} }`), [
  'appearances', 'goals', 'assists', 'minutesPlayed', 'gamesPlayed', 'xyzGoal', 'xyzAppear', 'xyzMinute', 'cleanSheets', 'yellowCards', 'xyzCard',
]);
await sample('player-identity', P('displayName birthDate age country { code slug name }'));
await sample('player-stats', P('s2025: stats(seasonStartYear: 2025) { appearances goals assists minutesPlayed } s2024: stats(seasonStartYear: 2024) { appearances goals assists minutesPlayed }'));
await sample('player-stats-all', P('stats(seasonStartYear: 2024) { __typename }'));
await probe('Membership (champs)', (c) => P(`clubMemberships(first: 3) { nodes { ${c} } }`), [
  'startDate', 'endDate', 'membershipTeam { slug name }', 'xyzTeam', 'xyzDate', 'club { slug }',
]);
// Détail du score : valeur de chaque statistique (nombre de buts, de passes…).
const G = (c) => `{ football { game(id: "${process.env.GAME_ID ?? ''}") { playerGameScores { detailedScore { ${c} } } } } }`;
const games = await gql('{ football { club(slug: "real-madrid-madrid") { latestGames(first: 1) { nodes { id } } } } }');
process.env.GAME_ID = games.data?.football?.club?.latestGames?.nodes?.[0]?.id?.replace(/^Game:/, '') ?? '';
await probe('DetailedScore (champs)', G, ['statValue', 'points', 'score', 'totalScore', 'xyzValue', 'xyzPoint']);
await sample('detailed-score', G('category stat statValue totalScore'));
await probe('PlayerGameStats (actions)', (c) => `{ football { game(id: "${process.env.GAME_ID}") { playerGameScores { anyPlayerGameStats { ... on PlayerGameStats { ${c} } } } } } }`, [
  'goals', 'goalAssist', 'assists', 'xyzGoal', 'xyzAssist', 'cleanSheet', 'yellowCard', 'redCard', 'xyzCard',
]);

mkdirSync('spike-output', { recursive: true });
writeFileSync('spike-output/sorare-probe.json', JSON.stringify(out, null, 2));
console.log('écrit spike-output/sorare-probe.json');
