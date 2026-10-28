# Résultats du spike — API Sorare

Vérifié le 2026-10-28 sur l'API réelle (`https://api.sorare.com/graphql`) via le workflow GitHub « Spike API »
(`scripts/spike-sorare-lineups.mjs`, `scripts/check-sorare-key.mjs`). L'introspection GraphQL est désactivée ; le
schéma a été sondé champ par champ (Sorare suggère les noms proches : « Did you mean … »).

## Décision

**100 % Sorare.** Sorare expose la composition de chaque match : API-Football n'est plus utilisé.

## Champs utilisés

| Besoin | Champ |
|---|---|
| Clubs d'un championnat | `football.competition(slug).teams(first: 50) { nodes { ... on Club { slug name } } }` (`clubs` est obsolète) |
| Matchs d'un club | `football.club(slug).latestGames(first: N) { nodes { … } }` et `upcomingGames(first: N) { … }` |
| Champs d'un match | `id date statusTyped homeGoals awayGoals homeTeam { slug } awayTeam { slug } competition { slug }` |
| Détail d'un match | `football.game(id: "<uuid sans le préfixe Game:>")` |
| Compo | `homeFormation` / `awayFormation` : `startingLineup` (lignes du gardien à l'attaque) et `bench` |
| Scores | `playerGameScores { score anyPlayer { slug displayName anyPositions } anyPlayerGameStats { ... on PlayerGameStats { minsPlayed gameStarted formationPlace } } detailedScore { category stat totalScore } }` |

## Points vérifiés

- **Orientation** : dans `startingLineup`, chaque ligne est rangée **de droite à gauche** (Hakimi en premier, Nuno
  Mendes / Digne en dernier ; Yamal en premier chez Barcelone). Concorde avec `formationPlace` (numérotation standard :
  2 = latéral droit, 3 = latéral gauche, 7 = côté droit, 11 = côté gauche). → `GRID_COL1_SIDE = 'right'`.
- **Décisif / All-Around** : décisif = `level_score` (catégorie UNKNOWN) ; All-Around = somme des autres catégories hors
  `POSITIVE_DECISIVE_STAT` / `NEGATIVE_DECISIVE_STAT`. Exemple Doué 53,6 = 35 + 18,6.
- **Clé API** : envoyée dans l'en-tête `APIKEY`. Sans clé : 20 requêtes/min et complexité max 500 (la requête de détail
  d'un match dépasse 500) ; avec clé : 200 requêtes/min, complexité 30 000.
