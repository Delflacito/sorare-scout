# Sorare Scout — Analyse des joueurs Sorare Football

Date : 2026-10-28
Statut : validé en conversation, en relecture

## 1. Objectif

Aider à composer ses équipes Sorare Football en analysant **tous les joueurs** (pas seulement sa galerie).
L'indicateur différenciant : **le score Sorare concédé par chaque équipe, par poste précis**, calculé à partir
du placement réel des joueurs dans les compositions des matchs récents
(ex. « moyenne des scores Sorare des latéraux gauches sur les 5 derniers matchs contre l'OM »).

### Critères de succès

- Pour un joueur donné, voir en un écran : scores récents, temps de jeu, détail du score, prochain match
  et ce que l'adversaire concède à son poste précis.
- Pour une équipe, voir ce qu'elle concède à chaque poste précis.
- Données à jour chaque jour sans intervention manuelle.

### Hors périmètre (V1)

- Comptes utilisateurs, connexion à la galerie Sorare, optimiseur automatique de lineup, aide au recrutement / prix.
- Ligues autres que le Big 5.

## 2. Hypothèses et contraintes

- Usage personnel, un seul utilisateur, pas d'authentification.
- Ligues V1 : Ligue 1, Premier League, LaLiga, Serie A, Bundesliga (saison en cours).
- Sources :
  - **API GraphQL Sorare** (`https://api.sorare.com/graphql`) — scores Sorare (total, Decisive Score, All-Around),
    joueurs, clubs, calendrier. Clé API Sorare recommandée pour les limites de débit.
  - **API-Football** (api-sports.io) — compositions : formation et position sur la grille (`grid` = `ligne:colonne`,
    ligne 1 = gardien) pour chaque match joué, minutes, titulaire/remplaçant.
- Quotas : l'offre gratuite d'API-Football est limitée (~100 requêtes/jour selon des sources tierces) : l'import
  doit être incrémental et ne jamais redemander un match déjà importé.

## 3. Étape 0 — Spike de faisabilité (avant tout développement)

Code jetable, résultats consignés dans `docs/spike-results.md`. Trois questions :

1. **L'API Sorare expose-t-elle les compositions** (formation et placement des joueurs par match) ?
   Si oui et exploitable : on supprime la dépendance à API-Football (architecture simplifiée, même modèle de données).
2. **L'offre API-Football choisie couvre-t-elle la saison en cours** avec les compositions et `grid` pour les 5 ligues ?
   Mesurer le nombre de requêtes nécessaires pour une journée et pour l'historique de la saison.
3. **Orientation de la grille** : pour une formation donnée, la colonne 1 correspond-elle au côté gauche ou droit
   du terrain ? Vérifier sur 3 matchs connus.

Si la question 2 échoue (offre gratuite insuffisante), on s'arrête et on choisit entre offre payante et autre source
(Sportmonks `formation_position`, TheStatsAPI) avant de continuer.

## 4. Architecture

```
 API Sorare ──┐                         ┌── Next.js (pages + routes API)
              ├─► Jobs d'import ─► Postgres (Supabase) ─┤
 API-Football ┘   (quotidien)           └── calculs agrégés (vues / tables matérialisées)
```

- **Next.js (TypeScript)**, rendu serveur, lit uniquement la base. Aucun appel aux API externes depuis les pages.
- **Postgres (Supabase)** comme stockage unique.
- **Jobs d'import** : scripts TypeScript lancés par un planificateur (cron quotidien, ex. GitHub Actions ou
  Supabase scheduled function). Chaque job est **idempotent** (upsert sur identifiants externes).
- **Calculs** : agrégats « concédé par équipe et par poste » recalculés après chaque import.

### Unités

| Unité | Rôle | Dépend de |
|---|---|---|
| `sources/sorare` | Client GraphQL Sorare, typé, avec gestion du débit | clé API |
| `sources/apiFootball` | Client REST API-Football, avec compteur de quota | clé API |
| `domain/positions` | Formation + grid → poste précis (fonction pure) | — |
| `domain/matching` | Rapprochement joueurs/clubs entre les deux sources (fonction pure + table de correspondance) | — |
| `domain/metrics` | Calculs L5/L15/L40, % titularisation, concédé par poste (fonctions pures) | — |
| `ingest/*` | Orchestration des imports, écriture en base | sources, domain, db |
| `db` | Schéma, migrations, requêtes | Postgres |
| `app/*` | Pages Next.js | db |

## 5. Modèle de données

- `competitions` (id, nom, ids Sorare / API-Football)
- `teams` (id, nom, `sorare_slug`, `apifootball_id`, competition_id)
- `players` (id, nom affiché, `sorare_slug`, `apifootball_id`, poste Sorare, team_id actuel)
- `fixtures` (id, date, competition_id, home/away team, score, `sorare_game_id`, `apifootball_fixture_id`,
  formation domicile / extérieur, statut)
- `appearances` (fixture_id, player_id, team_id, `grid`, `detailed_position`, titulaire, minutes,
  `sorare_score`, `decisive_score`, `all_around_score`)
- `unmatched_players` (source, identifiant externe, nom, club, fixture — file « à vérifier »)
- `team_conceded_by_position` (team_id, detailed_position, fenêtre N matchs, moyenne concédée, moyenne ligue,
  nb d'observations, date de calcul)

### Postes précis

`GK`, `LB`, `CB`, `RB`, `LWB`, `RWB`, `DM`, `CM`, `AM`, `LW`, `RW`, `ST` (affichés en français : G, DG, DC, DD,
PG, PD, MDC, MC, MOC, AG, AD, BU).

Règles de déduction (`domain/positions`) :
- Ligne 1 → `GK`.
- Ligne défensive (ligne 2) : colonnes extrêmes → `LB`/`RB` (ou `LWB`/`RWB` si défense à 3 + ligne de 5 au milieu),
  colonnes intérieures → `CB`.
- Lignes intermédiaires : selon la formation (ex. 4-2-3-1 : ligne 3 → `DM`, ligne 4 extrêmes → `LW`/`RW`,
  centre → `AM`).
- Dernière ligne → `ST` (ou `LW`/`RW` sur les extrémités d'une ligne de 3 attaquants).
- Table explicite par formation pour les formations courantes (4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2, 4-1-4-1,
  4-4-1-1, 3-4-2-1, 5-4-1) ; formation inconnue → repli sur le poste Sorare générique et log.
- Le sens gauche/droite dépend du résultat du spike (question 3).

## 6. Rapprochement entre sources (`domain/matching`)

1. Clubs : table de correspondance `sorare_slug ↔ apifootball_id`, créée une fois pour les 5 ligues (~96 clubs),
   pré-remplie automatiquement par nom normalisé puis vérifiée.
2. Matchs : même date (±1 jour) + mêmes clubs.
3. Joueurs : dans un match apparié, nom normalisé (accents, casse, tirets, prénoms abrégés) au sein du même club ;
   une fois lié, l'identifiant est mémorisé et réutilisé.
4. Échec → ligne dans `unmatched_players`, la participation est ignorée pour les calculs ; l'import continue.

## 7. Indicateurs (`domain/metrics`)

- **L5 / L15 / L40** : moyenne des scores Sorare sur les N derniers matchs de l'équipe du joueur
  (match sans participation compté 0, comme Sorare) + écart-type (régularité).
- **Temps de jeu** : % de titularisations et minutes moyennes sur 5 et 15 derniers matchs.
- **Détail du score** : moyenne Decisive et All-Around sur L5/L15.
- **Concédé par poste** : pour une équipe T et un poste P, moyenne des `sorare_score` des joueurs adverses ayant
  occupé P contre T sur les N derniers matchs de T (N = 5 par défaut, 10 en option), titulaires uniquement.
  Affiché avec la moyenne ligue pour P et un indice (concédé / moyenne ligue). Nombre d'observations affiché ;
  en dessous de 3 observations, indicateur grisé « échantillon faible ».

## 8. Pages

- **`/joueurs` — Explorateur** : recherche par nom ; filtres ligue, club, poste Sorare, poste précis habituel ;
  tri par L5, L15, L40, % titularisation, indice de l'adversaire au prochain match.
- **`/joueurs/[slug]` — Fiche joueur** : graphique des derniers scores (titulaire/remplaçant/absent distingués),
  L5/L15/L40, régularité, temps de jeu, détail Decisive/AA, postes précis occupés récemment,
  **prochain match** (adversaire, domicile/extérieur, ce que l'adversaire concède au poste habituel du joueur).
- **`/equipes/[slug]` — Fiche équipe** : terrain schématisé avec chaque poste précis coloré selon l'indice concédé,
  sélecteur de fenêtre (5/10 matchs) et liste des matchs utilisés.
- **`/admin/rapprochement`** : liste des joueurs non appariés et état du dernier import (sans authentification,
  usage local/personnel).

## 9. Gestion des erreurs

- Clients API : nouvelles tentatives avec attente croissante sur 429/5xx ; arrêt propre quand le quota quotidien
  d'API-Football est atteint (reprise à l'import suivant).
- Imports idempotents, transaction par match.
- Journal d'import (`import_runs` : début, fin, nb de matchs, erreurs) visible dans `/admin/rapprochement`.
- Les pages affichent la date des données et un état vide explicite si une donnée manque.

## 10. Tests

- Unitaires (Vitest) sur `domain/positions`, `domain/matching`, `domain/metrics` : cas par formation, noms
  avec accents/homonymes, fenêtres incomplètes.
- Intégration des imports avec des réponses d'API enregistrées (fichiers JSON) contre une base Postgres de test.
- Un test de rendu par page avec des données de démonstration.

## 11. Configuration

Variables d'environnement : `SORARE_API_KEY`, `API_FOOTBALL_KEY`, `DATABASE_URL`. Jamais commitées
(`.env.local`, `.env.example` fourni).
