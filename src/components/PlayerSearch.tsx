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

  const open = (hit: Hit | undefined) => {
    if (hit) { setQ(''); setHits([]); router.push(`/joueurs/${hit.slug}`); }
  };

  // Liste dessinée par le site plutôt qu'une <datalist> : Safari iOS n'ouvre pas la fiche au toucher d'une suggestion.
  return (
    <form role="search" className="player-search" onSubmit={(e) => { e.preventDefault(); open(hits[0]); }}>
      <input type="search" placeholder="Rechercher un joueur…" aria-label="Rechercher un joueur" autoComplete="off"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="player-search-hits" aria-label="Suggestions">
          {hits.map((h) => (
            <li key={h.slug}>
              <button type="button" onClick={() => open(h)}>{h.name}{h.team && <small>{h.team}</small>}</button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
