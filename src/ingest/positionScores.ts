import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import type { GenericPosition } from '@/domain/types';

export interface PositionScoresDeps { sorare: SorareClient; repo: Repo }

/**
 * Joueurs à plusieurs postes de carte : score de chaque match récent au barème de chacun de leurs postes
 * (regroupés par combinaison de postes, une requête Sorare par lot).
 */
export async function importPositionScores(deps: PositionScoresDeps, opts: { deadline?: number; batchSize?: number } = {}): Promise<{ saved: number; errors: string[] }> {
  const size = opts.batchSize ?? 10;
  const groups = new Map<string, string[]>();
  for (const p of await deps.repo.multiPositionPlayers()) {
    const key = [...p.positions].sort().join(',');
    groups.set(key, [...(groups.get(key) ?? []), p.slug]);
  }
  let saved = 0;
  const errors: string[] = [];
  for (const [key, slugs] of groups) {
    const positions = key.split(',') as GenericPosition[];
    for (let i = 0; i < slugs.length; i += size) {
      if (opts.deadline !== undefined && Date.now() > opts.deadline) return { saved, errors };
      const batch = slugs.slice(i, i + size);
      try {
        saved += await deps.repo.savePositionScores(await deps.sorare.positionScores(batch, positions));
      } catch (e) {
        errors.push(`scores par poste ${batch.join(', ')} : ${(e as Error).message}`);
      }
    }
  }
  return { saved, errors };
}
