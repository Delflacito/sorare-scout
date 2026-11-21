# Sorare Scout

Outil personnel pour Sorare Football : scores potentiels, marché des cartes Limited, effectif et rentabilité.
Championnats suivis : voir `src/ingest/leagues.ts`. Indicateur central : **le score Sorare concédé par chaque équipe à chaque
poste précis**, calculé d'après le placement réel des joueurs dans les compositions.

- `/` : à faire avant la Game Week (cartes blessées, suspendues, incertaines) et raccourcis
- `/game-week`, `/journee` : meilleurs scores potentiels et ce que chaque adversaire concède
- `/joueurs`, `/joueurs/<slug>`, `/equipes/<slug>`, `/matchs/<id>` : explorateur et fiches
- `/trading`, `/marche` : cartes sous-évaluées, hausses attendues, prix par club
- `/effectif`, `/star`, `/otw`, `/roi`, `/streak` : mes cartes, collections, liste d'achats, rentabilité, préparation des streaks
- `/admin/imports` : état du dernier import

Les signaux (valeur estimée, score potentiel, projection Sorare) sont notés chaque jour dans `daily_snapshot` pour être
vérifiés après coup. Tests sur le passé : workflows « Backtest » et « Streaks » (résultats sur les branches
`backtest-results` et `streak-results`).

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

Le premier import récupère l'historique de la saison (une requête par match). Un match dont la compo n'est pas encore publiée est retenté aux imports suivants, puis abandonné après 5 essais.
Les erreurs éventuelles sont visibles dans `/admin/imports`.

Import automatique : le workflow `.github/workflows/ingest.yml` est planifié chaque jour (GitHub le démarre avec plusieurs heures de retard,
l'heure demandée en tient compte) ; `market.yml` rafraîchit tous les prix, lancé à la main (Actions → Marché des cartes → Run workflow). Créer dans GitHub
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
