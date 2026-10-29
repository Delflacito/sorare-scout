export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Renvoie v s'il fait partie des valeurs autorisées, sinon undefined. */
export function oneOf<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined;
}

/** Seuils de titularisation proposés (en % des 5 derniers matchs du club). */
export const START_RATE_LEVELS = [0, 40, 60, 80, 100] as const;
/** Seuil de titularisation lu dans l'URL (paramètre titu), sinon la valeur par défaut. */
export function startRateParam(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v !== undefined && (START_RATE_LEVELS as readonly number[]).includes(n) ? n : fallback;
}
export const startRateLabel = (n: number) => (n === 0 ? 'Tous' : n === 100 ? '100 %' : `≥ ${n} %`);
