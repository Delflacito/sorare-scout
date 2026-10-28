# Sorare Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site web d'analyse des joueurs Sorare Football (Big 5) centré sur le score Sorare concédé par chaque équipe à chaque poste précis.

**Architecture:** Jobs d'import quotidiens (API Sorare + API-Football) → Postgres (Supabase) → Next.js en rendu serveur qui lit uniquement la base. Toute la logique métier (postes, rapprochement, indicateurs) vit dans des fonctions pures testées sous `src/domain`.

**Tech Stack:** Node 20+, TypeScript strict, Next.js 15 (App Router), Vitest, `postgres` (porsager) comme client SQL, migrations SQL Supabase, Recharts pour le graphique, GitHub Actions pour le cron.

**Spec:** `docs/superpowers/specs/2026-10-28-sorare-analyse-joueurs-design.md`

## Global Constraints

- Ligues V1 : Ligue 1, Premier League, LaLiga, Serie A, Bundesliga — saison en cours uniquement.
- Aucun appel aux API externes depuis les pages : les pages lisent uniquement la base.
- Imports idempotents (upsert sur identifiants externes), transaction par match ; ne jamais redemander à API-Football un match déjà importé.
- Postes précis : `GK, LB, CB, RB, LWB, RWB, DM, CM, AM, LW, RW, ST` ; libellés FR : G, DG, DC, DD, PG, PD, MDC, MC, MOC, AG, AD, BU.
- Concédé par poste : titulaires adverses uniquement, fenêtre N = 5 par défaut (10 en option), « échantillon faible » sous 3 observations.
- L5/L15/L40 : un match de l'équipe sans participation du joueur compte 0.
- Secrets uniquement via `SORARE_API_KEY`, `API_FOOTBALL_KEY`, `DATABASE_URL` ; `.env.local` ignoré par git, `.env.example` commité.
- Interface en français.

## Review Focus

- Joueur transféré en cours de saison : ses L5/L15 utilisent les matchs de **ses** participations par équipe du moment ; le test `metrics.lastN` couvre un changement de club (Task 4).
- Match reporté / sans compo publiée (formation `null`) : import sans erreur, aucune `appearance` à poste précis, le match n'entre pas dans les fenêtres concédées (Task 8).
- Homonymes dans un même club (ex. deux « Hernández ») : le rapprochement refuse un appariement ambigu et renvoie `null` → `unmatched_players` (Task 3).
- Quota API-Football épuisé au milieu d'un import : arrêt propre, `import_runs.status = 'quota_exhausted'`, reprise au run suivant sans doublon (Task 6 + Task 8).
- Équipe promue / peu de matchs : indicateur concédé avec < 3 observations affiché grisé, jamais de division par zéro sur la moyenne ligue (Task 4 + Task 11).

---

## File Structure

```
sorare-scout/
  .env.example
  package.json, tsconfig.json, next.config.ts, vitest.config.ts
  supabase/migrations/0001_init.sql        # schéma complet
  spike/                                   # Task 0, jetable
  docs/spike-results.md
  src/
    domain/
      types.ts           # DetailedPosition, GenericPosition, libellés FR
      positions.ts       # formation + grid → poste précis
      matching.ts        # normalisation des noms, appariement clubs/joueurs/matchs
      metrics.ts         # lastN, playingTime, scoreBreakdown, concededByPosition
    sources/
      http.ts            # fetch avec retries (429/5xx) + backoff
      sorare.ts          # client GraphQL Sorare
      apiFootball.ts     # client REST API-Football + compteur de quota
    db/
      client.ts          # instance `postgres`
      repo.ts            # upserts et lectures utilisées par ingest et pages
    ingest/
      clubs.ts           # import + table de correspondance des clubs
      fixtures.ts        # matchs, compos, participations, scores
      aggregates.ts      # recalcul team_conceded_by_position
      run.ts             # point d'entrée CLI (npm run ingest)
    app/
      layout.tsx, page.tsx (redirige vers /joueurs)
      joueurs/page.tsx
      joueurs/[slug]/page.tsx
      equipes/[slug]/page.tsx
      admin/rapprochement/page.tsx
    components/
      ScoreChart.tsx, Pitch.tsx, ConcededBadge.tsx
  tests/
    domain/*.test.ts
    sources/*.test.ts
    ingest/*.test.ts      # base de test, sautés si DATABASE_URL_TEST absent
    app/*.test.tsx
    fixtures/             # réponses d'API enregistrées (JSON)
  .github/workflows/ingest.yml
```

---

### Task 0: Spike de faisabilité (jetable)

Nécessite `SORARE_API_KEY` et `API_FOOTBALL_KEY` et un accès réseau à `api.sorare.com` et `v3.football.api-sports.io`. Code jetable dans `spike/`, non réutilisé.

**Files:**
- Create: `spike/sorare-introspect.ts`, `spike/apifootball-probe.ts`
- Create: `docs/spike-results.md`

- [ ] **Step 1:** `spike/sorare-introspect.ts` : requête d'introspection sur le type `Game` (football) et tout type nommé `*Formation*`/`*Lineup*` ; puis requête d'un match joué de Ligue 1 récent demandant formation et joueurs titulaires si les champs existent. Noter aussi : comment obtenir pour un match les scores Sorare par joueur (total, decisive, all-around), et les identifiants de compétition Big 5.
- [ ] **Step 2:** `spike/apifootball-probe.ts` : `GET /status` (plan, quota), `GET /leagues?id=61&current=true` (couverture `lineups` de la saison courante), `GET /fixtures/lineups?fixture=<id>` sur 3 matchs connus. Noter le nombre de requêtes par journée et pour l'historique de saison (≈ 1 requête `fixtures` par ligue + 1 `lineups` par match).
- [ ] **Step 3:** Orientation de la grille : sur les 3 matchs, comparer `grid` des latéraux connus (ex. un latéral gauche titulaire réputé) ; conclure `GRID_COL1_SIDE = 'left' | 'right'`.
- [ ] **Step 4:** Écrire `docs/spike-results.md` avec : (a) Sorare expose les compos oui/non + champs exacts ; (b) requêtes GraphQL Sorare retenues (texte complet) pour clubs, matchs d'une compétition, scores par joueur d'un match ; (c) couverture et quota API-Football ; (d) `GRID_COL1_SIDE`. **Décision :** si (a) = oui et exploitable, les Tasks 6 et le rapprochement des matchs (Task 3, `matchFixture`) sont supprimés et Task 8 lit la compo depuis Sorare ; si la couverture API-Football est insuffisante, STOP et demander à l'utilisateur.
- [ ] **Step 5:** Commit `docs: résultats du spike` (seulement `docs/spike-results.md`, `spike/` ajouté au `.gitignore`).

---

### Task 1: Squelette du projet

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/domain/types.ts`
- Test: `tests/domain/types.test.ts`

**Interfaces:**
- Produces (`src/domain/types.ts`):
  ```ts
  export const DETAILED_POSITIONS = ['GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST'] as const;
  export type DetailedPosition = typeof DETAILED_POSITIONS[number];
  export type GenericPosition = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward';
  export const POSITION_LABEL_FR: Record<DetailedPosition, string>; // GK→'G', LB→'DG', CB→'DC', RB→'DD', LWB→'PG', RWB→'PD', DM→'MDC', CM→'MC', AM→'MOC', LW→'AG', RW→'AD', ST→'BU'
  export const GENERIC_OF: Record<DetailedPosition, GenericPosition>;
  ```
- Scripts npm : `dev`, `build`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `ingest` (`tsx src/ingest/run.ts`).

- [ ] **Step 1:** Test `POSITION_LABEL_FR` couvre les 12 postes avec les libellés de la Global Constraints ; `GENERIC_OF.LWB === 'Defender'`, `GENERIC_OF.AM === 'Midfielder'`, `GENERIC_OF.LW === 'Forward'`.
- [ ] **Step 2:** Initialiser Next.js (App Router, TS strict, sans Tailwind obligatoire), Vitest, `tsx`, `postgres`. `.env.example` avec les 3 variables + `DATABASE_URL_TEST`. `.gitignore` : `node_modules`, `.next`, `.env*.local`, `spike/`.
- [ ] **Step 3:** Implémenter `types.ts`. `page.tsx` redirige vers `/joueurs`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → tout vert.
- [ ] **Step 5:** Commit `chore: squelette Next.js + Vitest`.

---

### Task 2: Déduction du poste précis

**Files:**
- Create: `src/domain/positions.ts`
- Test: `tests/domain/positions.test.ts`

**Interfaces:**
- Consumes: `DetailedPosition` (Task 1).
- Produces:
  ```ts
  export type GridSide = 'left' | 'right';
  export const GRID_COL1_SIDE: GridSide; // valeur issue de docs/spike-results.md
  export function detailedPosition(formation: string | null, grid: string | null, col1Side?: GridSide): DetailedPosition | null;
  ```
- Implémentation : table `FORMATIONS: Record<string, DetailedPosition[][]>` (lignes hors gardien, colonnes de gauche à droite). `grid` = `"ligne:colonne"`, ligne 1 = `GK`, ligne k+1 = `FORMATIONS[f][k-1]`. Si `col1Side === 'right'`, lire la ligne en miroir. Formation inconnue, `grid` absent/invalide ou hors bornes → `null`.

- [ ] **Step 1: Tests (table complète, `col1Side = 'left'`)** — pour chaque formation, chaque case attendue :
  | Formation | Lignes 2..n (gauche → droite) |
  |---|---|
  | 4-4-2 | `LB CB CB RB` / `LW CM CM RW` / `ST ST` |
  | 4-3-3 | `LB CB CB RB` / `CM CM CM` / `LW ST RW` |
  | 4-2-3-1 | `LB CB CB RB` / `DM DM` / `LW AM RW` / `ST` |
  | 3-5-2 | `CB CB CB` / `LWB CM CM CM RWB` / `ST ST` |
  | 3-4-3 | `CB CB CB` / `LWB CM CM RWB` / `LW ST RW` |
  | 5-3-2 | `LWB CB CB CB RWB` / `CM CM CM` / `ST ST` |
  | 4-1-4-1 | `LB CB CB RB` / `DM` / `LW CM CM RW` / `ST` |
  | 4-4-1-1 | `LB CB CB RB` / `LW CM CM RW` / `AM` / `ST` |
  | 3-4-2-1 | `CB CB CB` / `LWB CM CM RWB` / `AM AM` / `ST` |
  | 5-4-1 | `LWB CB CB CB RWB` / `LW CM CM RW` / `ST` |
  Plus : `detailedPosition('4-4-2','1:1') === 'GK'` ; `detailedPosition('4-3-3','2:1','right') === 'RB'` ; `detailedPosition('4-3-2-1','2:1') === null` ; `detailedPosition(null,'2:1') === null` ; `detailedPosition('4-4-2','7:1') === null` ; `detailedPosition('4-4-2','abc') === null`.
- [ ] **Step 2:** `npx vitest run tests/domain/positions.test.ts` → FAIL (module absent).
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Relancer → PASS.
- [ ] **Step 5:** Commit `feat(domain): déduction du poste précis depuis formation + grid`.

---

### Task 3: Rapprochement entre sources

**Files:**
- Create: `src/domain/matching.ts`
- Test: `tests/domain/matching.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeName(name: string): string; // minuscules, sans accents (NFD), tirets/apostrophes/points → espace, espaces compactés
  export interface Candidate { id: string; name: string }
  export function matchPlayer(name: string, roster: Candidate[]): string | null;
  export function matchClub(name: string, clubs: Candidate[]): string | null;
  export interface FixtureKey { id: string; date: string /* ISO */; homeTeamId: string; awayTeamId: string }
  export function matchFixture(target: Omit<FixtureKey,'id'>, candidates: FixtureKey[]): string | null;
  ```
- Règles `matchPlayer`, dans l'ordre, première règle donnant **exactement un** candidat gagne : (1) nom normalisé égal ; (2) nom de famille (dernier token) égal **et** initiale du prénom égale (`"K. Mbappé"` ↔ `"Kylian Mbappé"`) ; (3) l'ensemble des tokens de l'un inclus dans l'autre. Plusieurs candidats à une règle → `null` (pas de passage à la règle suivante).
- `matchClub` : mêmes règles après retrait des tokens `fc, cf, ac, as, sc, ssc, afc, rc, ogc, stade, club, de` ; table d'alias manuelle `CLUB_ALIASES: Record<string,string>` (normalisé → normalisé) appliquée d'abord, initialisée vide et complétée à la Task 7.
- `matchFixture` : mêmes équipes domicile/extérieur et écart de date ≤ 1 jour ; sinon `null`.

- [ ] **Step 1: Tests**
  - `normalizeName("Éder Militão") === "eder militao"`, `normalizeName("N'Golo  Kanté") === "n golo kante"`, `normalizeName("J.-C. Tuta") === "j c tuta"`.
  - `matchPlayer("K. Mbappé", [{id:'1',name:'Kylian Mbappé'},{id:'2',name:'Ethan Mbappé'}]) === '1'`.
  - Homonymes : `matchPlayer("Hernández", [{id:'1',name:'Theo Hernández'},{id:'2',name:'Lucas Hernández'}]) === null`.
  - `matchPlayer("Vinicius Junior", [{id:'9',name:'Vinícius Júnior'}]) === '9'`.
  - `matchClub("Paris Saint Germain", [{id:'psg',name:'Paris Saint-Germain'}]) === 'psg'` ; `matchClub("Olympique Marseille", [{id:'om',name:'Olympique de Marseille'}]) === 'om'`.
  - `matchFixture({date:'2026-10-25T19:00Z',homeTeamId:'a',awayTeamId:'b'}, [{id:'f',date:'2026-10-26T00:30Z',homeTeamId:'a',awayTeamId:'b'}]) === 'f'` ; même chose avec équipes inversées → `null` ; écart de 2 jours → `null`.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(domain): rapprochement joueurs/clubs/matchs`.

---

### Task 4: Indicateurs

**Files:**
- Create: `src/domain/metrics.ts`
- Test: `tests/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `DetailedPosition`.
- Produces:
  ```ts
  export interface TeamGame { fixtureId: string; date: string; teamId: string }          // matchs joués par l'équipe du joueur au moment du match
  export interface PlayerGame { fixtureId: string; started: boolean; minutes: number; score: number; decisive: number; allAround: number }
  export function lastN(teamGames: TeamGame[], played: PlayerGame[], n: number): { average: number; stdDev: number; games: number };
  export function playingTime(teamGames: TeamGame[], played: PlayerGame[], n: number): { startRate: number; avgMinutes: number };
  export function scoreBreakdown(teamGames: TeamGame[], played: PlayerGame[], n: number): { decisive: number; allAround: number };
  export interface ConcededObs { opponentTeamId: string; fixtureId: string; date: string; position: DetailedPosition; score: number; started: boolean }
  export interface Conceded { teamId: string; position: DetailedPosition; window: number; average: number | null; leagueAverage: number | null; index: number | null; observations: number; lowSample: boolean }
  export function concededByPosition(obs: ConcededObs[], teamFixtures: Record<string, string[]>, window: number): Conceded[];
  ```
- Sémantique : `teamGames` = les matchs des équipes successives du joueur (le transfert est géré par l'appelant qui fournit la liste chronologique) ; on prend les `n` plus récents par date ; un match sans `PlayerGame` compte score 0 / minutes 0 / non titulaire. `games` = nombre de matchs réellement pris (≤ n). `concededByPosition` : pour chaque équipe T (clé de `teamFixtures`, valeur = ses fixtureIds triés du plus récent au plus ancien), garde les `window` premiers, filtre `obs` sur ces matchs, `opponentTeamId === T`, `started === true` ; moyenne par poste. `leagueAverage` = moyenne de toutes les observations du poste retenues (toutes équipes). `index = average / leagueAverage` (null si l'un est null ou `leagueAverage === 0`). `lowSample = observations < 3`. Une ligne par (équipe, poste) ayant ≥ 1 observation.

- [ ] **Step 1: Tests**
  - `lastN` : 5 matchs d'équipe, joueur présent sur 3 avec scores 60, 40, 50 → `average === 30`, `games === 5` ; avec `n = 10` et 5 matchs dispo → `games === 5`.
  - Transfert : `teamGames` contenant 2 matchs club A puis 3 matchs club B (dates croissantes) et participations sur les 5 → L5 utilise les 5.
  - `playingTime` : 4 titularisations sur 5, minutes 90,90,90,45,0 → `startRate === 0.8`, `avgMinutes === 63`.
  - `concededByPosition` : équipe T, 2 matchs, LB adverses titulaires 70 et 50, un LB remplaçant 90 ignoré → `average === 60`, `observations === 2`, `lowSample === true` ; leagueAverage sur deux équipes calculée sur toutes les obs ; `leagueAverage === 0` → `index === null`.
  - Fenêtre : 7 matchs pour T, `window = 5` → seules les obs des 5 plus récents comptent.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter (stdDev = écart-type population).
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(domain): indicateurs L5/L15/L40, temps de jeu, concédé par poste`.

---

### Task 5: Schéma de base et dépôt

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/db/client.ts`, `src/db/repo.ts`
- Test: `tests/ingest/repo.test.ts` (sauté si `DATABASE_URL_TEST` absent)

**Interfaces:**
- Tables (cf. spec §5) : `competitions`, `teams`, `players`, `fixtures`, `appearances`, `unmatched_players`, `team_conceded_by_position`, `import_runs(id, started_at, finished_at, status text check in ('running','ok','error','quota_exhausted'), fixtures_imported int, errors jsonb)`.
- Contraintes d'unicité : `teams.sorare_slug`, `teams.apifootball_id`, `players.sorare_slug`, `players.apifootball_id`, `fixtures.sorare_game_id`, `fixtures.apifootball_fixture_id`, `appearances(fixture_id, player_id)`, `team_conceded_by_position(team_id, detailed_position, window_size)`, `unmatched_players(source, external_id, fixture_id)`.
- `appearances.detailed_position` : `text null check (detailed_position in (...12 postes...))`. `fixtures.lineups_imported boolean default false`.
- Produces (`repo.ts`) : `upsertTeam`, `upsertPlayer`, `upsertFixture`, `upsertAppearance`, `addUnmatched`, `replaceConceded(rows: Conceded[])`, `startRun(): Promise<number>`, `finishRun(id, status, fixturesImported, errors)`, `fixturesNeedingLineups(): Promise<{id, apifootballFixtureId}[]>`, et les lectures pour pages : `searchPlayers(filters)`, `getPlayer(slug)`, `getPlayerGames(playerId)`, `getTeamGames(teamIds, since)`, `getTeam(slug)`, `getConceded(teamId, window)`, `getNextFixture(teamId)`, `getUnmatched()`, `getLastRun()`. Chaque upsert renvoie l'id interne.

- [ ] **Step 1:** Test d'intégration : appliquer la migration sur une base vide ; `upsertTeam` deux fois avec le même `sorare_slug` → un seul enregistrement, même id ; `upsertAppearance` deux fois → une ligne ; `detailed_position = 'XX'` rejeté.
- [ ] **Step 2:** Lancer avec `DATABASE_URL_TEST` (Postgres local ou branche Supabase) → FAIL.
- [ ] **Step 3:** Écrire migration + repo (requêtes SQL paramétrées via `postgres`).
- [ ] **Step 4:** Lancer → PASS ; sans `DATABASE_URL_TEST` la suite est marquée skipped.
- [ ] **Step 5:** Commit `feat(db): schéma initial et dépôt`.

---

### Task 6: Clients API

**Files:**
- Create: `src/sources/http.ts`, `src/sources/sorare.ts`, `src/sources/apiFootball.ts`
- Create: `tests/fixtures/sorare/*.json`, `tests/fixtures/apifootball/*.json` (réponses réelles enregistrées pendant le spike)
- Test: `tests/sources/http.test.ts`, `tests/sources/sorare.test.ts`, `tests/sources/apiFootball.test.ts`

**Interfaces:**
- `http.ts` : `fetchWithRetry(url: string, init: RequestInit, opts?: { retries?: number /*4*/; baseDelayMs?: number /*2000*/ }): Promise<Response>` — retry sur 429 et 5xx, délai `baseDelayMs * 2^tentative`, respecte `Retry-After` s'il est présent.
- `sorare.ts` (requêtes GraphQL = celles notées dans `docs/spike-results.md` §b) :
  ```ts
  export interface SorareClub { slug: string; name: string; competitionSlug: string }
  export interface SorareGame { id: string; date: string; homeClubSlug: string; awayClubSlug: string; status: 'played' | 'scheduled' | 'postponed' }
  export interface SorarePlayerScore { playerSlug: string; displayName: string; clubSlug: string; position: GenericPosition; score: number; decisive: number; allAround: number; minutes: number }
  export function createSorareClient(apiKey: string, fetchImpl?: typeof fetch): {
    clubs(competitionSlug: string): Promise<SorareClub[]>;
    games(competitionSlug: string, from: string, to: string): Promise<SorareGame[]>;
    gameScores(gameId: string): Promise<SorarePlayerScore[]>;
  };
  ```
- `apiFootball.ts` :
  ```ts
  export class QuotaExhaustedError extends Error {}
  export interface AfFixture { id: number; date: string; homeTeamId: number; awayTeamId: number; homeName: string; awayName: string; status: string }
  export interface AfLineupPlayer { playerId: number; name: string; grid: string | null; started: boolean }
  export interface AfLineup { teamId: number; formation: string | null; players: AfLineupPlayer[] }
  export function createApiFootballClient(apiKey: string, fetchImpl?: typeof fetch, dailyBudget?: number /*100*/): {
    fixtures(leagueId: number, season: number): Promise<AfFixture[]>;
    lineups(fixtureId: number): Promise<AfLineup[]>;   // [] si non publiée
    remaining(): number;
  };
  ```
  Lève `QuotaExhaustedError` quand `remaining()` atteint 0 **avant** l'appel, ou quand l'en-tête `x-ratelimit-requests-remaining` vaut 0, ou sur une réponse dont `errors.requests` est non vide.
- Constantes Big 5 dans `apiFootball.ts` : `AF_LEAGUES = { ligue1: 61, premierLeague: 39, laliga: 140, serieA: 135, bundesliga: 78 }` ; slugs Sorare des compétitions dans `sorare.ts` d'après le spike.

- [ ] **Step 1: Tests** (fetch simulé renvoyant les JSON enregistrés) : `fetchWithRetry` réessaie deux 503 puis renvoie le 200, abandonne après 4 retries ; `sorare.gameScores` mappe la fixture JSON vers `SorarePlayerScore[]` (vérifier un joueur connu champ par champ) ; `apiFootball.lineups` mappe `grid`, `formation`, titulaires vs `substitutes` (`started=false`) ; budget 1 → deuxième appel lève `QuotaExhaustedError` sans appeler fetch ; lineups vides → `[]`.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(sources): clients Sorare et API-Football`.

---

### Task 7: Import des clubs et correspondance

**Files:**
- Create: `src/ingest/clubs.ts`
- Modify: `src/domain/matching.ts` (compléter `CLUB_ALIASES`)
- Test: `tests/ingest/clubs.test.ts`

**Interfaces:**
- Consumes: clients Task 6, `matchClub` Task 3, `upsertTeam` Task 5.
- Produces: `importClubs(deps: { sorare, apiFootball, repo }, season: number): Promise<{ matched: number; unmatched: { source: 'sorare'|'apifootball'; name: string }[] }>` — crée/actualise `competitions` et `teams` avec les deux identifiants.

- [ ] **Step 1:** Test avec clients simulés (fixtures JSON) et repo réel sur la base de test (suite sautée si `DATABASE_URL_TEST` absent) : 3 clubs Sorare / 3 clubs API-Football dont un nécessitant un alias → 3 appariés après ajout de l'alias ; un club sans correspondant → listé dans `unmatched`.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter ; lancer une fois en réel sur les 5 ligues, ajouter à `CLUB_ALIASES` chaque club non apparié jusqu'à 0 non apparié (~96 clubs).
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(ingest): import et correspondance des clubs`.

---

### Task 8: Import des matchs, compos et scores

**Files:**
- Create: `src/ingest/fixtures.ts`
- Test: `tests/ingest/fixtures.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6.
- Produces: `importFixtures(deps: { sorare, apiFootball, repo }, season: number): Promise<{ fixturesImported: number; status: 'ok' | 'quota_exhausted' }>`.
- Flux par ligue : (1) `sorare.games` de la saison → `upsertFixture` ; (2) `apiFootball.fixtures` (1 requête/ligue) → `matchFixture` pour renseigner `apifootball_fixture_id` ; (3) pour chaque match joué avec `lineups_imported = false` (`fixturesNeedingLineups`) : `lineups` + `gameScores`, dans **une transaction** : pour chaque joueur Sorare noté, `matchPlayer` contre la compo de son club → `upsertPlayer` (mémorise `apifootball_id`), `detailedPosition(formation, grid, GRID_COL1_SIDE)`, `upsertAppearance` ; non apparié → `addUnmatched` (participation enregistrée avec `detailed_position = null`) ; puis `lineups_imported = true`. Compo vide (`[]`) → match laissé à `lineups_imported = false` pour réessai. (4) `QuotaExhaustedError` → arrêt, renvoie `status: 'quota_exhausted'`, les matchs déjà commités restent.
- Joueur Sorare noté mais absent de la compo (minutes 0) → `upsertAppearance` avec `started=false`, `detailed_position=null`.

- [ ] **Step 1: Tests** (clients simulés, repo réel sur la base de test) : un match complet → N participations avec postes attendus (vérifier un LB et un ST) ; relancer l'import → aucun doublon, aucun appel `lineups` supplémentaire ; homonymes → ligne dans `unmatched_players` ; match reporté (compo `[]`) → `lineups_imported` reste false, pas d'erreur ; budget épuisé après 1 match sur 2 → `status 'quota_exhausted'`, 1 match importé, rerun importe le second.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(ingest): matchs, compos et scores Sorare`.

---

### Task 9: Agrégats et point d'entrée d'import

**Files:**
- Create: `src/ingest/aggregates.ts`, `src/ingest/run.ts`, `.github/workflows/ingest.yml`
- Test: `tests/ingest/aggregates.test.ts`

**Interfaces:**
- Produces: `recomputeConceded(repo): Promise<number>` (calcule `concededByPosition` pour `window` 5 et 10 par ligue, `replaceConceded`) ; `run.ts` : `startRun` → `importClubs` (si table `teams` vide ou option `--clubs`) → `importFixtures` → `recomputeConceded` → `finishRun(status, n, errors)`; toute exception → `finishRun('error', …)` puis code de sortie 1.
- Workflow : cron `17 5 * * *` (UTC) + `workflow_dispatch`, `npm ci && npm run ingest`, secrets `SORARE_API_KEY`, `API_FOOTBALL_KEY`, `DATABASE_URL`.

- [ ] **Step 1:** Test : base de test avec 2 équipes × 3 matchs et participations → `team_conceded_by_position` contient les lignes attendues pour window 5 (valeurs calculées à la main) ; recalcul idempotent.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer → PASS ; `npm run ingest` en réel termine avec `import_runs.status` ∈ {`ok`, `quota_exhausted`}.
- [ ] **Step 5:** Commit `feat(ingest): agrégats concédés, CLI et cron quotidien`.

---

### Task 10: Page explorateur `/joueurs`

**Files:**
- Create: `src/app/joueurs/page.tsx`
- Test: `tests/app/joueurs.test.tsx`

**Interfaces:**
- Consumes: `searchPlayers(filters: { q?: string; competition?: string; team?: string; position?: GenericPosition; detailedPosition?: DetailedPosition; sort: 'l5'|'l15'|'l40'|'startRate'|'nextIndex'; limit: 50; offset: number })` renvoyant `{ slug, name, team, position, usualDetailedPosition, l5, l15, l40, startRate, nextOpponent, nextIndex }[]` — calculs faits en SQL dans `repo.ts` (vue `player_summary` ajoutée par une migration `0002_player_summary.sql` qui reproduit les règles de `metrics.ts` ; un test vérifie l'égalité SQL vs `lastN` sur la base de test).
- Filtres via paramètres d'URL (formulaire GET, pas de JS requis). Poste habituel = poste précis le plus fréquent sur les 10 dernières participations titulaires.

- [ ] **Step 1:** Tests : rendu avec repo simulé → tableau avec colonnes L5, L15, L40, % titu, prochain adversaire, indice ; filtre `?position=Defender` transmis à `searchPlayers` ; liste vide → message « Aucun joueur ne correspond à ces filtres ». Test d'intégration vue SQL = `lastN`.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter page + migration 0002 + `searchPlayers`.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(app): explorateur de joueurs`.

---

### Task 11: Fiche joueur `/joueurs/[slug]`

**Files:**
- Create: `src/app/joueurs/[slug]/page.tsx`, `src/components/ScoreChart.tsx`, `src/components/ConcededBadge.tsx`
- Test: `tests/app/joueur.test.tsx`

**Interfaces:**
- Consumes: `getPlayer`, `getPlayerGames`, `getTeamGames`, `getNextFixture`, `getConceded` (Task 5) ; `lastN`, `playingTime`, `scoreBreakdown` (Task 4) ; `POSITION_LABEL_FR`.
- `ConcededBadge({ conceded: Conceded | null })` : affiche moyenne, moyenne ligue, indice ×100 arrondi ; `lowSample` → style grisé + texte « échantillon faible (n obs.) » ; `null` → « Pas encore de données ».
- `ScoreChart` (client, Recharts) : barres des 15 derniers matchs d'équipe, couleur titulaire / remplaçant / absent (absent = 0).

- [ ] **Step 1:** Tests : fiche avec données simulées affiche L5/L15/L40, % titu, Decisive/AA, postes récents en libellés FR, prochain match avec badge ; badge lowSample grisé ; joueur inconnu → `notFound()` ; pas de prochain match → « Aucun match programmé ».
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(app): fiche joueur`.

---

### Task 12: Fiche équipe `/equipes/[slug]`

**Files:**
- Create: `src/app/equipes/[slug]/page.tsx`, `src/components/Pitch.tsx`
- Test: `tests/app/equipe.test.tsx`

**Interfaces:**
- `Pitch({ cells: Partial<Record<DetailedPosition, Conceded>> })` : SVG d'un demi-terrain, 12 zones placées en dur (GK bas centre ; LB/LWB gauche, RB/RWB droite ; CB, DM, CM, AM centre en remontant ; LW/RW haut côtés ; ST haut centre). Couleur selon `index` : < 0,9 vert, 0,9–1,1 neutre, > 1,1 rouge ; `lowSample` → hachuré ; libellé FR + moyenne.
- Sélecteur `?fenetre=5|10` (défaut 5) ; liste des matchs utilisés sous le terrain.

- [ ] **Step 1:** Tests : 12 zones rendues ; LB index 1,3 → classe `hot` ; obs < 3 → classe `low-sample` ; `?fenetre=10` transmis à `getConceded` ; équipe inconnue → `notFound()`.
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter ; lien vers la fiche équipe depuis le prochain adversaire de la fiche joueur.
- [ ] **Step 4:** Lancer → PASS.
- [ ] **Step 5:** Commit `feat(app): fiche équipe avec terrain des points concédés`.

---

### Task 13: Page `/admin/rapprochement` et finitions

**Files:**
- Create: `src/app/admin/rapprochement/page.tsx`, `README.md`
- Modify: `src/app/layout.tsx` (navigation + date des données)
- Test: `tests/app/admin.test.tsx`

**Interfaces:**
- Consumes: `getUnmatched`, `getLastRun`.
- Layout : navigation Joueurs / Admin, pied de page « Données au <date du dernier import ok> ».

- [ ] **Step 1:** Tests : liste des non appariés (source, nom, club, match) ; dernier import affiché avec statut et nb de matchs ; statut `quota_exhausted` → message « Quota API-Football atteint, reprise au prochain import ».
- [ ] **Step 2:** Lancer → FAIL.
- [ ] **Step 3:** Implémenter ; README : prérequis, variables d'env, `npm run ingest`, création des secrets GitHub.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → vert.
- [ ] **Step 5:** Commit `feat(app): page de rapprochement, navigation, README`.
