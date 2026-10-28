export const fmtScore = (n: number) => n.toFixed(1);
export const fmtPct = (r: number) => `${Math.round(r * 100)} %`;
export const fmtIndex = (i: number) => String(Math.round(i * 100));
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** Classe CSS selon l'indice concédé (> 1,1 : adversaire généreux). */
export const indexClass = (i: number | null) => (i === null ? '' : i > 1.1 ? 'hot' : i < 0.9 ? 'cold' : 'neutral');

/** Note 1–100 de l'adversaire (100 = le plus fort) : favorable (faible note), neutre ou défavorable. */
export const ratingClass = (rating: number | null) => (rating === null ? '' : rating <= 33 ? 'hot' : rating >= 67 ? 'cold' : 'neutral');

/** Dates et nombre de matchs d'une journée. */
export function roundLabel(fixtures: { date: string }[]): string {
  if (!fixtures.length) return '';
  const first = fmtDate(fixtures[0].date);
  const last = fmtDate(fixtures.at(-1)!.date);
  const n = `${fixtures.length} match${fixtures.length > 1 ? 's' : ''}`;
  return first === last ? `${first} · ${n}` : `Du ${first} au ${last} · ${n}`;
}

/** Âge à une date donnée (date de naissance AAAA-MM-JJ). */
export function ageAt(birthDate: string, now = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const age = now.getUTCFullYear() - y;
  return now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d) ? age - 1 : age;
}
