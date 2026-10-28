// Point d'entrée de l'import quotidien : npm run ingest [-- --clubs]
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { createSorareClient } from '@/sources/sorare';
import { createApiFootballClient } from '@/sources/apiFootball';
import { importClubs } from './clubs';
import { importFixtures } from './fixtures';
import { recomputeAggregates } from './aggregates';
import { currentSeason } from './leagues';

config({ path: '.env.local', quiet: true });

async function main() {
  const afKey = process.env.API_FOOTBALL_KEY;
  if (!afKey) throw new Error('API_FOOTBALL_KEY manquant');
  const sql = getSql();
  const repo = createRepo(sql);
  const deps = { repo, sorare: createSorareClient(process.env.SORARE_API_KEY), apiFootball: createApiFootballClient(afKey) };
  const season = currentSeason();
  const runId = await repo.startRun();
  try {
    if (process.argv.includes('--clubs') || !(await repo.allTeams()).length) {
      const clubs = await importClubs(deps, season);
      console.log(`Clubs appariés : ${clubs.matched}`);
      for (const u of clubs.unmatched) console.log(`  non apparié (${u.source}) : ${u.name}`);
    }
    const result = await importFixtures(deps, season);
    const agg = await recomputeAggregates(repo);
    await repo.finishRun(runId, result.status, result.fixturesImported, result.errors);
    console.log(`Matchs importés : ${result.fixturesImported} (${result.status}), joueurs : ${agg.players}, lignes concédées : ${agg.conceded}`);
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
