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
  'austrian-bundesliga': 'contender', '2-bundesliga': 'contender', 'ligue-2-fr': 'contender', '1-hnl': 'contender',
};

/** Groupe d'un championnat Sorare (club actuel du joueur) ; null s'il n'est pas suivi. */
export function roiGroupOf(leagueSlug: string | null): RoiGroup | null {
  if (!leagueSlug) return null;
  // shortcut: « Liga 2 » reconnue par son slug (Espagne ou Portugal), à préciser si Sorare la nomme autrement.
  return BY_SLUG[leagueSlug] ?? (/segunda|liga-2|laliga-2|hypermotion/.test(leagueSlug) ? 'contender' : null);
}

/** Saisies du manager pour un championnat : streaks par palier, essence (quantité), cartes déjà revendues. */
export interface RoiManual {
  streaks: { level: string; count: number; eur: number }[];
  essence: number;
  sold: { name: string; bought: number; sold: number }[];
}
export type RoiData = Partial<Record<RoiGroup, RoiManual>>;
export const emptyManual = (): RoiManual => ({ streaks: [], essence: 0, sold: [] });

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e7;
const text = (x: unknown) => typeof x === 'string' && x.length <= 80;

/** Saisies reçues du navigateur, vérifiées avant d'être enregistrées ; null si elles sont mal formées. */
export function parseRoi(x: unknown): RoiData | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out: RoiData = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!ROI_GROUPS.some((g) => g.key === k) || !v || typeof v !== 'object') return null;
    const m = v as Record<string, unknown>;
    if (!Array.isArray(m.streaks) || !Array.isArray(m.sold) || !num(m.essence) || m.streaks.length > 50 || m.sold.length > 500) return null;
    if (!m.streaks.every((s) => s && text(s.level) && num(s.count) && num(s.eur))) return null;
    if (!m.sold.every((s) => s && text(s.name) && num(s.bought) && num(s.sold))) return null;
    out[k as RoiGroup] = {
      streaks: m.streaks.map((s) => ({ level: s.level, count: s.count, eur: s.eur })),
      essence: m.essence as number,
      sold: m.sold.map((s) => ({ name: s.name, bought: s.bought, sold: s.sold })),
    };
  }
  return out;
}

/** Cartes possédées d'un championnat, lues dans la galerie Sorare et valorisées au prix du marché. */
export interface RoiOwned { cards: number; invested: number; unknownPurchase: number; value: number; unpriced: number }

export interface RoiTotals {
  invested: number; streaks: number; resales: number; gains: number; value: number;
  /** (gains − investi) / investi : ce que streaks et reventes ont déjà remboursé. */
  roiGross: number | null;
  /** (gains + valeur actuelle des cartes − investi) / investi. */
  roiWithValue: number | null;
}

export function roiTotals(owned: RoiOwned, m: RoiManual): RoiTotals {
  const invested = owned.invested + m.sold.reduce((t, s) => t + s.bought, 0);
  const streaks = m.streaks.reduce((t, s) => t + s.eur, 0);
  const resales = m.sold.reduce((t, s) => t + s.sold, 0);
  const gains = streaks + resales;
  const ratio = (x: number) => (invested > 0 ? x / invested - 1 : null);
  return { invested, streaks, resales, gains, value: owned.value, roiGross: ratio(gains), roiWithValue: ratio(gains + owned.value) };
}
