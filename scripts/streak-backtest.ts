// Rentabilité des streaks par championnat, d'après les vrais scores Sorare de la saison.
// Pour chaque budget : on achète aujourd'hui (prix planchers actuels) les 5 joueurs (G, D, M, A + extra) à la meilleure
// moyenne de saison (matchs du club manqués comptés 0), alignés chaque journée, capitaine = meilleure moyenne.
// Le score d'une journée est simulé 20 000 fois en tirant pour chaque joueur un de ses vrais matchs de la saison ;
// on en déduit la chance de franchir chaque palier, puis le gain moyen sur l'échelle complète des streaks
// (palier joué sur 2 journées au plus, 4 vies ; raté : retour à 320). 1 équipe (2 essais) ou 2 équipes (4 essais). On donne aussi le parcours réel de cette équipe sur la saison.
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
// Journées de championnat sur la saison (phase régulière + play-offs joués par les meilleurs clubs).
// shortcut: Contender = journées Sorare où au moins un des 5 championnats joue, estimées à 30 d'ici fin mai ; à recompter si besoin.
const SEASON_ROUNDS: Record<string, number> = {
  'premier-league-gb-eng': 38, 'laliga-es': 38, 'bundesliga-de': 34, 'ligue-1-fr': 34, 'primeira-liga-pt': 34, eredivisie: 34,
  'jupiler-pro-league': 40, 'premiership-gb-sct': 38, 'football-league-championship': 46,
};
/** Journées restantes : journées de la saison moins celles déjà jouées par un club (moyenne). */
async function remainingRounds(league: string): Promise<number> {
  if (league === 'contender') return 30;
  const [r] = await sql`select avg(n)::float as played from (select t.id, count(f.id) as n from teams t join competitions c on c.id = t.competition_id and c.slug = ${league}
    join fixtures f on (f.home_team_id = t.id or f.away_team_id = t.id) and f.competition_id = c.id and f.status = 'played' and f.date >= '2026-07-01' group by t.id) x`;
  return Math.max(1, Math.round(SEASON_ROUNDS[league] - ((r?.played as number) ?? 0)));
}

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
const played = new Set<string>(); // `${fixture}:${player}` des joueurs entrés en jeu
for (const a of await sql`select a.fixture_id, a.player_id, a.sorare_score, a.minutes from appearances a join fixtures f on f.id = a.fixture_id
  where f.status = 'played' and f.date >= '2026-08-01'`) {
  scores.set(`${a.fixture_id}:${a.player_id}`, a.sorare_score as number);
  if ((a.minutes as number) > 0) played.add(`${a.fixture_id}:${a.player_id}`);
}

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
/** Pour chaque match du club, le joueur est-il entré en jeu (sinon : blessé, suspendu, non retenu, banc) ? */
const seasonPlayed = new Map<number, boolean[]>();
for (const p of players) seasonPlayed.set(p.id, (teamGames.get(p.team) ?? []).map((g) => played.has(`${g.fixture}:${p.id}`)));
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
function simulate(team: Card[], bonus: number, seed = 42, draws = 20_000): number[] {
  // Un match du club tiré au hasard pour tous ses joueurs : les joueurs d'un même club montent et baissent ensemble.
  const rand = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
  const captain = team.reduce((b, p) => (p.l15 > b.l15 ? p : b));
  const clubs = [...new Set(team.map((p) => p.team))];
  return Array.from({ length: draws }, () => {
    const game = new Map(clubs.map((c) => [c, Math.floor(rand() * (teamGames.get(c) ?? [{}]).length)]));
    let total = 0; let cap = 0;
    for (const p of team) { const sc = seasonGames.get(p.id)![game.get(p.team)!] ?? 0; total += sc; if (p === captain) cap = sc; }
    return total * (1 + bonus) + CAPTAIN * cap;
  });
}

/**
 * Gain moyen par journée sur les N journées qui restent, en partant du premier palier. Règle Sorare : un palier se joue sur
 * 2 journées au plus (4 vies) ; q[i] = chance de le valider en une journée (au moins une équipe alignée au-dessus du seuil).
 * Validé : récompense et palier suivant à la journée d'après ; raté deux journées de suite : retour au premier palier.
 */
function ladder(q: number[], tiers: Tier[], N: number): { eur: number; essence: number } {
  const n = tiers.length;
  // État : palier i, journée 0 ou 1 passée dessus.
  let dist = Array.from({ length: n }, (_, i) => [i === 0 ? 1 : 0, 0]); let eur = 0; let essence = 0;
  for (let s = 0; s < N; s++) {
    const next = Array.from({ length: n }, () => [0, 0]);
    dist.forEach(([fresh, second], i) => {
      for (const [mass, used] of [[fresh, 0], [second, 1]] as const) {
        if (!mass) continue;
        eur += mass * q[i] * tiers[i][1]; essence += mass * q[i] * tiers[i][2];
        next[(i + 1) % n][0] += mass * q[i];
        if (used === 0) next[i][1] += mass * (1 - q[i]); else next[0][0] += mass * (1 - q[i]);
      }
    });
    dist = next;
  }
  return { eur: eur / N, essence: essence / N };
}

/** Parcours réel journée après journée : ce que l'échelle aurait rapporté cette saison. */
function realized(totals: number[], tiers: Tier[]) {
  let level = 0; let used = 0; let eur = 0; let essence = 0; const reached: number[] = [];
  for (const t of totals) {
    if (t >= tiers[level][0]) { eur += tiers[level][1]; essence += tiers[level][2]; reached.push(tiers[level][0]); level = (level + 1) % tiers.length; used = 0; }
    else if (used === 0) used = 1;
    else { level = 0; used = 0; }
  }
  return { eur, essence, reached };
}

// ——— Calcul ———
const now = Date.now();
const results: Record<string, unknown>[] = [];
const md: string[] = ['# Rentabilité des streaks rejouée sur la saison', '',
  `Calcul du ${new Date().toISOString().slice(0, 10)}. Prix d'achat : planchers actuels. Bonus de carte ${BONUSES.map((b) => `${b * 100} %`).join(' / ')}, capitaine +50 %.`,
  `« Journées pour amortir » : journées de streaks pour couvrir la perte à la revente (${(1 - RESALE) * 100} % du prix). Revente supposée en fin de saison : ${RESALE * 100} % du prix d'achat. Journées restantes : calendrier de chaque championnat moins les journées jouées.`, ''];
for (const [league, { name, tiers }] of Object.entries(LEAGUES)) {
  const gws = gwsByLeague.get(league) ?? [];
  if (gws.length < 4) continue;
  const remaining = await remainingRounds(league);
  // Joueurs réguliers (L15 ≥ 35, matchs manqués comptés à 0) avec une carte de la saison en vente.
  const pool = players.filter((p) => p.league === league && p.price !== null && p.l15 >= 30 && seasonGames.get(p.id)!.length >= 5);
  // Profil du championnat : parmi les 30 meilleures moyennes, chance de dépasser 60, 70, 80, 90 sur un match.
  const top = [...pool].sort((a, b) => b.l15 - a.l15).slice(0, 30).flatMap((p) => seasonGames.get(p.id)!);
  const share = (x: number) => Math.round((top.filter((v) => v >= x).length / (top.length || 1)) * 100);
  const profile = `Profil (30 meilleures moyennes, ${top.length} matchs) : ≥60 ${share(60)} %, ≥70 ${share(70)} %, ≥80 ${share(80)} %, ≥90 ${share(90)} %`;
  md.push(`## ${name}`, '', profile, '', `${gws.length} journées rejouées, ~${remaining} restantes · paliers : ${tiers.map((t) => `${t[0]} (${t[1] ? `${t[1]} €` : `${t[2]} ess.`})`).join(', ')}`, '',
    '| Budget | Équipes | Coût | Bonus | Score médian | Chance de valider en une journée | Saison réelle (paliers validés) | Gain moyen / journée | Gain d\'ici la fin de saison | Journées pour amortir | Bénéfice fin de saison | Équipes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const budget of BUDGETS) {
    for (const lineups of [1, 2]) {
      for (const bonus of BONUSES) {
        // 1 équipe de 5 cartes (2 essais par palier), ou 2 équipes distinctes de 5 avec la moitié du budget chacune (4 essais).
        const teams: Card[][] = [];
        for (let k = 0; k < lineups; k++) teams.push(bestFive(pool.filter((p) => !teams.flat().includes(p)), budget / lineups, bonus));
        if (teams.some((t) => t.length < 5)) continue;
        const cost = teams.flat().reduce((t, p) => t + p.price!, 0);
        if (results.some((r) => r.league === name && r.bonus === bonus && r.lineups === lineups && r.cost === Math.round(cost * 100) / 100)) continue;
        const sims = teams.map((t, k) => simulate(t, bonus, 42 + 7919 * k));
        const best = sims[0].map((_, d) => Math.max(...sims.map((x) => x[d]))); // une journée réussie si une des équipes passe
        const q = tiers.map((t) => best.filter((x) => x >= t[0]).length / best.length);
        const model = ladder(q, tiers, Math.max(remaining, 1));
        // Rejeu sur les journées où tous les clubs jouaient (les autres sont des trous de données).
        const full = gws.filter((g) => teams.flat().every((p) => g.fixtureOfTeam.has(p.team)));
        const realTotals = full.map((g) => Math.max(...teams.map((t) => lineupScore(t, g, bonus))));
        const real = realized(realTotals, tiers);
        const diag = full.map((g, i) => `${g.key} ${Math.round(realTotals[i])}`);
        const profit = model.eur * remaining + cost * RESALE - cost;
        const sorted = [...best].sort((a, b) => a - b);
        const row = {
          league: name, budget, lineups, cost: Math.round(cost * 100) / 100, bonus, median: Math.round(sorted[sorted.length >> 1]),
          perGwPass: Object.fromEntries(tiers.map((t, i) => [t[0], Math.round(q[i] * 1000) / 1000])),
          realized: { ...real, gws: full.length }, modelPerGw: Math.round(model.eur * 100) / 100, essencePerGw: Math.round(model.essence), remaining,
          seasonGain: Math.round(model.eur * remaining), profit: Math.round(profit),
          breakEvenGws: model.eur > 0 ? Math.ceil((cost * (1 - RESALE)) / model.eur) : null,
          teams: teams.map((t) => t.map((p) => `${p.pos} ${p.name} (${p.price} €, moy. ${Math.round(p.l15)})`)), diag,
        };
        results.push(row);
        md.push(`| ${budget} € | ${lineups} équipe${lineups > 1 ? 's' : ''} | ${row.cost} € | ${bonus * 100} % | ${row.median} | ${tiers.map((t, i) => `${t[0]}:${Math.round(q[i] * 100)}%`).join(' ')} | ${full.length} j. : ${real.reached.join(', ') || '—'} (${real.eur} €) | ${row.modelPerGw} € · ${row.essencePerGw} ess. | ${row.seasonGain} € | ${row.breakEvenGws ?? '—'} | ${row.profit} € | ${row.teams.map((t) => t.join(' ; ')).join(' // ')} |`);
      }
    }
  }
  md.push('');
}
// ——— Stacks : équipes d'un ou deux clubs, par championnat ———
// Les joueurs d'un même club jouent le même match : un stack a plus de grosses journées (et plus de mauvaises), ce qui
// compte pour les gros paliers. Pour chaque club : le meilleur stack par budget ; puis les paires des 6 meilleurs clubs.
const teamNames = new Map((await sql`select id, name from teams`).map((t) => [t.id as number, t.name as string]));
const stackRows: Record<string, unknown>[] = [];
const depthStacks: Record<string, unknown>[] = [];
md.push('# Stacks (1 ou 2 clubs), 1 équipe alignée', '');
for (const [league, { name, tiers }] of Object.entries(LEAGUES)) {
  const gws = gwsByLeague.get(league) ?? [];
  if (gws.length < 4) continue;
  const remaining = await remainingRounds(league);
  const pool = players.filter((p) => p.league === league && p.price !== null && seasonGames.get(p.id)!.length >= 5);
  const clubs = [...new Set(pool.map((p) => p.team))];
  const evaluate = (label: string, clubIds: number[], budget: number, bonus: number) => {
    const team = bestFive(pool.filter((p) => clubIds.includes(p.team)), budget, bonus);
    if (team.length < 5) return null;
    const cost = Math.round(team.reduce((t, p) => t + p.price!, 0) * 100) / 100;
    const sims = simulate(team, bonus);
    const q = tiers.map((t) => sims.filter((x) => x >= t[0]).length / sims.length);
    const model = ladder(q, tiers, Math.max(remaining, 1));
    const full = gws.filter((g) => team.every((p) => g.fixtureOfTeam.has(p.team)));
    const real = realized(full.map((g) => lineupScore(team, g, bonus)), tiers);
    const sorted = [...sims].sort((a, b) => a - b);
    return {
      league: name, label, budget, bonus, cost, remaining, median: Math.round(sorted[sorted.length >> 1]),
      p90: Math.round(sorted[Math.floor(sorted.length * 0.9)]),
      perGwPass: Object.fromEntries(tiers.map((t, i) => [t[0], Math.round(q[i] * 1000) / 1000])),
      seasonGain: Math.round(model.eur * remaining), realized: { ...real, gws: full.length },
      team: team.map((p) => `${p.pos} ${p.name} (${p.price} €, moy. ${Math.round(p.l15)})`),
    };
  };
  const rows: NonNullable<ReturnType<typeof evaluate>>[] = [];
  const seen = new Set<string>();
  const push = (r: ReturnType<typeof evaluate>) => {
    if (!r) return;
    const key = `${r.bonus}|${r.team.join()}`;
    if (!seen.has(key)) { seen.add(key); rows.push(r); }
  };
  for (const c of clubs) for (const budget of BUDGETS) for (const bonus of BONUSES) push(evaluate(teamNames.get(c) ?? String(c), [c], budget, bonus));
  // Paires : les 6 clubs au meilleur gain (bonus bas, budget libre).
  const topClubs = clubs.map((c) => ({ c, g: rows.filter((r) => r.label === (teamNames.get(c) ?? String(c)) && r.bonus === BONUSES[0]).reduce((m, r) => Math.max(m, r.seasonGain), 0) }))
    .sort((a, b) => b.g - a.g).slice(0, 6).map((x) => x.c);
  for (let i = 0; i < topClubs.length; i++) for (let j = i + 1; j < topClubs.length; j++) {
    const label = `${teamNames.get(topClubs[i])} + ${teamNames.get(topClubs[j])}`;
    for (const budget of BUDGETS) for (const bonus of BONUSES) push(evaluate(label, [topClubs[i], topClubs[j]], budget, bonus));
  }
  stackRows.push(...rows);
  // Les meilleurs stacks : par gain de saison, et par gain pour 1 € investi (bonus bas).
  const low = rows.filter((r) => r.bonus === BONUSES[0]);
  const line = (r: (typeof rows)[number]) => `| ${r.label} | ${r.cost} € | ${r.median} / ${r.p90} | ${tiers.map((t) => `${t[0]}:${Math.round((r.perGwPass[t[0]] as number) * 100)}%`).join(' ')} | ${r.seasonGain} € | ${(r.seasonGain / r.cost).toFixed(1)} | ${r.realized.gws} j. : ${r.realized.reached.join(', ') || '—'} (${r.realized.eur} €) | ${r.team.join(' ; ')} |`;
  md.push(`## ${name} — stacks`, '', '| Stack | Coût | Score médian / 1 journée sur 10 | Chance de valider en une journée | Gain saison (non corrigé) | Gain par € | Saison réelle | Équipe |', '|---|---|---|---|---|---|---|---|',
    '| **Meilleurs gains** | | | | | | | |', ...[...low].sort((a, b) => b.seasonGain - a.seasonGain).slice(0, 6).map(line),
    '| **Meilleur rendement (coût ≥ 15 €)** | | | | | | | |', ...low.filter((r) => r.cost >= 15).sort((a, b) => b.seasonGain / b.cost - a.seasonGain / a.cost).slice(0, 6).map(line), '');

  // ——— Effectifs de stack : 2 gardiens et 3 joueurs par poste de champ, pour couvrir absences et rotations ———
  // Chaque journée, on aligne les 5 meilleures moyennes parmi les joueurs de l'effectif qui jouent vraiment le match
  // (on suppose connues avant la composition les blessures, suspensions et non-titularisations).
  const DEPTH: Record<Pos, number> = { G: 2, D: 3, M: 3, F: 3 };
  const depthSquad = (pool2: Card[], budget: number, bonus: number): Card[] => {
    const core = bestFive(pool2, budget * 0.65, bonus);
    if (core.length < 5) return [];
    const owned = [...core]; let left = budget - core.reduce((t, p) => t + p.price!, 0);
    for (const k of ['G', 'D', 'M', 'F', 'D', 'M', 'F', 'D', 'M', 'F'] as Pos[]) {
      if (owned.filter((p) => p.pos === k).length >= DEPTH[k]) continue;
      const pick = pool2.filter((p) => p.pos === k && !owned.includes(p) && p.price! <= left).sort((a, b) => b.l15 - a.l15)[0];
      if (pick) { owned.push(pick); left -= pick.price!; }
    }
    return owned;
  };
  const lineupFrom = (avail: Card[]): Card[] => {
    const pick: Card[] = [];
    for (const k of ['G', 'D', 'M', 'F'] as Pos[]) { const c = avail.filter((p) => p.pos === k).sort((a, b) => b.l15 - a.l15)[0]; if (c) pick.push(c); }
    const extra = avail.filter((p) => p.pos !== 'G' && !pick.includes(p)).sort((a, b) => b.l15 - a.l15)[0];
    if (extra) pick.push(extra);
    return pick;
  };
  const simDepth = (squad: Card[], bonus: number, draws = 20_000): number[] => {
    let seed = 777;
    const rand = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
    const clubsOf = [...new Set(squad.map((p) => p.team))];
    return Array.from({ length: draws }, () => {
      const game = new Map(clubsOf.map((c) => [c, Math.floor(rand() * (teamGames.get(c) ?? [{}]).length)]));
      const avail = squad.filter((p) => seasonPlayed.get(p.id)![game.get(p.team)!]);
      const team = lineupFrom(avail);
      if (!team.length) return 0;
      const sc = (p: Card) => seasonGames.get(p.id)![game.get(p.team)!] ?? 0;
      const captain = team.reduce((b, p) => (p.l15 > b.l15 ? p : b));
      return team.reduce((t, p) => t + sc(p), 0) * (1 + bonus) + CAPTAIN * sc(captain);
    });
  };
  const depthRows: Record<string, unknown>[] = [];
  const candidates = [...topClubs.map((c) => [c]), ...topClubs.flatMap((a, i) => topClubs.slice(i + 1).map((b) => [a, b]))];
  for (const clubIds of candidates) {
    const label = clubIds.map((c) => teamNames.get(c)).join(' + ');
    const pool2 = pool.filter((p) => clubIds.includes(p.team));
    for (const budget of [40, 80, 150, 300, 600, 1200]) for (const bonus of BONUSES) {
      const squad = depthSquad(pool2, budget, bonus);
      if (squad.length < 9) continue;
      const cost = Math.round(squad.reduce((t, p) => t + p.price!, 0) * 100) / 100;
      if (depthRows.some((r) => r.label === label && r.bonus === bonus && r.cost === cost)) continue;
      const sims = simDepth(squad, bonus);
      const q = tiers.map((t) => sims.filter((x) => x >= t[0]).length / sims.length);
      const model = ladder(q, tiers, Math.max(remaining, 1));
      const realTotals = gws.filter((g) => clubIds.every((c) => g.fixtureOfTeam.has(c))).map((g) => {
        const avail = squad.filter((p) => played.has(`${g.fixtureOfTeam.get(p.team)}:${p.id}`));
        const team = lineupFrom(avail);
        if (!team.length) return 0;
        const sc = (p: Card) => scores.get(`${g.fixtureOfTeam.get(p.team)}:${p.id}`) ?? 0;
        const captain = team.reduce((b, p) => (p.l15 > b.l15 ? p : b));
        return team.reduce((t, p) => t + sc(p), 0) * (1 + bonus) + CAPTAIN * sc(captain);
      });
      const real = realized(realTotals, tiers);
      const sorted = [...sims].sort((a, b) => a - b);
      depthRows.push({
        league: name, label, budget, bonus, cost, cards: squad.length, remaining, median: Math.round(sorted[sorted.length >> 1]),
        perGwPass: Object.fromEntries(tiers.map((t, i) => [t[0], Math.round(q[i] * 1000) / 1000])),
        seasonGain: Math.round(model.eur * remaining), realized: { ...real, gws: realTotals.length },
        squad: squad.map((p) => `${p.pos} ${p.name} (${p.price} €, moy. ${Math.round(p.l15)}, joue ${Math.round((seasonPlayed.get(p.id)!.filter(Boolean).length / (seasonPlayed.get(p.id)!.length || 1)) * 100)} %)`),
      });
    }
  }
  depthStacks.push(...depthRows);
}
mkdirSync('streak-output', { recursive: true });
writeFileSync('streak-output/stacks.json', JSON.stringify(stackRows, null, 1));
writeFileSync('streak-output/depth-stacks.json', JSON.stringify(depthStacks, null, 1));

mkdirSync('streak-output', { recursive: true });
writeFileSync('streak-output/streaks.md', md.join('\n'));
writeFileSync('streak-output/streaks.json', JSON.stringify(results, null, 1));
console.log(md.join('\n'));
await sql.end();
