import { fairPrice, fitPriceModel, median, potentialPrice, priceTrend, type MarketRow } from '@/domain/market';

/** Marché synthétique : prix = 2 € × e^(0,05 × L15) × (×1,5 en Eredivisie), avec un léger bruit déterministe. */
function market(n = 80): MarketRow[] {
  return Array.from({ length: n }, (_, i) => {
    const l15 = 30 + (i % 40);
    const league = i % 2 ? 'eredivisie' : 'ligue-1-fr';
    const noise = 1 + ((i * 7) % 5 - 2) / 100;
    return {
      playerId: i, l15, l5: l15, startRate: 0.8, age: 24 + (i % 8), league, position: i % 3 ? 'Midfielder' : 'Forward',
      price: 2 * Math.exp(0.05 * l15) * (league === 'eredivisie' ? 1.5 : 1) * noise,
    };
  });
}

describe('valeur estimée des cartes', () => {
  it('retrouve la relation prix / performance du marché', () => {
    const m = fitPriceModel(market())!;
    const row = { l15: 60, l5: 60, startRate: 0.8, age: 27, league: 'ligue-1-fr', position: 'Midfielder' as const };
    expect(fairPrice(m, row)).toBeCloseTo(2 * Math.exp(3), -0.5);
    expect(fairPrice(m, { ...row, league: 'eredivisie' }) / fairPrice(m, row)).toBeCloseTo(1.5, 1);
  });

  it('trop peu de joueurs cotés : pas de modèle', () => {
    expect(fitPriceModel(market(10))).toBeNull();
  });

  it('prix potentiel : monte si le score attendu dépasse son niveau, baisse sinon', () => {
    const m = fitPriceModel(market())!;
    const r: MarketRow = { playerId: 1, price: 40, l15: 55, l5: 55, startRate: 1, age: 25, league: 'ligue-1-fr', position: 'Forward' };
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
