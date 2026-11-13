'use client';

import { useEffect, useState, type ReactNode } from 'react';

const key = (id: string) => `sorare-scout:fold:${id}`;

/** Bloc repliable : flèche en haut à droite ; replié, il ne reste qu'une barre avec le titre. État retenu par navigateur. */
export function Fold({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(key(id)) === '0') setOpen(false); } catch {} }, [id]);
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem(key(id), open ? '0' : '1'); } catch {}
  };
  return (
    <div className={`fold ${open ? '' : 'closed'}`}>
      <button type="button" className="fold-btn" onClick={toggle} aria-expanded={open} aria-label={`${open ? 'Replier' : 'Déplier'} : ${title}`}>
        {!open && <span className="fold-title">{title}</span>}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && children}
    </div>
  );
}
