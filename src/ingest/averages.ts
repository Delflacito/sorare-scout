import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { playedAverages } from '@/domain/metrics';

/**
 * L5…L50 lus chez Sorare : les 60 dernières notes de chaque joueur, saisons précédentes et autres compétitions comprises
 * (la base ne garde que les matchs de la saison). Les moyennes les plus anciennes sont rafraîchies d'abord.
 */
export async function importAverages(deps: { sorare: SorareClient; repo: Repo }, opts: { deadline?: number; batchSize?: number } = {}) {
  const size = opts.batchSize ?? 25;
  const slugs = await deps.repo.averagesQueue();
  let saved = 0;
  const errors: string[] = [];
  for (let i = 0; i < slugs.length; i += size) {
    if (opts.deadline !== undefined && Date.now() > opts.deadline) break;
    const batch = slugs.slice(i, i + size);
    try {
      const players = await deps.sorare.recentScores(batch);
      saved += await deps.repo.savePlayerAverages(players.map((p) => ({ slug: p.slug, ...playedAverages(p.games) })));
    } catch (e) {
      errors.push(`moyennes ${batch[0]}… : ${(e as Error).message}`);
    }
  }
  return { saved, errors };
}
