'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Hit = { slug: string; name: string; team: string | null };

/** Recherche de joueur dans l'en-tête : suggestions dès 2 lettres, ouvre la fiche du joueur choisi. */
export function PlayerSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/joueurs?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json()).then(setHits).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (value: string) => {
    const hit = hits.find((h) => h.name === value) ?? (value === q ? hits[0] : undefined);
    if (hit) { setQ(''); setHits([]); router.push(`/joueurs/${hit.slug}`); }
  };

  return (
    <form role="search" className="player-search" onSubmit={(e) => { e.preventDefault(); go(q); }}>
      <input type="search" list="player-search-hits" placeholder="Rechercher un joueur…" aria-label="Rechercher un joueur"
        value={q} onChange={(e) => { setQ(e.target.value); if (hits.some((h) => h.name === e.target.value)) go(e.target.value); }} />
      <datalist id="player-search-hits">
        {hits.map((h) => <option key={h.slug} value={h.name}>{h.team ?? ''}</option>)}
      </datalist>
    </form>
  );
}
