/** Sélection enregistrée de la page Streak : un nom et les joueurs choisis, match par match (« idMatch:slugJoueur »). */
export interface StreakPlan { id: string; name: string; picks: string[] }

const PICK = /^\d{1,10}:[a-z0-9-]{1,120}$/;

/** Sélections reçues du navigateur, vérifiées avant d'être enregistrées ; null si elles sont mal formées. */
export function parsePlans(x: unknown): StreakPlan[] | null {
  if (!Array.isArray(x) || x.length > 50) return null;
  const ok = x.every((p) => p && typeof p === 'object'
    && typeof p.id === 'string' && /^[a-z0-9-]{1,40}$/.test(p.id)
    && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 60
    && Array.isArray(p.picks) && p.picks.length <= 200 && p.picks.every((k: unknown) => typeof k === 'string' && PICK.test(k)));
  return ok ? x.map(({ id, name, picks }) => ({ id, name: name.trim(), picks: [...new Set(picks as string[])] })) : null;
}
