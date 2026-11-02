import { parseRoi, roiGroupOf, roiTotals } from '@/lib/roi';

describe('ROI', () => {
  it('championnats regroupés, Contender compris', () => {
    expect(roiGroupOf('eredivisie')).toBe('eredivisie');
    expect(roiGroupOf('ligue-2-fr')).toBe('contender');
    expect(roiGroupOf('1-hnl')).toBe('contender');
    expect(roiGroupOf('mlspa')).toBeNull();
    expect(roiGroupOf(null)).toBeNull();
  });

  it('ROI brut (streaks + reventes) et avec la valeur actuelle des cartes', () => {
    const owned = { cards: 3, invested: 100, unknownPurchase: 0, value: 80, unpriced: 0 };
    const t = roiTotals(owned, {
      streaks: [{ level: 'Palier 1', count: 3, eur: 30 }, { level: 'Palier 2', count: 1, eur: 20 }],
      essence: 500,
      sold: [{ name: 'X', bought: 25, sold: 40 }],
    });
    expect(t).toEqual({ invested: 125, streaks: 50, resales: 40, gains: 90, value: 80, roiGross: 90 / 125 - 1, roiWithValue: 170 / 125 - 1 });
    expect(roiTotals({ ...owned, invested: 0 }, { streaks: [], essence: 0, sold: [] }).roiGross).toBeNull();
  });

  it('saisies vérifiées avant enregistrement', () => {
    const ok = { eredivisie: { streaks: [{ level: 'P1', count: 2, eur: 10 }], essence: 3, sold: [] } };
    expect(parseRoi(ok)).toEqual(ok);
    expect(parseRoi({ inconnu: ok.eredivisie })).toBeNull();
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, essence: -1 } })).toBeNull();
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, sold: [{ name: 'X', bought: '3', sold: 1 }] } })).toBeNull();
    expect(parseRoi([])).toBeNull();
  });
});
