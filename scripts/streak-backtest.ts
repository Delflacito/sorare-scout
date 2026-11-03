// Rentabilité des streaks par championnat, rejouée sur les journées passées de la saison.
// Pour chaque budget : on achète aujourd'hui (prix planchers actuels) un effectif, puis, journée après journée, on aligne
// l'équipe qu'on aurait choisie AVANT les matchs (forme des 15 derniers matchs du club), on prend les VRAIS scores Sorare,
// les bonus (cartes + capitaine +50 %) et on fait gravir l'échelle des streaks (réussite : palier suivant ; échec : retour à 320).
// Lancé par le workflow « Streaks » ; écrit streak-output/streaks.md et streaks.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { competitionGroup } from '@/lib/competitions';

config({ path: '.env.local', quiet: true });
const sql = getSql();

type Pos = 'G' | 'D' | 'M' | 'F';
type Tier = [score: number, eur: number, essence: number];
// Barème fourni par l'utilisateur (euros ; essence pour les paliers sans euros).
const T = (rows: [number, number, number][]): Tier[] => rows;
const MID = T([[320, 0, 500], [360, 3, 0], [380, 5, 0], [410, 25, 0], [440, 100, 0], [460, 1000, 0]]);
const CONT = T([[320, 0, 500], [360, 0, 1000], [380, 2, 0], [410, 10, 0], [440, 50, 0], [460, 500, 0]]);
const BIG = T([[320, 0, 500], [360, 5, 0], [380, 10, 0], [420, 50, 0], [440, 300, 0], [470, 1500, 0], [550, 8000, 0]]);
const LEAGUES: Record<string, { name: string; tiers: Tier[] }> = {
  'premier-league-gb-eng': { name: 'Premier League', tiers: T([[320, 0, 500], [360, 5, 0], [380, 10, 0], [400, 50, 0], [430, 400, 0], [450, 2000, 0], [550, 10000, 0]]) },
  'laliga-es': { name: 'LaLiga', tiers: BIG },
  'bundesliga-de': { name: 'Bundesliga', tiers: BIG },
  'ligue-1-fr': { name: 'Ligue 1', tiers: T([[320, 0, 500], [360, 5, 0], [380, 10, 0], [410, 50, 0], [440, 300, 0], [460, 1500, 0], [550, 8000, 0]]) },
  'primeira-liga-pt': { name: 'Primeira Liga', tiers: MID },
  eredivisie: { name: 'Eredivisie', tiers: MID },
  'jupiler-pro-league': { name: 'Jupiler Pro League', tiers: MID },
  'premiership-gb-sct': { name: 'Écosse', tiers: CONT },
  'football-league-championship': { name: 'Championship', tiers: CONT },
  contender: { name: 'Contender', tiers: CONT },
};
const BUDGETS = [10, 20, 40, 80, 150, 300, 600, 1200];
const BONUSES = [0.11, 0.15]; // collection 3-5 % + saison 5 % + XP 3-5 %
const CAPTAIN = 0.5;
const FORM_GAMES = 15;
const RESALE = 0.7; // shortcut: valeur de revente en fin de saison supposée à 70 % du prix d'achat, à affiner avec l'historique des prix.
const SEASON_END = Date.parse('2027-05-24T00:00:00Z');

// ——— Données ———
const players = (await sql`
  select p.id, p.name, p.team_id, c.slug, coalesce(p.card_positions[1], p.position) as pos, p.floor_in_season as price, s.l15
  from players p join teams t on t.id = p.team_id join competitions c on c.id = t.competition_id and c.is_league
  left join player_summary s on s.player_id = p.id`).map((r) => ({
  id: r.id as number, name: r.name as string, team: r.team_id as number, league: competitionGroup(r.slug as string),
  pos: (r.pos as string)?.[0] as Pos, price: r.price as number | null, l15: (r.l15 as number | null) ?? 0,
})).filter((p) => LEAGUES[p.league] && p.pos);
const fixtures = (await sql`
  select f.id, f.date, f.home_team_id, f.away_team_id, c.slug from fixtures f join competitions c on c.id = f.competition_id and c.is_league
  where f.status = 'played' and f.lineups_imported and f.date >= '2026-08-01' order by f.date`).map((r) => ({
  id: r.id as number, date: r.date as Date, home: r.home_team_id as number, away: r.away_team_id as number, league: competitionGroup(r.slug as string),
})).filter((f) => LEAGUES[f.league]);
const scores = new Map<string, number>(); // `${fixture}:${player}` → score
for (const a of await sql`select a.fixture_id, a.player_id, a.sorare_score from appearances a join fixtures f on f.id = a.fixture_id
  where f.status = 'played' and f.date >= '2026-08-01'`) scores.set(`${a.fixture_id}:${a.player_id}`, a.sorare_score as number);

/** Journée Sorare d'un match : week-end (vendredi → lundi, repérée par son vendredi) ou semaine (mardi → jeudi). */
function gwKey(d: Date): string {
  const paris = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const day = paris.getDay(); // 0 dimanche … 6 samedi
  const midweek = day >= 2 && day <= 4;
  const back = midweek ? day - 2 : (day + 2) % 7; // retour au mardi, ou au vendredi
  const anchor = new Date(paris.getFullYear(), paris.getMonth(), paris.getDate() - back);
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(anchor.getDate()).padStart(2, '0')}${midweek ? ' sem.' : ' w-e'}`;
}

// Par championnat : journées dans l'ordre, et pour chaque club ses matchs (pour la forme et la disponibilité).
interface Gw { key: string; fixtureOfTeam: Map<number, number> }
const gwsByLeague = new Map<string, Gw[]>();
const teamGames = new Map<number, { fixture: number; gw: string }[]>();
for (const f of fixtures) {
  const key = gwKey(f.date);
  const list = gwsByLeague.get(f.league) ?? [];
  let gw = list.find((g) => g.key === key);
  if (!gw) { gw = { key, fixtureOfTeam: new Map() }; list.push(gw); }
  for (const t of [f.home, f.away]) {
    if (!gw.fixtureOfTeam.has(t)) gw.fixtureOfTeam.set(t, f.id);
    teamGames.set(t, [...(teamGames.get(t) ?? []), { fixture: f.id, gw: key }]);
  }
  gwsByLeague.set(f.league, list);
}
for (const list of gwsByLeague.values()) list.sort((a, b) => a.key.localeCompare(b.key));

/** Forme avant une journée : moyenne des 15 derniers matchs du club (0 si le joueur n'a pas joué). */
function formBefore(p: (typeof players)[number], gw: string): number {
  const past = (teamGames.get(p.team) ?? []).filter((g) => g.gw < gw).slice(-FORM_GAMES);
  return past.length ? past.reduce((t, g) => t + (scores.get(`${g.fixture}:${p.id}`) ?? 0), 0) / past.length : 0;
}

// ——— Effectif acheté pour un budget ———
type Card = (typeof players)[number];
/** Équipe de 5 (G, D, M, A + extra de champ) au meilleur L15 (capitaine compris) pour un budget, parmi les titulaires probables. */
function bestFive(pool: Card[], budget: number, bonus: number): Card[] {
  const byPos = (k: Pos) => pool.filter((p) => p.pos === k);
  // Front de Pareto par poste : pas d'autre joueur à la fois moins cher et meilleur.
  const front = (list: Card[]) => list.filter((p) => !list.some((q) => q !== p && q.price! <= p.price! && q.l15 >= p.l15 && (q.price! < p.price! || q.l15 > p.l15)));
  const G = front(byPos('G')), D = front(byPos('D')), M = front(byPos('M')), F = front(byPos('F'));
  // Extra : le meilleur joueur de champ encore abordable (un meilleur L15 ne fait jamais baisser le score, capitaine compris).
  const outfield = pool.filter((p) => p.pos !== 'G').sort((a, b) => b.l15 - a.l15);
  let best: { v: number; team: Card[] } | null = null;
  for (const g of G) for (const d of D) for (const m of M) for (const f of F) {
    const cost = g.price! + d.price! + m.price! + f.price!;
    if (cost > budget) continue;
    const x = outfield.find((p) => p !== d && p !== m && p !== f && cost + p.price! <= budget);
    if (!x) continue;
    const team = [g, d, m, f, x];
    const v = team.reduce((t, p) => t + p.l15, 0) * (1 + bonus) + CAPTAIN * Math.max(...team.map((p) => p.l15));
    if (!best || v > best.v) best = { v, team };
  }
  return best?.team ?? [];
}

/** Effectif : l'équipe de 5 avec ~75 % du budget, le reste en remplaçants (meilleur L15 par poste encore abordable). */
function squad(pool: Card[], budget: number, bonus: number, depth: boolean): Card[] {
  const five = bestFive(pool, depth ? budget * 0.75 : budget, bonus);
  if (!depth || !five.length) return five;
  let left = budget - five.reduce((t, p) => t + p.price!, 0);
  const owned = [...five];
  for (const k of ['G', 'D', 'M', 'F', 'D', 'M', 'F'] as Pos[]) {
    const pick = pool.filter((p) => p.pos === k && !owned.includes(p) && p.price! <= left).sort((a, b) => b.l15 - a.l15)[0];
    if (pick) { owned.push(pick); left -= pick.price!; }
  }
  return owned;
}

// ——— Rejeu des journées ———
function lineupScore(owned: Card[], gw: Gw, bonus: number): number {
  const avail = owned.filter((p) => gw.fixtureOfTeam.has(p.team)).map((p) => ({ p, form: formBefore(p, gw.key) }));
  const pick: typeof avail = [];
  for (const k of ['G', 'D', 'M', 'F'] as Pos[]) {
    const c = avail.filter((a) => a.p.pos === k).sort((a, b) => b.form - a.form)[0];
    if (c) pick.push(c);
  }
  const extra = avail.filter((a) => a.p.pos !== 'G' && !pick.includes(a)).sort((a, b) => b.form - a.form)[0];
  if (extra) pick.push(extra);
  if (!pick.length) return 0;
  const actual = (a: (typeof avail)[number]) => scores.get(`${gw.fixtureOfTeam.get(a.p.team)}:${a.p.id}`) ?? 0;
  const captain = pick.reduce((b, a) => (a.form > b.form ? a : b));
  return pick.reduce((t, a) => t + actual(a), 0) * (1 + bonus) + CAPTAIN * actual(captain);
}

/** Gain moyen par journée sur une échelle de streaks, avec la probabilité de franchir chaque palier. */
function ladder(p: number[], tiers: Tier[]): { eur: number; essence: number } {
  const n = tiers.length; const N = 2000;
  let dist = [1, ...Array(n - 1).fill(0)]; let eur = 0; let essence = 0;
  for (let s = 0; s < N; s++) {
    const next = Array(n).fill(0);
    dist.forEach((q, i) => { eur += q * p[i] * tiers[i][1]; essence += q * p[i] * tiers[i][2]; next[(i + 1) % n] += q * p[i]; next[0] += q * (1 - p[i]); });
    dist = next;
  }
  return { eur: eur / N, essence: essence / N };
}

/** Parcours réel journée après journée : ce que l'échelle aurait rapporté cette saison. */
function realized(totals: number[], tiers: Tier[]) {
  let level = 0; let eur = 0; let essence = 0; const reached: number[] = [];
  for (const t of totals) {
    if (t >= tiers[level][0]) { eur += tiers[level][1]; essence += tiers[level][2]; reached.push(tiers[level][0]); level = (level + 1) % tiers.length; }
    else level = 0;
  }
  return { eur, essence, reached };
}

// ——— Calcul ———
const now = Date.now();
const results: Record<string, unknown>[] = [];
const md: string[] = ['# Rentabilité des streaks rejouée sur la saison', '',
  `Calcul du ${new Date().toISOString().slice(0, 10)}. Prix d'achat : planchers actuels. Bonus de carte ${BONUSES.map((b) => `${b * 100} %`).join(' / ')}, capitaine +50 %.`,
  `Revente supposée en fin de saison : ${RESALE * 100} % du prix d'achat. Journées restantes estimées d'après le rythme observé jusqu'au ${new Date(SEASON_END).toISOString().slice(0, 10)}.`, ''];
for (const [league, { name, tiers }] of Object.entries(LEAGUES)) {
  const gws = gwsByLeague.get(league) ?? [];
  if (gws.length < 4) continue;
  const firstGw = Date.parse(gws[0].key.slice(0, 10));
  const rate = gws.length / ((now - firstGw) / (7 * 86_400_000)); // journées par semaine
  const remaining = Math.round(rate * (SEASON_END - now) / (7 * 86_400_000));
  // Joueurs réguliers (L15 ≥ 35, matchs manqués comptés à 0) avec une carte de la saison en vente.
  const pool = players.filter((p) => p.league === league && p.price !== null && p.l15 >= 35);
  md.push(`## ${name}`, '', `${gws.length} journées rejouées, ~${remaining} restantes · paliers : ${tiers.map((t) => `${t[0]} (${t[1] ? `${t[1]} €` : `${t[2]} ess.`})`).join(', ')}`, '',
    '| Budget | Effectif | Coût | Bonus | Score médian | Taux par palier | Parcours réel (paliers validés) | € réel saison | € / journée (modèle) | Bénéfice fin de saison |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const budget of BUDGETS) {
    for (const depth of [false, true]) {
      for (const bonus of BONUSES) {
        const owned = squad(pool, budget, bonus, depth);
        if (owned.length < 5) continue;
        const cost = owned.reduce((t, p) => t + p.price!, 0);
        const totals = gws.map((g) => lineupScore(owned, g, bonus));
        const rates = tiers.map((t) => totals.filter((x) => x >= t[0]).length / totals.length);
        // Échelle : la probabilité de franchir le palier i ne dépend que de son seuil (journées indépendantes).
        const model = ladder(rates, tiers);
        const real = realized(totals, tiers);
        const profit = model.eur * remaining + cost * RESALE - cost;
        const sorted = [...totals].sort((a, b) => a - b);
        const row = {
          league: name, budget, depth: depth ? 'avec remplaçants' : '5 cartes', cards: owned.length, cost: Math.round(cost * 100) / 100, bonus,
          median: Math.round(sorted[Math.floor(sorted.length / 2)]), rates: Object.fromEntries(tiers.map((t, i) => [t[0], Math.round(rates[i] * 100) / 100])),
          realized: real, modelPerGw: Math.round(model.eur * 100) / 100, essencePerGw: Math.round(model.essence), remaining, profit: Math.round(profit),
          team: owned.map((p) => `${p.pos} ${p.name} (${p.price} €, L15 ${Math.round(p.l15)})`),
        };
        results.push(row);
        md.push(`| ${budget} € | ${row.depth} (${owned.length}) | ${row.cost} € | ${bonus * 100} % | ${row.median} | ${tiers.map((t, i) => `${t[0]}:${Math.round(rates[i] * 100)}%`).join(' ')} | ${real.reached.join(', ') || '—'} | ${real.eur} € | ${row.modelPerGw} € | ${row.profit} € |`);
      }
    }
  }
  md.push('');
}
mkdirSync('streak-output', { recursive: true });
writeFileSync('streak-output/streaks.md', md.join('\n'));
writeFileSync('streak-output/streaks.json', JSON.stringify(results, null, 1));
console.log(md.join('\n'));
await sql.end();
