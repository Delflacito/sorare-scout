export interface Candidate {
  id: string;
  name: string;
}

export interface FixtureKey {
  id: string;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
}

/** Alias de clubs (nom normalisé → nom normalisé), appliqués avant les règles de rapprochement. */
export const CLUB_ALIASES: Record<string, string> = {};

const CLUB_STOPWORDS = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'ssc', 'afc', 'rc', 'ogc', 'stade', 'club', 'de']);
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (s: string) => (s ? s.split(' ') : []);

/** Applique les règles dans l'ordre ; la première règle qui donne exactement un candidat gagne, plusieurs → null. */
function matchNormalized(target: string, candidates: { id: string; norm: string }[]): string | null {
  const t = tokens(target);
  const rules: ((c: string[]) => boolean)[] = [
    (c) => c.join(' ') === target,
    (c) =>
      t.length >= 2 && c.length >= 2 && c[c.length - 1] === t[t.length - 1] && c[0][0] === t[0][0],
    (c) => {
      const [small, big] = c.length <= t.length ? [c, t] : [t, c];
      return small.length > 0 && small.every((x) => big.includes(x));
    },
  ];
  for (const rule of rules) {
    const hits = candidates.filter((c) => rule(tokens(c.norm)));
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) return null;
  }
  return null;
}

export function matchPlayer(name: string, roster: Candidate[]): string | null {
  return matchNormalized(
    normalizeName(name),
    roster.map((c) => ({ id: c.id, norm: normalizeName(c.name) })),
  );
}

function normalizeClub(name: string): string {
  const n = normalizeName(name);
  const aliased = CLUB_ALIASES[n] ?? n;
  return tokens(aliased).filter((x) => !CLUB_STOPWORDS.has(x)).join(' ');
}

export function matchClub(name: string, clubs: Candidate[]): string | null {
  return matchNormalized(
    normalizeClub(name),
    clubs.map((c) => ({ id: c.id, norm: normalizeClub(c.name) })),
  );
}

export function matchFixture(target: Omit<FixtureKey, 'id'>, candidates: FixtureKey[]): string | null {
  const t = Date.parse(target.date);
  const hits = candidates.filter(
    (c) =>
      c.homeTeamId === target.homeTeamId &&
      c.awayTeamId === target.awayTeamId &&
      Math.abs(Date.parse(c.date) - t) <= DAY_MS,
  );
  return hits.length === 1 ? hits[0].id : null;
}
