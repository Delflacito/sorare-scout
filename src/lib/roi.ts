/** Championnats suivis dans la page ROI ; Contender regroupe les championnats de deuxième rang. */
export const ROI_GROUPS = [
  { key: 'eredivisie', name: 'Eredivisie' },
  { key: 'primeira', name: 'Primeira Liga' },
  { key: 'ligue1', name: 'Ligue 1' },
  { key: 'jupiler', name: 'Jupiler Pro League' },
  { key: 'contender', name: 'Contender', detail: 'Autriche, 2. Bundesliga, Ligue 2, Liga 2, Croatie' },
] as const;
export type RoiGroup = (typeof ROI_GROUPS)[number]['key'];

const BY_SLUG: Record<string, RoiGroup> = {
  eredivisie: 'eredivisie', 'primeira-liga-pt': 'primeira', 'ligue-1-fr': 'ligue1', 'jupiler-pro-league': 'jupiler',
  'austrian-bundesliga': 'contender', '2-bundesliga': 'contender', 'ligue-2-fr': 'contender', '1-hnl': 'contender', 'segunda-division-es': 'contender',
};

/** Groupe d'un championnat Sorare (club actuel du joueur) ; null s'il n'est pas suivi. */
export function roiGroupOf(leagueSlug: string | null): RoiGroup | null {
  if (!leagueSlug) return null;
  return BY_SLUG[leagueSlug] ?? null;
}

/** Récompense d'un palier de streak (score d'équipe à atteindre) : euros ou essence. */
export interface StreakTier { score: number; eur?: number; essence?: number }

// Barème Sorare fourni par l'utilisateur (Pays-Bas, Portugal et Belgique ont le même).
const MID: StreakTier[] = [
  { score: 320, essence: 500 }, { score: 360, eur: 3 }, { score: 380, eur: 5 }, { score: 410, eur: 25 }, { score: 440, eur: 100 }, { score: 460, eur: 1000 },
];
export const STREAK_TIERS: Record<RoiGroup, StreakTier[]> = {
  eredivisie: MID,
  primeira: MID,
  jupiler: MID,
  ligue1: [
    { score: 320, essence: 500 }, { score: 360, eur: 5 }, { score: 380, eur: 10 }, { score: 410, eur: 50 }, { score: 440, eur: 300 },
    { score: 460, eur: 1500 }, { score: 550, eur: 8000 },
  ],
  contender: [
    { score: 320, essence: 500 }, { score: 360, essence: 1000 }, { score: 380, eur: 2 }, { score: 410, eur: 10 }, { score: 440, eur: 50 }, { score: 460, eur: 500 },
  ],
};

const BIG: StreakTier[] = [ // LaLiga et Bundesliga
  { score: 320, essence: 500 }, { score: 360, eur: 5 }, { score: 380, eur: 10 }, { score: 420, eur: 50 }, { score: 440, eur: 300 },
  { score: 470, eur: 1500 }, { score: 550, eur: 8000 },
];
const LEAGUE_TIERS: Record<string, StreakTier[]> = {
  'premier-league-gb-eng': [
    { score: 320, essence: 500 }, { score: 360, eur: 5 }, { score: 380, eur: 10 }, { score: 400, eur: 50 }, { score: 430, eur: 400 },
    { score: 450, eur: 2000 }, { score: 550, eur: 10000 },
  ],
  'laliga-es': BIG,
  'bundesliga-de': BIG,
  // Écosse et Championship : même barème que Contender.
  'premiership-gb-sct': STREAK_TIERS.contender,
  'football-league-championship': STREAK_TIERS.contender,
};

/** Barème des streaks d'un championnat (slug Sorare) ; null s'il n'est pas connu (MLS…). */
export function streakTiersOf(competitionSlug: string | undefined): StreakTier[] | null {
  if (!competitionSlug) return null;
  const g = roiGroupOf(competitionSlug);
  return g ? STREAK_TIERS[g] : LEAGUE_TIERS[competitionSlug] ?? null;
}

/** Saisies du manager pour un championnat : streaks par palier (clé = score), gains de leaderboard, cartes revendues. */
export interface RoiManual {
  streaks: Record<string, number>;
  leaderboard?: { eur: number; essence: number };
  sold: { name: string; bought: number; sold: number }[];
}
export type RoiData = Partial<Record<RoiGroup, RoiManual>>;
export const emptyManual = (): RoiManual => ({ streaks: {}, sold: [] });

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e7;
const text = (x: unknown) => typeof x === 'string' && x.length <= 80;

/** Saisies reçues du navigateur (ou enregistrées), vérifiées ; null si elles sont mal formées. */
export function parseRoi(x: unknown): RoiData | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out: RoiData = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!ROI_GROUPS.some((g) => g.key === k) || !v || typeof v !== 'object') return null;
    const m = v as Record<string, unknown>;
    const tiers = STREAK_TIERS[k as RoiGroup].map((t) => String(t.score));
    if (!m.streaks || typeof m.streaks !== 'object' || Array.isArray(m.streaks) || !Array.isArray(m.sold) || m.sold.length > 500) return null;
    const streaks = m.streaks as Record<string, unknown>;
    if (!Object.entries(streaks).every(([score, n]) => tiers.includes(score) && num(n) && Number.isInteger(n))) return null;
    if (!m.sold.every((s) => s && text(s.name) && num(s.bought) && num(s.sold))) return null;
    const lb = m.leaderboard as Record<string, unknown> | undefined;
    if (lb !== undefined && (!lb || typeof lb !== 'object' || !num(lb.eur) || !num(lb.essence))) return null;
    out[k as RoiGroup] = {
      streaks: streaks as Record<string, number>,
      ...(lb && { leaderboard: { eur: lb.eur as number, essence: lb.essence as number } }),
      sold: m.sold.map((s) => ({ name: s.name, bought: s.bought, sold: s.sold })),
    };
  }
  return out;
}

/** Cartes possédées d'un championnat, lues dans la galerie Sorare et valorisées au prix du marché. */
export interface RoiOwned { cards: number; invested: number; unknownPurchase: number; value: number; unpriced: number }

export interface RoiTotals {
  invested: number; streakCount: number; streaks: number; leaderboard: number; essence: number; resales: number; gains: number; value: number;
  /** (gains − investi) / investi : ce que streaks, leaderboard et reventes ont déjà remboursé. */
  roiGross: number | null;
  /** (gains + valeur actuelle des cartes − investi) / investi. */
  roiWithValue: number | null;
}

export function roiTotals(group: RoiGroup, owned: RoiOwned, m: RoiManual): RoiTotals {
  const invested = owned.invested + m.sold.reduce((t, s) => t + s.bought, 0);
  const count = (t: StreakTier) => m.streaks[String(t.score)] ?? 0;
  const tiers = STREAK_TIERS[group];
  const streakCount = tiers.reduce((n, t) => n + count(t), 0);
  const streaks = tiers.reduce((n, t) => n + count(t) * (t.eur ?? 0), 0);
  const leaderboard = m.leaderboard?.eur ?? 0;
  const essence = tiers.reduce((n, t) => n + count(t) * (t.essence ?? 0), 0) + (m.leaderboard?.essence ?? 0);
  const resales = m.sold.reduce((t, s) => t + s.sold, 0);
  const gains = streaks + leaderboard + resales;
  const ratio = (x: number) => (invested > 0 ? x / invested - 1 : null);
  return { invested, streakCount, streaks, leaderboard, essence, resales, gains, value: owned.value, roiGross: ratio(gains), roiWithValue: ratio(gains + owned.value) };
}

/** Bilan d'une semaine, tous championnats (week : lundi de la semaine, AAAA-MM-JJ). */
export interface RoiWeek { week: string; invested: number; gains: number; value: number }

/** Lundi (UTC) de la semaine d'une date. */
export function weekOf(d: Date): string {
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/** Historique avec le bilan de cette semaine (remplace celui déjà noté pour la même semaine) ; deux ans au plus. */
export function upsertWeek(history: RoiWeek[], entry: RoiWeek): RoiWeek[] {
  return [...history.filter((h) => h.week !== entry.week), entry].sort((a, b) => a.week.localeCompare(b.week)).slice(-104);
}

/** Streaks d'un palier en euros qu'il faut encore gagner pour couvrir l'investi (hors valeur des cartes) ; vide si c'est fait. */
export function breakEven(group: RoiGroup, t: RoiTotals): { score: number; eur: number; count: number }[] {
  const remaining = t.invested - t.gains;
  if (remaining <= 0) return [];
  return STREAK_TIERS[group].filter((x) => x.eur).map((x) => ({ score: x.score, eur: x.eur!, count: Math.ceil(remaining / x.eur!) }));
}
