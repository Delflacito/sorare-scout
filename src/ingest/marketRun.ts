// Rafraîchissement du marché en cours de journée : npm run market
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { createSorareClient } from '@/sources/sorare';
import { importMarket, recomputeMarket } from './market';

config({ path: '.env.local', quiet: true });

async function main() {
  const sql = getSql();
  const repo = createRepo(sql);
  try {
    // MARKET_SALES : ventes demandées par joueur (rattrapage de l'historique, lancé à la main).
    const sales = Number(process.env.MARKET_SALES) || undefined;
    const market = await importMarket({ repo, sorare: createSorareClient(process.env.SORARE_API_KEY) }, { deadline: Date.now() + 50 * 60_000, concurrency: 3, sales });
    const priced = await recomputeMarket(repo);
    console.log(`Marché : ${market.updated} joueurs, ${priced} cotés`);
    for (const e of market.errors.slice(0, 20)) console.log(`  erreur : ${e}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
