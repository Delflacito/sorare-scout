// Vérifie que SORARE_API_KEY est présente et acceptée par Sorare (sans jamais l'afficher).
// Une requête de complexité > 500 n'est autorisée qu'avec une clé valide.
const KEY = process.env.SORARE_API_KEY ?? '';
console.log(`clé présente : ${KEY.length > 0}, longueur : ${KEY.length}, espaces autour : ${KEY !== KEY.trim()}`);
const query = `{ football { competition(slug: "ligue-1-fr") { clubs(first: 50) { nodes { slug latestGames(first: 10) { nodes { id } } } } } } }`;
for (const [label, headers] of [['sans clé', {}], ['avec clé', { APIKEY: KEY.trim() }]]) {
  const res = await fetch('https://api.sorare.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  const err = body?.errors?.map((e) => e.message).join(' | ');
  console.log(`${label} : HTTP ${res.status} — ${err ? `ERREUR ${err.slice(0, 200)}` : 'OK (requête lourde acceptée)'}`);
}
