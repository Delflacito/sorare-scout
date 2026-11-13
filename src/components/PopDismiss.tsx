'use client';

import { useEffect } from 'react';

/** Quand une bulle de profil est ouverte, le premier toucher ailleurs la ferme seulement (pas de lien suivi en dessous). */
export function PopDismiss() {
  useEffect(() => {
    let swallow = false;
    const down = (e: PointerEvent) => {
      const open = document.activeElement?.closest('.split-hint');
      swallow = !!open && !open.contains(e.target as Node);
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement as HTMLElement | null)?.blur();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('click', click, true); };
  }, []);
  return null;
}
