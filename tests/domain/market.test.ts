import { fairPrice, fitPriceModel, median, potentialPrice, priceTrend, valueHistory, type MarketRow } from '@/domain/market';

const profile = {
  allAround: 30, startRate: 0.8, minutes: 70, teamId: null, clubPpg: 1.5, prevGoalsAssists: 5, international: false, status: 'STARTER',
} as const;

/**
 * Marché synthétique : prix = 2 € × e^(0,05 × L15) × (×1,5 en Eredivisie) × (×2 pour le club 7), avec un léger bruit
 * déterministe ; les joueurs du club 7 ont le même profil que les autres.
 */
function market(n = 80): MarketRow[] {
  return Array.from({ length: n }, (_, i) => {
    const l15 = 30 + (i % 40);
    const league = i % 2 ? 'eredivisie' : 'ligue-1-fr';
    const noise = 1 + ((i * 7) % 5 - 2) / 100;
    const teamId = i % 5 === 0 ? 7 : i % 5;
    return {
      ...profile, playerId: i, l15, l5: l15, age: 24 + (i % 8), league, position: i % 3 ? 'Midfielder' : 'Forward', teamId,
      price: 2 * Math.exp(0.05 * l15) * (league === 'eredivisie' ? 1.5 : 1) * (teamId === 7 ? 2 : 1) * noise,
    };
  });
}

describe('valeur estimée des cartes', () => {
  it('retrouve la relation prix / performance du marché', () => {
    const m = fitPriceModel(market())!;
    const row = { ...profile, teamId: 1, l15: 60, l5: 60, age: 27, league: 'ligue-1-fr', position: 'Midfielder' as const };
    expect(fairPrice(m, row)).toBeCloseTo(2 * Math.exp(3), -0.5);
    expect(fairPrice(m, { ...row, league: 'eredivisie' }) / fairPrice(m, row)).toBeCloseTo(1.5, 1);
  });

  it('prime du club : à profil égal, le marché paie plus cher les joueurs du club 7', () => {
    const m = fitPriceModel(market())!;
    const row = { ...profile, l15: 60, l5: 60, age: 27, league: 'ligue-1-fr', position: 'Midfielder' as const };
    const ratio = fairPrice(m, { ...row, teamId: 7 }) / fairPrice(m, { ...row, teamId: 1 });
    expect(ratio).toBeGreaterThan(1.6); // ×2 réel, rétréci (16 joueurs)
    expect(ratio).toBeLessThan(2.1);
    expect(fairPrice(m, { ...row, teamId: 99 })).toBeCloseTo(fairPrice(m, { ...row, teamId: null })); // club inconnu : pas de prime
  });

  it('trop peu de joueurs cotés : pas de modèle', () => {
    expect(fitPriceModel(market(10))).toBeNull();
  });

  it('prix potentiel : monte si le score attendu dépasse son niveau, baisse sinon', () => {
    const m = fitPriceModel(market())!;
    const r: MarketRow = { ...profile, playerId: 1, price: 40, l15: 55, l5: 55, age: 25, league: 'ligue-1-fr', position: 'Forward' };
    expect(potentialPrice(m, r, 80)).toBeGreaterThan(40);
    expect(potentialPrice(m, r, 30)).toBeLessThan(40);
    expect(potentialPrice(m, r, 55)).toBeCloseTo(40, 5);
  });
});

describe('tendance du prix', () => {
  const now = Date.parse('2026-10-29T00:00:00Z');
  const sale = (daysAgo: number, eur: number) => ({ date: new Date(now - daysAgo * 86_400_000).toISOString(), eur });
  it('médiane 7 jours / médiane des 3 semaines précédentes', () => {
    expect(priceTrend([sale(1, 12), sale(2, 12), sale(10, 10), sale(20, 10), sale(40, 1)], now)).toBeCloseTo(0.2);
    expect(priceTrend([sale(1, 12)], now)).toBeNull();
  });
  it('médiane', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('valueHistory', () => {
  const day = (d: string, prices: Record<string, number>) => Object.entries(prices).map(([slug, price]) => ({ slug, day: d, price }));
  it('chaîne les variations des joueurs vendus aux deux dates et finit sur la valeur estimée actuelle', () => {
    // Dates espacées de plus de 3 jours : pas de lissage entre elles.
    const h = valueHistory([
      ...day('2026-10-01', { a: 10, b: 30, c: 5 }),
      ...day('2026-10-05', { a: 12, b: 36, c: 6 }), // +20 %
      ...day('2026-10-09', { a: 12, d: 99, e: 7 }), // seul a en commun : stable
    ], 120, 1);
    expect(h.map((p) => p.day)).toEqual(['2026-10-01', '2026-10-05', '2026-10-09']);
    expect(h.map((p) => Math.round(p.value))).toEqual([100, 120, 120]);
    expect(h.map((p) => p.players)).toEqual([3, 3, 3]);
  });
  it('prix lissé sur 3 jours glissants : une journée aberrante ne fait pas plonger la courbe', () => {
    const h = valueHistory([
      ...day('2026-10-22', { a: 10, b: 10, c: 10 }),
      ...day('2026-10-23', { a: 10, b: 10, c: 10 }),
      ...day('2026-10-24', { a: 2, b: 10, c: 10 }), // a : médiane (10, 10, 2) = 10
    ], 30, 1);
    expect(h.map((p) => Math.round(p.value))).toEqual([30, 30, 30]);
  });
  it('moyenne pondérée des jours précédents (7, 6, 5…) : un jour isolé pèse moins, le dernier point reste la valeur actuelle', () => {
    const d = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    // Valeurs brutes 100, 100, 100, 50 (chute d'un jour), puis retour à 100
    const raw = [10, 10, 10, 5, 10];
    const prices = raw.flatMap((p, i) => day(d(1 + i * 4), { a: p, b: p, c: p }));
    const flat = valueHistory(prices, 100, 1).map((p) => Math.round(p.value));
    expect(flat).toEqual([100, 100, 100, 50, 100]);
    const h = valueHistory(prices, 100).map((p) => p.value);
    // Le creux : (7 × 50 + 6 × 100 + 5 × 100 + 4 × 100) / 22 = 84,1, remis à l'échelle du dernier point
    const last = (7 * 100 + 6 * 50 + 5 * 100 + 4 * 100 + 3 * 100) / 25;
    expect(h[3]).toBeCloseTo(((7 * 50 + 6 * 100 + 5 * 100 + 4 * 100) / 22) * (100 / last));
    expect(h.at(-1)).toBeCloseTo(100);
    expect(Math.min(...h)).toBeGreaterThan(80);
  });
  it('jours trop pauvres écartés (moins de 3 joueurs ou moins de la moitié du jour le plus fourni)', () => {
    const h = valueHistory([
      ...day('2026-10-16', { a: 2 }),
      ...day('2026-10-21', { a: 10, b: 10, c: 10 }),
      ...day('2026-10-22', { a: 10, b: 10, c: 10, d: 1, e: 1, f: 1, g: 1 }),
      ...day('2026-10-23', { a: 11, b: 11, c: 11, d: 1.1 }),
    ], 50);
    expect(h.map((p) => p.day)).toEqual(['2026-10-22', '2026-10-23']);
    expect(valueHistory([], 80)).toEqual([]);
    // Championnat : jour le plus fourni à 100 joueurs, seuil plafonné à 20 (et non 50)
    const many = (d: string, n: number) => day(d, Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, 10])));
    expect(valueHistory([...many('2026-10-01', 25), ...many('2026-10-05', 100), ...many('2026-10-09', 15)], 1).map((p) => p.day))
      .toEqual(['2026-10-01', '2026-10-05']);
  });
});
