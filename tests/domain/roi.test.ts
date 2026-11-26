import { breakEven, parseRoi, roiGroupOf, roiTotals, upsertWeek, weekOf } from '@/lib/roi';

describe('ROI', () => {
  it('championnats regroupés, Contender compris', () => {
    expect(roiGroupOf('eredivisie')).toBe('eredivisie');
    expect(roiGroupOf('ligue-2-fr')).toBe('contender');
    expect(roiGroupOf('1-hnl')).toBe('contender');
    expect(roiGroupOf('premiership-gb-sct')).toBe('ecosse');
    expect(roiGroupOf('premier-league-gb-eng')).toBe('premier');
    expect(roiGroupOf('laliga-es')).toBe('liga');
    expect(roiGroupOf('bundesliga-de')).toBe('bundesliga');
    expect(roiGroupOf('mlspa')).toBeNull();
    expect(roiGroupOf(null)).toBeNull();
  });

  it('streaks comptés par palier selon le barème du championnat ; ROI brut et avec la valeur des cartes', () => {
    const owned = { cards: 3, invested: 100, unknownPurchase: 0, value: 80, unpriced: 0 };
    // Eredivisie : 2 × 320 pts (500 essence), 3 × 360 pts (3 €), 1 × 410 pts (25 €)
    const t = roiTotals('eredivisie', owned, { streaks: { 320: 2, 360: 3, 410: 1 }, sold: [{ name: 'X', bought: 25, sold: 40 }] });
    expect(t).toEqual({
      invested: 125, streakCount: 6, streaks: 34, leaderboard: 0, essence: 1000, resales: 40, gains: 74, value: 80,
      roiGross: 74 / 125 - 1, roiWithValue: 154 / 125 - 1,
    });
    // Leaderboard : ses euros s'ajoutent aux gains, son essence à celle des streaks
    expect(roiTotals('eredivisie', owned, { streaks: { 320: 1 }, leaderboard: { eur: 15, essence: 200 }, sold: [] }))
      .toMatchObject({ leaderboard: 15, gains: 15, essence: 700 });
    // Contender : le palier 360 rapporte de l'essence, pas d'euros
    expect(roiTotals('contender', owned, { streaks: { 360: 2 }, sold: [] })).toMatchObject({ streaks: 0, essence: 2000 });
    expect(roiTotals('eredivisie', { ...owned, invested: 0 }, { streaks: {}, sold: [] }).roiGross).toBeNull();
  });

  it('saisies vérifiées avant enregistrement', () => {
    const ok = { eredivisie: { streaks: { 320: 2, 460: 1 }, sold: [] } };
    expect(parseRoi(ok)).toEqual(ok);
    expect(parseRoi({ inconnu: ok.eredivisie })).toBeNull();
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, streaks: { 550: 1 } } })).toBeNull(); // palier inexistant en Eredivisie
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, streaks: { 320: 1.5 } } })).toBeNull();
    expect(parseRoi({ eredivisie: { streaks: [], essence: 0, sold: [] } })).toBeNull(); // ancien format
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, sold: [{ name: 'X', bought: '3', sold: 1 }] } })).toBeNull();
    expect(parseRoi([])).toBeNull();
    const lb = { eredivisie: { ...ok.eredivisie, leaderboard: { eur: 12.5, essence: 300 } } };
    expect(parseRoi(lb)).toEqual(lb);
    expect(parseRoi({ eredivisie: { ...ok.eredivisie, leaderboard: { eur: -1, essence: 0 } } })).toBeNull();
  });

  it('historique : une entrée par semaine (lundi), remplacée dans la même semaine', () => {
    expect(weekOf(new Date('2026-11-05T10:00:00Z'))).toBe('2026-11-02'); // jeudi → lundi
    expect(weekOf(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-02'); // dimanche
    const h = upsertWeek([{ week: '2026-10-26', invested: 10, gains: 1, value: 9 }], { week: '2026-11-02', invested: 10, gains: 2, value: 9 });
    expect(upsertWeek(h, { week: '2026-11-02', invested: 12, gains: 3, value: 9 }).map((w) => [w.week, w.gains])).toEqual([['2026-10-26', 1], ['2026-11-02', 3]]);
  });

  it('seuil de rentabilité : streaks en euros restant à gagner pour couvrir l’investi', () => {
    const owned = { cards: 1, invested: 120, unknownPurchase: 0, value: 0, unpriced: 0 };
    const t = roiTotals('eredivisie', owned, { streaks: { 410: 1 }, sold: [] }); // reste 95 €
    expect(breakEven('eredivisie', t)).toEqual([
      { score: 360, eur: 3, count: 32 }, { score: 380, eur: 5, count: 19 }, { score: 410, eur: 25, count: 4 },
      { score: 440, eur: 100, count: 1 }, { score: 460, eur: 1000, count: 1 },
    ]);
    expect(breakEven('eredivisie', roiTotals('eredivisie', owned, { streaks: { 440: 2 }, sold: [] }))).toEqual([]);
  });
});
