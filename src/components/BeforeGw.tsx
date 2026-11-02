'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LeagueCheck } from '@/lib/beforeGw';
import { PSEUDO_KEY } from './SquadBuilder';

const fmtKickoff = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Accueil : ce qu'il faut régler avant la Game Week, championnat par championnat, d'après tes cartes. */
export function BeforeGw() {
  const [leagues, setLeagues] = useState<LeagueCheck[] | null>(null);
  const [pseudo, setPseudo] = useState<string | null>(null);
  useEffect(() => {
    let p = '';
    try { p = window.localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { /* stockage indisponible */ }
    setPseudo(p);
    if (p) fetch(`/api/avant-gw?user=${encodeURIComponent(p)}`).then((r) => r.json()).then((b) => setLeagues(b.leagues ?? [])).catch(() => setLeagues([]));
  }, []);
  if (pseudo === null || pseudo === '') return null;
  const playing = (leagues ?? []).filter((l) => l.firstKickoff);
  const resting = (leagues ?? []).filter((l) => !l.firstKickoff);
  return (
    <section className="card home-panel before-gw" aria-label="À faire avant la GW">
      <h2 className="card-title">À faire avant la GW</h2>
      {!leagues ? <p className="muted">Lecture de ton effectif…</p> : playing.length === 0 ? <p className="empty">Aucun de tes championnats ne joue cette journée.</p> : (
        <ul className="before-gw-list">
          {playing.map((l) => (
            <li key={l.competition}>
              <div className="before-gw-head">
                <strong>{l.name}</strong>
                <span className="muted small">compose avant le {fmtKickoff(l.firstKickoff!)}</span>
              </div>
              {l.issues.length === 0 ? <p className="small ok">✓ Tes {l.owned} cartes sont disponibles</p> : (
                <ul className="before-gw-issues">
                  {l.issues.map((i) => (
                    <li key={i.slug}>
                      <span className={`issue-tag ${i.issue === 'incertain' ? 'warn' : 'bad'}`}>{i.issue}</span>
                      <Link href={`/joueurs/${i.slug}`}>{i.name}</Link> <span className="muted small">{i.team}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {resting.length > 0 && <p className="note">Au repos cette journée : {resting.map((l) => l.name).join(', ')}.</p>}
      <Link href="/game-week" className="card-link">Composer avec mes cartes →</Link>
    </section>
  );
}
