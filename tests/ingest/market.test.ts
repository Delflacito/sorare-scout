import type postgres from 'postgres';
import { describeDb, freshDb } from '../helpers/db';
import { seedLeague } from '../helpers/seed';
import type { MarketInputRow, Repo } from '@/db/repo';
import { computeMarket, importMarket, recomputeMarket } from '@/ingest/market';
import type { SorareClient, SorarePlayerMarket } from '@/sources/sorare';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/** Marché synthétique de 60 joueurs cotés : prix ≈ 2 × e^(0,05 × L15). */
function inputs(): MarketInputRow[] {
  return Array.from({ length: 60 }, (_, i) => {
    const l15 = 30 + (i % 40);
    const price = 2 * Math.exp(0.05 * l15) * (1 + ((i * 7) % 5 - 2) / 100);
    return {
      playerId: i, floorInSeason: price, l15, l5: l15, allAround: 30, startRate: 0.9, minutes: 80, birthDate: '2000-01-01',
      league: 'ligue-1-fr', position: 'Forward', nextProjected: l15, teamId: i % 5, clubPpg: 1.5, prevGoalsAssists: 4,
      international: false, status: 'STARTER',
      sales: [daysAgo(1), daysAgo(2), daysAgo(3)].map((date) => ({ date, eur: price })),
    };
  });
}

describe('computeMarket', () => {
  it('sous-évalué : prix nettement sous la valeur estimée ; potentiel selon le score attendu', () => {
    const rows = inputs();
    rows[0] = { ...rows[0], l15: 70, l5: 75, floorInSeason: 20, nextProjected: 85 }; // valeur attendue ≈ 66 €
    rows[1] = { ...rows[1], floorInSeason: null }; // pas d'offre : médiane des ventes
    const out = computeMarket(rows, NOW);
    const cheap = out.find((r) => r.playerId === 0)!;
    expect(cheap.valueRatio).toBeLessThan(0.5);
    expect(cheap.potentialGain).toBeGreaterThan(0);
    expect(out.find((r) => r.playerId === 1)!.referencePrice).toBeCloseTo(out.find((r) => r.playerId === 1)!.recentPrice!);
    const typical = out.find((r) => r.playerId === 10)!;
    expect(typical.valueRatio).toBeCloseTo(1, 1);
    expect(typical.potentialGain).toBeCloseTo(0, 5); // score attendu = son niveau
  });

  it('calibré sur les planchers : les ventes gonflées des joueurs sans offre ne faussent pas la valeur estimée', () => {
    const rows = inputs();
    for (const i of [1, 2, 3, 4, 5, 6]) {
      rows[i] = { ...rows[i], floorInSeason: null, sales: rows[i].sales.map((s) => ({ ...s, eur: s.eur * 3 })) };
    }
    const out = computeMarket(rows, NOW);
    expect(out.find((r) => r.playerId === 10)!.valueRatio).toBeCloseTo(1, 1);
    const noFloor = out.find((r) => r.playerId === 1)!;
    expect(noFloor).toMatchObject({ fairPrice: null, valueRatio: null, potentialPrice: null, potentialGain: null });
  });

  it('joueur sans prix ignoré ; trop peu de joueurs cotés : pas de valeur estimée', () => {
    const rows = inputs().slice(0, 5);
    rows.push({ ...rows[0], playerId: 99, floorInSeason: null, sales: [] });
    const out = computeMarket(rows, NOW);
    expect(out.map((r) => r.playerId)).not.toContain(99);
    expect(out.every((r) => r.fairPrice === null && r.potentialPrice === null)).toBe(true);
  });
});

describeDb('importMarket', () => {
  let sql: postgres.Sql;
  let repo: Repo;
  beforeEach(async () => {
    ({ sql, repo } = await freshDb());
    await seedLeague(repo);
  });
  afterEach(() => sql.end());

  const sorare = (calls: string[][]) => ({
    exchangeRates: async () => ({ usdToEur: 0.9, weiToEur: 2e-15 }),
    playerMarkets: async (slugs: string[]): Promise<SorarePlayerMarket[]> => {
      calls.push(slugs);
      return slugs.map((slug) => ({
        slug, floorInSeason: 12.5, floorClassic: slug === 'greenwood' ? 4 : null,
        sales: [{ date: '2026-10-28T10:00:00Z', eur: 11, seasonYear: 2026, auction: true, dealType: 'TokenAuction' }, { date: '2026-10-27T10:00:00Z', eur: 3, seasonYear: 2023, auction: false, dealType: 'TokenOffer' }],
      }));
    },
  }) as unknown as SorareClient;

  it('prix planchers et ventes enregistrés (sans doublon), puis prix de référence calculé', async () => {
    const calls: string[][] = [];
    const r = await importMarket({ sorare: sorare(calls), repo }, { batchSize: 2, season: 2026 });
    expect(r).toEqual({ updated: 4, errors: [] });
    expect(calls.flat().sort()).toEqual(['greenwood', 'lacazette', 'nuno-mendes', 'tagliafico']);
    await importMarket({ sorare: sorare([]), repo }, { season: 2026 });
    const [g] = await sql`select floor_in_season, floor_classic from players where sorare_slug = 'greenwood'`;
    expect(g).toEqual({ floor_in_season: 12.5, floor_classic: 4 });
    const sales = await sql`select price_eur, in_season, auction, deal_type from card_sales s join players p on p.id = s.player_id
      where p.sorare_slug = 'greenwood' order by sold_at`;
    expect(sales).toEqual([{ price_eur: 3, in_season: false, auction: false, deal_type: 'TokenOffer' }, { price_eur: 11, in_season: true, auction: true, deal_type: 'TokenAuction' }]);
    expect(await recomputeMarket(repo)).toBe(4);
    const [m] = await sql`select reference_price, fair_price from player_market pm join players p on p.id = pm.player_id where p.sorare_slug = 'greenwood'`;
    expect(m).toEqual({ reference_price: 12.5, fair_price: null }); // 4 joueurs cotés : pas assez pour estimer
  });

  it('taux de change indisponible : erreur signalée, rien d’autre', async () => {
    const failing = { exchangeRates: async () => { throw new Error('timeout'); } } as unknown as SorareClient;
    expect(await importMarket({ sorare: failing, repo })).toEqual({ updated: 0, errors: ['taux de change : timeout'] });
  });
});
