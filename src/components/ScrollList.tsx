'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Liste ordonnée haute de `visible` lignes ; les suivantes se voient en faisant défiler la liste. */
export function ScrollList({ visible, label, children }: { visible: number; label: string; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = ref.current;
    if (!ol) return;
    // Hauteur mesurée (la liste est le repère des offsetTop) : les lignes n'ont pas toutes la même taille (infos qui passent à la ligne sur mobile).
    const fit = () => {
      const last = ol.children[visible - 1] as HTMLElement | undefined;
      ol.style.maxHeight = last && ol.children.length > visible ? `${last.offsetTop + last.offsetHeight}px` : '';
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [visible, children]);
  return <ol ref={ref} className="gw-list gw-scroll" aria-label={label} tabIndex={0}>{children}</ol>;
}
