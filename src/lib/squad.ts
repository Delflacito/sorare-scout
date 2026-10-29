import type { SquadEntry } from '@/components/SquadBuilder';

/** Pseudo Sorare : minuscules, chiffres, tirets et soulignés. */
export const PSEUDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Effectif reçu du navigateur, vérifié avant d'être enregistré ; null s'il est mal formé. */
export function parseSquad(x: unknown): SquadEntry[] | null {
  if (!Array.isArray(x) || x.length > 2000) return null;
  const ok = x.every((e) => e && typeof e === 'object'
    && typeof e.slug === 'string' && e.slug.length <= 120
    && typeof e.competition === 'string' && e.competition.length <= 120
    && (e.status === 'owned' || e.status === 'target')
    && (e.purchasePrice === null || (typeof e.purchasePrice === 'number' && Number.isFinite(e.purchasePrice) && e.purchasePrice >= 0))
    && (e.fromSorare === undefined || typeof e.fromSorare === 'boolean'));
  return ok ? x.map(({ slug, competition, status, purchasePrice, fromSorare }) => ({ slug, competition, status, purchasePrice, ...(fromSorare ? { fromSorare } : {}) })) : null;
}
