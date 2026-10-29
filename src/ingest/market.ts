import type { MarketInputRow, PlayerMarketRow, Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { fairPrice, fitPriceModel, median, potentialPrice, priceTrend, type MarketRow } from '@/domain/market';
import { ageAt } from '@/lib/format';
import { seasonStart } from './leagues';

export interface MarketDeps { sorare: SorareClient; repo: Repo }
export interface MarketOptions { deadline?: number; batchSize?: number; concurrency?: number; season?: number }

/** Prix planchers et dernières ventes Limited de chaque joueur des clubs suivis. */
export async function importMarket(deps: MarketDeps, opts: MarketOptions = {}): Promise<{ updated: number; errors: string[] }> {
  const season = opts.season ?? new Date(seasonStart()).getUTCFullYear();
  const size = opts.batchSize ?? 20;
  const slugs = await deps.repo.playersForMarket();
  const batches = Array.from({ length: Math.ceil(slugs.length / size) }, (_, i) => slugs.slice(i * size, (i + 1) * size));
  const errors: string[] = [];
  let updated = 0;
  let rates;
  try {
    rates = await deps.sorare.exchangeRates();
  } catch (e) {
    return { updated, errors: [`taux de change : ${(e as Error).message}`] };
  }
  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      if (opts.deadline !== undefined && Date.now() > opts.deadline) return;
      try {
        const markets = await deps.sorare.playerMarkets(batch, rates, season);
        await deps.repo.saveMarkets(markets, season);
        updated += markets.length;
      } catch (e) {
        errors.push(`marché ${batch.join(', ')} : ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 1 }, worker));
  return { updated, errors };
}

/**
 * Valeur estimée et potentiel de chaque joueur coté (fonction pure) : prix de référence = carte de la saison la moins chère
 * en vente, à défaut médiane des 5 dernières ventes ; valeur estimée = modèle prix / performances ajusté sur tout le marché.
 */
export function computeMarket(inputs: MarketInputRow[], now = Date.now()): PlayerMarketRow[] {
  const priced = inputs.map((r) => {
    const sorted = [...r.sales].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const recentPrice = median(sorted.slice(0, 5).map((s) => s.eur));
    return { r, recentPrice, referencePrice: r.floorInSeason ?? recentPrice };
  }).filter((x): x is typeof x & { referencePrice: number } => x.referencePrice !== null && x.referencePrice > 0);

  const toRow = (x: (typeof priced)[number]): MarketRow => ({
    playerId: x.r.playerId, price: x.referencePrice, l15: x.r.l15, l5: x.r.l5, startRate: x.r.startRate,
    age: x.r.birthDate ? ageAt(x.r.birthDate, new Date(now)) : null, league: x.r.league, position: x.r.position,
  });
  // Ajusté sur les joueurs réellement échangés (au moins 3 ventes en 4 semaines) : leur prix reflète le marché.
  const model = fitPriceModel(priced.filter((x) => x.r.sales.length >= 3).map(toRow));
  return priced.map((x) => {
    const row = toRow(x);
    const fair = model ? fairPrice(model, row) : null;
    const potential = model && x.r.nextProjected !== null ? potentialPrice(model, row, x.r.nextProjected) : null;
    return {
      playerId: x.r.playerId, referencePrice: x.referencePrice, recentPrice: x.recentPrice, priceTrend7: priceTrend(x.r.sales, now),
      sales30: x.r.sales.length, fairPrice: fair, valueRatio: fair ? x.referencePrice / fair : null,
      potentialPrice: potential, potentialGain: potential === null ? null : potential / x.referencePrice - 1,
    };
  });
}

export async function recomputeMarket(repo: Repo): Promise<number> {
  const rows = computeMarket(await repo.marketInputs());
  await repo.replacePlayerMarket(rows);
  return rows.length;
}
