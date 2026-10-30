'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { StarPlayer } from '@/db/queries';
import { starStatus, type GalleryCard, type StarCard, type StarStatus } from '@/lib/star';
import { PlayerAvatar } from './Media';
import { PSEUDO_KEY } from './SquadBuilder';

export interface StarView { competition: string; name: string; cards: (StarCard & { player: StarPlayer | null })[] }

const POS_FR: Record<StarCard['pos'], string> = { GK: 'Gardien', DF: 'Défenseur', MD: 'Milieu', FW: 'Attaquant' };
const STATUS_FR: Record<StarStatus, string> = { ok: '✓ Validée', market: 'Marché secondaire', missing: 'À trouver' };

/** Avancement des collections Star d'après la galerie Sorare : seules les cartes obtenues aux enchères, en achat immédiat ou en craft valident. */
export function StarTracker({ collections }: { collections: StarView[] }) {
  const [pseudo, setPseudo] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingOnly, setMissingOnly] = useState(false);
  const load = useCallback((p: string) => {
    setGallery(null);
    setError(null);
    fetch(`/api/star?user=${encodeURIComponent(p)}`).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? 'Galerie indisponible');
      setGallery(b.cards);
    }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    let p = '';
    try { p = window.localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { /* stockage indisponible */ }
    setPseudo(p);
    if (p) load(p);
  }, [load]);

  if (pseudo === '') {
    return <p className="empty">Importe d’abord ta galerie dans <Link href="/effectif">Mon effectif</Link> : tes cartes seront validées ici automatiquement.</p>;
  }
  const status = (c: StarView['cards'][number]): StarStatus | null => (gallery ? starStatus(c, c.player?.slug ?? null, gallery) : null);
  const okCount = (cards: StarView['cards']) => cards.filter((c) => status(c) === 'ok').length;
  const total = collections.reduce((n, c) => n + c.cards.length, 0);
  const done = collections.reduce((n, c) => n + okCount(c.cards), 0);

  return (
    <>
      <div className="star-head">
        <p aria-live="polite">
          {error ? <span className="cold">{error}</span>
            : gallery ? <><strong>{done} / {total}</strong> cartes validées · galerie de {pseudo}</> : 'Lecture de ta galerie Sorare…'}
        </p>
        <div className="chip-row">
          <button type="button" className="chip" aria-pressed={missingOnly} onClick={() => setMissingOnly(!missingOnly)}>Seulement les manquantes</button>
          {pseudo && <button type="button" className="chip" onClick={() => load(pseudo)} disabled={!gallery && !error}>Actualiser</button>}
        </div>
      </div>
      <nav className="chip-row" aria-label="Championnat">
        {collections.map((c) => (
          <a key={c.competition} href={`#star-${c.competition}`}>{c.name}&nbsp;<span className="muted">{gallery ? `${okCount(c.cards)}/` : ''}{c.cards.length}</span></a>
        ))}
      </nav>
      {collections.map((c) => {
        const got = okCount(c.cards);
        const shown = missingOnly ? c.cards.filter((x) => status(x) !== 'ok') : c.cards;
        return (
          <section key={c.competition} id={`star-${c.competition}`} className="card gw-section star-section" aria-labelledby={`star-t-${c.competition}`}>
            <h2 className="card-title" id={`star-t-${c.competition}`}>{c.name}<span>{gallery ? `${got} / ` : ''}{c.cards.length}</span></h2>
            <div className="star-bar" role="progressbar" aria-label={`Avancement ${c.name}`} aria-valuemin={0} aria-valuemax={c.cards.length} aria-valuenow={got}>
              <span style={{ width: `${(got / c.cards.length) * 100}%` }} />
            </div>
            {shown.length === 0 ? <p className="empty">Collection complète</p> : (
              <ul className="gw-list" aria-label={c.name}>
                {shown.map((x) => {
                  const s = status(x);
                  return (
                    <li key={x.name} className={`gw-row no-rank star-row ${s === 'ok' ? 'is-owned' : ''}`}>
                      <PlayerAvatar name={x.name} url={x.player?.pictureUrl ?? null} size={40} />
                      <div className="gw-who">
                        <div className="gw-name">{x.player ? <Link href={`/joueurs/${x.player.slug}`}>{x.name}</Link> : x.name}</div>
                        <div className="gw-match muted">{POS_FR[x.pos]}{x.player && ` · ${x.player.team}`}</div>
                      </div>
                      {s && <span className={`star-status ${s}`}
                        title={s === 'market' ? 'Tu as la carte, mais une carte achetée à un autre manager ne valide pas la collection (seules comptent enchère, achat immédiat et craft)' : undefined}>{STATUS_FR[s]}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
