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
  const sale = (slug: string, day: string, price: number) => ({ slug, day, price });
  it('un point par jour sans trou : vente moyenne du jour, sinon dernière vente des jours précédents', () => {
    const h = valueHistory([
      sale('a', '2026-10-01', 10), sale('b', '2026-10-01', 30),
      sale('a', '2026-10-03', 20), // b non vendu : garde 30
      sale('b', '2026-10-04', 40), // a non vendu : garde 20
    ], 60, 1);
    expect(h.map((p) => p.day)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    // Sommes 40, 40, 50, 60 ; le dernier jour vaut la valeur estimée actuelle (60)
    expect(h.map((p) => Math.round(p.value))).toEqual([40, 40, 50, 60]);
    expect(h.map((p) => p.players)).toEqual([2, 0, 1, 1]);
  });
  it('joueur pas encore vendu : compté à sa première vente connue (son arrivée ne fait pas monter la courbe)', () => {
    const h = valueHistory([sale('a', '2026-10-01', 10), sale('a', '2026-10-02', 10), sale('b', '2026-10-02', 50)], 60, 1);
    expect(h.map((p) => Math.round(p.value))).toEqual([60, 60]);
  });
  it('moyenne pondérée des 3 derniers jours (3, 2, 1) : un jour isolé pèse moins, le dernier point reste la valeur actuelle', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
    const prices = [100, 100, 100, 50, 100].map((p, i) => sale('a', days[i], p));
    expect(valueHistory(prices, 100, 1).map((p) => Math.round(p.value))).toEqual([100, 100, 100, 50, 100]);
    const h = valueHistory(prices, 100).map((p) => p.value);
    // Le creux : (3 × 50 + 2 × 100 + 1 × 100) / 6 = 75, remis à l'échelle du dernier point (3 × 100 + 2 × 50 + 100) / 6
    const last = (3 * 100 + 2 * 50 + 1 * 100) / 6;
    expect(h[3]).toBeCloseTo(75 * (100 / last));
    expect(h.at(-1)).toBeCloseTo(100);
    expect(Math.min(...h)).toBeGreaterThan(80);
  });
  it('aucune vente → vide', () => expect(valueHistory([], 80)).toEqual([]));
});
