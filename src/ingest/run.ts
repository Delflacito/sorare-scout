// Point d'entrée de l'import quotidien : npm run ingest
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { createSorareClient } from '@/sources/sorare';
import { importClubs } from './clubs';
import { importFixtures } from './fixtures';
import { recomputeAggregates } from './aggregates';

config({ path: '.env.local', quiet: true });

async function main() {
  const sql = getSql();
  const repo = createRepo(sql);
  const deps = { repo, sorare: createSorareClient(process.env.SORARE_API_KEY) };
  const runId = await repo.startRun();
  try {
    // Chaque jour : suit les promotions / relégations.
    const { clubs } = await importClubs(deps);
    const result = await importFixtures(deps);
    const agg = await recomputeAggregates(repo);
    await repo.finishRun(runId, 'ok', result.fixturesImported, result.errors);
    console.log(`Clubs : ${clubs}, matchs importés : ${result.fixturesImported}, joueurs : ${agg.players}, lignes concédées : ${agg.conceded}`);
    for (const e of result.errors) console.log(`  erreur : ${e}`);
  } catch (e) {
    await repo.finishRun(runId, 'error', 0, [(e as Error).message]);
    throw e;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
