# Sorare Scout

Analyse des joueurs Sorare Football (Ligue 1, Premier League, LaLiga, Serie A, Bundesliga), avec un indicateur
central : **le score Sorare concédé par chaque équipe à chaque poste précis** (latéral gauche, axe, ailier…),
calculé d'après le placement réel des joueurs dans les compositions des matchs récents.

- `/joueurs` : explorateur (recherche, filtres ligue / poste / poste précis, tri L5 · L15 · L40 · % titu · indice adversaire)
- `/joueurs/<slug>` : fiche joueur (scores récents, temps de jeu, Decisive / All-Around, prochain match et ce que l'adversaire concède à son poste)
- `/equipes/<slug>` : terrain coloré des points concédés par poste (fenêtre 5 ou 10 matchs)
- `/admin/rapprochement` : état du dernier import et joueurs non appariés

Conception : `docs/superpowers/specs/2026-10-28-sorare-analyse-joueurs-design.md`.

## Prérequis

- Node.js 22+
- Une base Postgres (Supabase conseillé) avec l'extension `unaccent`
- Une clé API Sorare : https://sorare.com/settings/developer (envoyée dans l'en-tête `APIKEY`)
- Une clé API-Football : https://dashboard.api-football.com

## Installation

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés et DATABASE_URL
```

Appliquer les migrations (`supabase/migrations/*.sql`, dans l'ordre) : via `supabase db push`, ou
`for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done`.

## Vérifier les API (à faire une fois)

```bash
node scripts/spike.mjs
```

Le script écrit les réponses brutes dans `spike-output/`. Il sert à confirmer les requêtes GraphQL Sorare
(`src/sources/sorareQueries.ts`) et le sens de la grille API-Football (`GRID_COL1_SIDE` dans
`src/domain/positions.ts`). Voir `docs/spike-results.md`.

## Import des données

```bash
npm run ingest   # clubs (promotions / relégations), matchs, compos, scores, agrégats
```

L'offre gratuite d'API-Football étant limitée (~100 requêtes/jour, ~10/minute), l'import espace ses requêtes, s'arrête
proprement quand le quota est atteint et reprend au lancement suivant sans doublon. Les premiers jours servent donc à
rattraper l'historique de la saison. Un match dont la compo reste introuvable est abandonné après 5 tentatives.
Les clubs non appariés et les formations inconnues sont visibles dans `/admin/rapprochement` et dans le journal d'import.

Import automatique : le workflow `.github/workflows/ingest.yml` tourne chaque jour à 05:17 UTC. Créer dans GitHub
(Settings → Secrets and variables → Actions) les secrets `SORARE_API_KEY`, `API_FOOTBALL_KEY` et `DATABASE_URL`.

## Site

```bash
npm run dev     # http://localhost:3000
npm run build && npm start
```

## Tests

```bash
npm test          # tests unitaires + intégration
npm run typecheck
```

Les tests d'intégration utilisent `DATABASE_URL_TEST` (base Postgres jetable : elle est vidée à chaque test) et sont
ignorés si la variable est absente.
