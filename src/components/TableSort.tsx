'use client';

import { useEffect } from 'react';
import { cellKey, compareKeys } from '@/lib/tableSort';

const POS = /^(gardien|défenseur|milieu|attaquant)/i;
// En-têtes déjà triés par la page (lien) ou sans titre : non concernés.
const sortable = (th: Element) => th.closest('thead') && !th.querySelector('a, button') && th.textContent?.trim();

/** Tri au clic sur l'en-tête de n'importe quel tableau du site, selon le type de la colonne (nombre, poste, texte). */
export function TableSort() {
  useEffect(() => {
    const mark = () => document.querySelectorAll('thead th').forEach((th) => {
      if (sortable(th) && !th.hasAttribute('tabindex')) { th.setAttribute('tabindex', '0'); th.classList.add('th-sort'); }
    });
    mark();
    const obs = new MutationObserver(mark);
    obs.observe(document.body, { childList: true, subtree: true });
    const sort = (th: HTMLTableCellElement) => {
      const table = th.closest('table');
      const body = table?.tBodies[0];
      if (!table || !body) return;
      const col = Array.from(th.parentElement!.children).indexOf(th);
      const rows = Array.from(body.rows);
      const keys = new Map(rows.map((r) => [r, cellKey(r.cells[col]?.textContent ?? '')]));
      const vals = [...keys.values()].filter((k) => k !== null);
      const texts = rows.map((r) => r.cells[col]?.textContent?.trim() ?? '');
      const numeric = vals.every((k) => typeof k === 'number') && !texts.some((t) => POS.test(t));
      const prev = th.getAttribute('aria-sort');
      const asc = prev ? prev === 'descending' : !numeric;
      table.querySelectorAll('thead th[aria-sort]').forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      rows.sort((a, b) => compareKeys(keys.get(a)!, keys.get(b)!, asc)).forEach((r) => body.appendChild(r));
    };
    const onClick = (e: Event) => {
      const th = (e.target as Element).closest?.('thead th');
      if (!th || !sortable(th) || (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      sort(th as HTMLTableCellElement);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onClick);
    return () => { obs.disconnect(); document.removeEventListener('click', onClick); document.removeEventListener('keydown', onClick); };
  }, []);
  return null;
}
