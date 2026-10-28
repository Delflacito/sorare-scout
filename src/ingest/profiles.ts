import type { Repo } from '@/db/repo';
import type { SorareClient } from '@/sources/sorare';
import { seasonStart } from './leagues';

export interface ProfilesDeps { sorare: SorareClient; repo: Repo }
export interface ProfilesOptions {
  /** Heure (ms) après laquelle on s'arrête : le reste est repris au prochain import. */
  deadline?: number;
  /** Joueurs par requête Sorare. */
  batchSize?: number;
  /** Saisons demandées, de la plus récente à la plus ancienne. */
  seasons?: number[];
  concurrency?: number;
}

/** Saison en cours et les 5 précédentes (année de début). */
export function recentSeasons(now = new Date(), count = 6): number[] {
  const current = new Date(seasonStart(now)).getUTCFullYear();
  return Array.from({ length: count }, (_, i) => current - i);
}

/** Identité (naissance, nationalité) et historique en championnat des joueurs, rafraîchis une fois par semaine. */
export async function importProfiles(deps: ProfilesDeps, opts: ProfilesOptions = {}): Promise<{ updated: number; errors: string[] }> {
  const seasons = opts.seasons ?? recentSeasons();
  const size = opts.batchSize ?? 5;
  const slugs = await deps.repo.playersNeedingProfile();
  const batches = Array.from({ length: Math.ceil(slugs.length / size) }, (_, i) => slugs.slice(i * size, (i + 1) * size));
  let updated = 0;
  const errors: string[] = [];
  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      if (opts.deadline !== undefined && Date.now() > opts.deadline) return;
      try {
        const profiles = await deps.sorare.playerProfiles(batch, seasons);
        await deps.repo.saveProfiles(profiles);
        await deps.repo.touchProfiles(batch);
        updated += profiles.length;
      } catch (e) {
        errors.push(`profils ${batch.join(', ')} : ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 1 }, worker));
  return { updated, errors };
}
