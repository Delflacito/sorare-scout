const POSITIONS = ['gardien', 'défenseur', 'milieu', 'attaquant'];

/** Valeur triable d'une cellule : nombre (prix, %, score, « 18 / 25 »), rang de poste, texte ; null si vide (« — »). */
export function cellKey(text: string): number | string | null {
  const t = text.replace(/[\s  ]+/g, ' ').trim();
  if (!t || t === '—' || t === '-') return null;
  const num = /^[+\-−]?\d[\d ]*(?:[.,]\d+)?/.exec(t);
  if (num) return Number(num[0].replace(/ /g, '').replace('−', '-').replace(',', '.'));
  const pos = POSITIONS.indexOf(t.toLowerCase().split(/[ /·]/)[0]);
  return pos >= 0 ? pos : t.toLowerCase();
}

/** Compare deux cellules ; vides toujours à la fin. Nombres : du plus grand au plus petit d'abord ; texte et postes : ordre naturel. */
export function compareKeys(a: number | string | null, b: number | string | null, asc: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const d = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'fr', { numeric: true });
  return asc ? d : -d;
}
