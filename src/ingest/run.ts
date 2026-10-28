// Point d'entrée de l'import quotidien : npm run ingest
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { createSorareClient } from '@/sources/sorare';
import { importClubs } from './clubs';
import { importFixtures } from './fixtures';
import { importPlayerStatuses } from './playerStatuses';
import { importProfiles } from './profiles';
import { recomputeAggregates } from './aggregates';
import { seasonStart } from './leagues';

config({ path: '.env.local', quiet: true });

/** Durée maximale consacrée aux matchs à compléter ; le reste est repris à l'import suivant. */
const BUDGET_MINUTES = Number(process.env.INGEST_BUDGET_MINUTES) || 35;

async function main() {
  const sql = getSql();
  const repo = createRepo(sql);
  const deps = { repo, sorare: createSorareClient(process.env.SORARE_API_KEY) };
  const deadline = Date.now() + BUDGET_MINUTES * 60_000;
  const runId = await repo.startRun();
  try {
    // Chaque jour : suit les promotions / relégations.
    const { clubs } = await importClubs(deps);
    // Avant les matchs : la sélection de chaque joueur détermine les matchs internationaux à importer.
    // (Un joueur apparu aujourd'hui aura son statut au prochain import.)
    const statuses = await importPlayerStatuses(deps);
    console.log(`Statuts mis à jour : ${statuses.updated}`);
    // Identité et historique par saison (rapide, avant les matchs) : 8 minutes au plus, le reste est repris le lendemain.
    const profiles = await importProfiles(deps, { deadline: Date.now() + 8 * 60_000, concurrency: 3 });
    console.log(`Profils mis à jour : ${profiles.updated}`);
    const result = await importFixtures(deps, undefined, { deadline: deadline + 8 * 60_000, since: seasonStart(), concurrency: 8 });
    const agg = await recomputeAggregates(repo);
    await repo.finishRun(runId, 'ok', result.fixturesImported, [...result.errors, ...statuses.errors, ...profiles.errors]);
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
