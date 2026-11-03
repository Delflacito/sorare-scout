// Rentabilité des streaks par championnat, d'après les vrais scores Sorare de la saison.
// Pour chaque budget : on achète aujourd'hui (prix planchers actuels) les 5 joueurs (G, D, M, A + extra) à la meilleure
// moyenne de saison (matchs du club manqués comptés 0), alignés chaque journée, capitaine = meilleure moyenne.
// Le score d'une journée est simulé 20 000 fois en tirant pour chaque joueur un de ses vrais matchs de la saison ;
// on en déduit la chance de franchir chaque palier, puis le gain moyen sur l'échelle complète des streaks
// (réussite : palier suivant ; échec : retour à 320). On donne aussi le parcours réel de cette équipe sur la saison.
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

/** Scores de la saison d'un joueur, un par match de championnat de son club (0 s'il n'a pas joué). */
const seasonGames = new Map<number, number[]>();
for (const p of players) seasonGames.set(p.id, (teamGames.get(p.team) ?? []).map((g) => scores.get(`${g.fixture}:${p.id}`) ?? 0));
const avgOf = (p: (typeof players)[number]) => { const g = seasonGames.get(p.id)!; return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0; };
for (const p of players) p.l15 = avgOf(p); // la sélection se fait sur la moyenne de saison, plus stable que la forme

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

// ——— Scores d'équipe ———
/** Score réel de l'équipe fixe à une journée (0 pour un joueur dont le club ne joue pas ou qui ne joue pas). */
function lineupScore(team: Card[], gw: Gw, bonus: number): number {
  const actual = (p: Card) => (gw.fixtureOfTeam.has(p.team) ? scores.get(`${gw.fixtureOfTeam.get(p.team)}:${p.id}`) ?? 0 : 0);
  const captain = team.reduce((b, p) => (p.l15 > b.l15 ? p : b));
  return team.reduce((t, p) => t + actual(p), 0) * (1 + bonus) + CAPTAIN * actual(captain);
}

/** Simulation : chaque joueur rejoue un de ses matchs de la saison tiré au hasard (générateur fixe, résultats reproductibles). */
function simulate(team: Card[], bonus: number, draws = 20_000): number[] {
  let seed = 42;
  const rand = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
  const captain = team.reduce((b, p) => (p.l15 > b.l15 ? p : b));
  return Array.from({ length: draws }, () => {
    let total = 0; let cap = 0;
    for (const p of team) {
      const g = seasonGames.get(p.id)!;
      const s = g[Math.floor(rand() * g.length)];
      total += s; if (p === captain) cap = s;
    }
    return total * (1 + bonus) + CAPTAIN * cap;
  });
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
  `« Journées pour amortir » : journées de streaks pour couvrir la perte à la revente (${(1 - RESALE) * 100} % du prix). Revente supposée en fin de saison : ${RESALE * 100} % du prix d'achat. Journées restantes estimées d'après le rythme observé jusqu'au ${new Date(SEASON_END).toISOString().slice(0, 10)}.`, ''];
for (const [league, { name, tiers }] of Object.entries(LEAGUES)) {
  const gws = gwsByLeague.get(league) ?? [];
  if (gws.length < 4) continue;
  const firstGw = Date.parse(gws[0].key.slice(0, 10));
  const rate = gws.length / ((now - firstGw) / (7 * 86_400_000)); // journées par semaine
  const remaining = Math.round(rate * (SEASON_END - now) / (7 * 86_400_000));
  // Joueurs réguliers (L15 ≥ 35, matchs manqués comptés à 0) avec une carte de la saison en vente.
  const pool = players.filter((p) => p.league === league && p.price !== null && p.l15 >= 30 && seasonGames.get(p.id)!.length >= 5);
  // Profil du championnat : parmi les 30 meilleures moyennes, chance de dépasser 60, 70, 80, 90 sur un match.
  const top = [...pool].sort((a, b) => b.l15 - a.l15).slice(0, 30).flatMap((p) => seasonGames.get(p.id)!);
  const share = (x: number) => Math.round((top.filter((v) => v >= x).length / (top.length || 1)) * 100);
  const profile = `Profil (30 meilleures moyennes, ${top.length} matchs) : ≥60 ${share(60)} %, ≥70 ${share(70)} %, ≥80 ${share(80)} %, ≥90 ${share(90)} %`;
  md.push(`## ${name}`, '', profile, '', `${gws.length} journées rejouées, ~${remaining} restantes · paliers : ${tiers.map((t) => `${t[0]} (${t[1] ? `${t[1]} €` : `${t[2]} ess.`})`).join(', ')}`, '',
    '| Budget | Coût | Bonus | Score médian | Chance par palier | Saison réelle (paliers validés) | Gain moyen / journée | Journées pour amortir | Bénéfice fin de saison | Équipe |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const budget of BUDGETS) {
    for (const bonus of BONUSES) {
      const team = bestFive(pool, budget, bonus);
      if (team.length < 5) continue;
      const cost = team.reduce((t, p) => t + p.price!, 0);
      if (results.some((r) => r.league === name && r.bonus === bonus && r.cost === Math.round(cost * 100) / 100)) continue; // même équipe qu'un budget plus petit
      const sims = simulate(team, bonus);
      const rates = tiers.map((t) => sims.filter((x) => x >= t[0]).length / sims.length);
      const model = ladder(rates, tiers);
      // Rejeu sur les journées où les 5 clubs jouaient : les autres sont des trous de données (matchs non importés) ou des
      // journées où l'on alignerait d'autres cartes ; les compter à 0 casserait la streak à tort.
      const full = gws.filter((g) => team.every((p) => g.fixtureOfTeam.has(p.team)));
      const realTotals = full.map((g) => lineupScore(team, g, bonus));
      const real = realized(realTotals, tiers);
      // Diagnostic : score réel de chaque journée et nombre de joueurs de l'équipe dont le club jouait.
      const diag = full.map((g, i) => `${g.key} ${Math.round(realTotals[i])}`);
      const profit = model.eur * remaining + cost * RESALE - cost;
      const sorted = [...sims].sort((a, b) => a - b);
      const row = {
        league: name, budget, cost: Math.round(cost * 100) / 100, bonus, median: Math.round(sorted[sorted.length >> 1]),
        rates: Object.fromEntries(tiers.map((t, i) => [t[0], Math.round(rates[i] * 1000) / 1000])),
        realized: { ...real, gws: full.length }, modelPerGw: Math.round(model.eur * 100) / 100, essencePerGw: Math.round(model.essence), remaining, profit: Math.round(profit),
        breakEvenGws: model.eur > 0 ? Math.ceil((cost * (1 - RESALE)) / model.eur) : null,
        team: team.map((p) => `${p.pos} ${p.name} (${p.price} €, moy. ${Math.round(p.l15)}, ${seasonGames.get(p.id)!.length} matchs)`), diag,
      };
      results.push(row);
      md.push(`| ${budget} € | ${row.cost} € | ${bonus * 100} % | ${row.median} | ${tiers.map((t, i) => `${t[0]}:${Math.round(rates[i] * 100)}%`).join(' ')} | ${full.length} j. : ${real.reached.join(', ') || '—'} (${real.eur} €) | ${row.modelPerGw} € · ${row.essencePerGw} ess. | ${row.breakEvenGws ?? '—'} | ${row.profit} € | ${row.team.join(' ; ')} |`);
    }
  }
  md.push('');
}
mkdirSync('streak-output', { recursive: true });
writeFileSync('streak-output/streaks.md', md.join('\n'));
writeFileSync('streak-output/streaks.json', JSON.stringify(results, null, 1));
console.log(md.join('\n'));
await sql.end();
