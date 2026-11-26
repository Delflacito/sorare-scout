import type { MarketInputRow, PlayerMarketRow, Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { estimatedValue, fitPriceModel, median, potentialPrice, priceTrend, type MarketRow } from '@/domain/market';
import { ageAt } from '@/lib/format';
import { seasonStart } from './leagues';

export interface MarketDeps { sorare: SorareClient; repo: Repo }
/** sales : nombre de dernières ventes demandées par joueur (50 par défaut ; davantage pour reconstituer l'historique). */
export interface MarketOptions { deadline?: number; batchSize?: number; concurrency?: number; season?: number; sales?: number }

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
        const markets = await deps.sorare.playerMarkets(batch, rates, season, opts.sales);
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

/** Plancher plus de FLOOR_OUTLIER fois au-dessus de la médiane des 5 dernières reventes (à défaut de la dernière vente) : jugé aberrant. */
export const FLOOR_OUTLIER = 5;

/**
 * Valeur estimée et potentiel de chaque joueur coté (fonction pure) : prix de référence = carte de la saison la moins chère
 * en vente (sauf plancher aberrant), à défaut médiane des 5 dernières reventes entre managers ; valeur estimée = modèle prix / performances
 * ajusté sur tout le marché.
 */
export function computeMarket(inputs: MarketInputRow[], now = Date.now()): PlayerMarketRow[] {
  const priced = inputs.map((r) => {
    // Reventes entre managers seulement : les enchères (2 € minimum) et ventes directes de Sorare sont au-dessus du marché.
    const resales = r.sales.filter((s) => s.secondary).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const recentPrice = median(resales.slice(0, 5).map((s) => s.eur));
    // Plancher aberrant (une seule carte en vente, hors de prix) : les dernières reventes font foi, à défaut la dernière
    // vente connue (souvent une enchère de Sorare, un peu au-dessus du marché secondaire).
    const lastKnown = recentPrice ?? r.lastSale;
    const absurd = r.floorInSeason !== null && lastKnown !== null && r.floorInSeason > FLOOR_OUTLIER * lastKnown;
    return { r, resales, recentPrice, referencePrice: absurd ? lastKnown : r.floorInSeason ?? recentPrice };
  }).filter((x): x is typeof x & { referencePrice: number } => x.referencePrice !== null && x.referencePrice > 0);

  const toRow = ({ r, referencePrice }: (typeof priced)[number]): MarketRow => ({
    playerId: r.playerId, price: referencePrice, l15: r.l15, l5: r.l5, allAround: r.allAround, decisive: r.decisive, startRate: r.startRate, minutes: r.minutes,
    age: r.birthDate ? ageAt(r.birthDate, new Date(now)) : null, league: r.league, position: r.position, teamId: r.teamId,
    clubPpg: r.clubPpg, prevGoalsAssists: r.prevGoalsAssists, international: r.international, status: r.status,
  });
  // Ajusté sur les joueurs réellement échangés (au moins 3 ventes en 4 semaines) ayant une offre en vente : les ventes
  // mêlent ventes primaires de Sorare (prix fixes, souvent 2 à 3 fois le plancher) et reventes, le plancher est plus fiable.
  const model = fitPriceModel(priced.filter((x) => x.r.floorInSeason !== null && x.r.sales.length >= 3).map(toRow));
  return priced.map((x) => {
    const row = toRow(x);
    // Sans offre, le prix vient des reventes : pas comparable au modèle, calibré sur les planchers.
    const comparable = model && x.r.floorInSeason !== null ? model : null;
    // Prix habituel : médiane des reventes entre managers sur 4 semaines, à défaut le plancher.
    const usual = median(x.resales.map((s) => s.eur)) ?? x.referencePrice;
    const fair = comparable ? estimatedValue(comparable, row, usual) : null;
    const potential = comparable && x.r.nextProjected !== null ? potentialPrice(comparable, row, x.r.nextProjected) : null;
    return {
      playerId: x.r.playerId, referencePrice: x.referencePrice, recentPrice: x.recentPrice, priceTrend7: priceTrend(x.resales, now),
      sales30: x.r.sales.length, fairPrice: fair, valueRatio: fair ? x.referencePrice / fair : null,
      potentialPrice: potential, potentialGain: potential === null ? null : potential / x.referencePrice - 1,
    };
  });
}

export async function recomputeMarket(repo: Repo): Promise<number> {
  const rows = computeMarket(await repo.marketInputs());
  await repo.replacePlayerMarket(rows);
  // Le journal ne doit pas bloquer l'import (table absente tant que la migration 0022 n'est pas appliquée).
  await repo.snapshotMarket().catch((e) => console.error(`Journal quotidien non enregistré : ${(e as Error).message}`));
  return rows.length;
}
