# Sorare Scout

Analyse des joueurs Sorare Football (Ligue 1, Premier League, LaLiga, Serie A, Bundesliga), avec un indicateur
central : **le score Sorare concédé par chaque équipe à chaque poste précis** (latéral gauche, axe, ailier…),
calculé d'après le placement réel des joueurs dans les compositions des matchs récents.

- `/joueurs` : explorateur (recherche, filtres ligue / poste / poste précis, tri L5 · L15 · L40 · % titu · indice adversaire)
- `/joueurs/<slug>` : fiche joueur (scores récents, temps de jeu, Decisive / All-Around, prochain match et ce que l'adversaire concède à son poste)
- `/equipes/<slug>` : terrain coloré des points concédés par poste (fenêtre 5 ou 10 matchs)
- `/admin/imports` : état du dernier import

Conception : `docs/superpowers/specs/2026-10-28-sorare-analyse-joueurs-design.md`.

## Prérequis

- Node.js 22+
- Une base Postgres (Supabase conseillé) avec l'extension `unaccent`. Sur Supabase, utiliser l'adresse du
  **Transaction pooler** (bouton « Connect », port 6543) comme `DATABASE_URL`.
- Une clé API Sorare : https://sorare.com/settings/developer (envoyée dans l'en-tête `APIKEY`)

## Installation

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés et DATABASE_URL
```

Appliquer les migrations (`supabase/migrations/*.sql`, dans l'ordre) : via `supabase db push`, ou
`for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done`.

## Source des données

Tout vient de l'API Sorare, y compris la composition de chaque match (`homeFormation` / `awayFormation`), d'où l'on
déduit le poste précis de chaque titulaire. Détails : `docs/spike-results.md`. Le workflow « Spike API » (onglet
Actions) vérifie la clé et sonde le schéma ; il publie ses résultats sur la branche `spike-results`.

## Import des données

```bash
npm run ingest   # clubs (promotions / relégations), matchs, compos, scores, agrégats
```

Le premier import récupère l'historique de la saison (environ 1 800 matchs sur les 5 championnats, une requête par
match). Un match dont la compo n'est pas encore publiée est retenté aux imports suivants, puis abandonné après 5 essais.
Les erreurs éventuelles sont visibles dans `/admin/imports`.

Import automatique : le workflow `.github/workflows/ingest.yml` tourne chaque jour à 05:17 UTC. Créer dans GitHub
(Settings → Secrets and variables → Actions) les secrets `SORARE_API_KEY` et `DATABASE_URL`.

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
