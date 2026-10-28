export const fmtScore = (n: number) => n.toFixed(1);
export const fmtPct = (r: number) => `${Math.round(r * 100)} %`;
export const fmtIndex = (i: number) => String(Math.round(i * 100));
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** Classe CSS selon l'indice concédé (> 1,1 : adversaire généreux). */
export const indexClass = (i: number | null) => (i === null ? '' : i > 1.1 ? 'hot' : i < 0.9 ? 'cold' : 'neutral');
