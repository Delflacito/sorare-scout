# Résultats du spike (Task 0)

Statut : **en attente** — le spike ne peut pas tourner depuis l'environnement de développement (réseau bloqué
vers api.sorare.com et api-sports.io). À lancer sur une machine avec accès Internet : `node scripts/spike.mjs`.

| Question | Résultat | Valeur provisoire utilisée dans le code |
|---|---|---|
| (a) Sorare expose les compos ? | à vérifier | non — compos lues depuis API-Football |
| (b) Requêtes GraphQL Sorare | à vérifier | `src/sources/sorareQueries.ts` (écrites d'après la connaissance du schéma) |
| (c) Couverture / quota API-Football | à vérifier | budget 100 requêtes/jour |
| (d) `GRID_COL1_SIDE` | à vérifier | `'left'` (`src/domain/positions.ts`) |
