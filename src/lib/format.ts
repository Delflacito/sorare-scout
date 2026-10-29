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

/** Palier de couleur d'un score Sorare (du rouge au turquoise, comme dans l'application Sorare). */
export type ScoreTier = 't90' | 't70' | 't55' | 't40' | 't25' | 't0';
export function scoreTier(score: number): ScoreTier {
  return score >= 90 ? 't90' : score >= 70 ? 't70' : score >= 55 ? 't55' : score >= 40 ? 't40' : score >= 25 ? 't25' : 't0';
}

/** Code court d'une équipe : son nom court s'il fait 4 lettres au plus, sinon les initiales (PSG) ou 3 lettres (BAR). */
export function teamCode(name: string, shortName?: string | null): string {
  if (shortName && shortName.length <= 4) return shortName.toUpperCase();
  const words = name.split(/[\s-]+/).filter((w) => w && !/^(fc|cf|ac|as|sc|afc|ssc|rc|cd|ud|sd|vfb|vfl|tsg|de|del|la|le|les|di|du|der|1\.)$/i.test(w));
  if (words.length <= 1) return (words[0] ?? name).slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

/** Prix en euros : centimes sous 10 €, une décimale jusqu'à 100 €, arrondi à l'euro au-delà. */
export const fmtEur = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 })} €`;

/** Variation en % signée : « +12 % », « −8 % ». */
export const fmtChange = (r: number) => {
  const pct = Math.round(r * 100);
  return pct > 0 ? `+${pct} %` : pct < 0 ? `−${-pct} %` : '0 %';
};
