'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketPlayerView } from '@/db/queries';
import { PlayerAvatar } from './Media';
import { fmtEur } from '@/lib/format';

// shortcut: liste gardée dans le navigateur (pas synchronisée entre appareils), passer par une API liée au pseudo si besoin.
const KEY = 'sorare-scout:otw';

function read(): string[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(slugs: string[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(slugs)); } catch { /* stockage indisponible */ }
}

/** « + » : ajoute (ou retire) le joueur de la liste d'achats souhaités (onglet OTW). */
export function OtwButton({ slug, name }: { slug: string; name: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read().includes(slug)), [slug]);
  const toggle = () => {
    const list = read().filter((s) => s !== slug);
    if (!on) list.push(slug);
    write(list);
    setOn(!on);
  };
  return (
    <button type="button" className={`otw-btn ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on}
      aria-label={on ? `Retirer ${name} de la liste OTW` : `Ajouter ${name} à la liste OTW`} title={on ? 'Dans la liste OTW' : 'Ajouter à la liste OTW'}>
      {on ? '✓' : '+'}
    </button>
  );
}

const priceOf = (p: MarketPlayerView) => p.floorInSeason ?? p.price;

/** Liste OTW : joueurs ajoutés avec le « + », prix actuel (plancher de la saison, sinon prix de référence) et total. */
export function OtwList() {
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [loaded, setPlayers] = useState<MarketPlayerView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [competition, setCompetition] = useState('');
  const [club, setClub] = useState('');
  useEffect(() => {
    const s = read();
    setSlugs(s);
    if (!s.length) return setPlayers([]);
    fetch(`/api/joueurs?slugs=${s.map(encodeURIComponent).join(',')}`).then(async (r) => {
      if (!r.ok) throw new Error('Prix indisponibles');
      setPlayers(await r.json());
    }).catch((e: Error) => setError(e.message));
  }, []);
  const remove = (slug: string) => {
    const s = (slugs ?? []).filter((x) => x !== slug);
    write(s);
    setSlugs(s);
    setPlayers((ps) => ps?.filter((p) => p.slug !== slug) ?? null);
  };

  if (error) return <p className="cold">{error}</p>;
  if (!loaded) return <p aria-live="polite">Chargement…</p>;
  if (!loaded.length) return <p className="empty">Aucun joueur dans la liste : ajoute-les avec le « + » dans Marché, Star ou Joueurs.</p>;
  let players = loaded;
  const competitions = [...new Set(players.map((p) => p.competition).filter((c): c is string => !!c))].sort();
  const clubs = [...new Set(players.filter((p) => !competition || p.competition === competition).map((p) => p.team).filter((t): t is string => !!t))].sort();
  const all = players;
  players = players.filter((p) => (!competition || p.competition === competition) && (!club || p.team === club));
  const total = players.reduce((t, p) => t + (priceOf(p) ?? 0), 0);
  const unpriced = players.filter((p) => priceOf(p) === null).length;
  return (
    <>
      <div className="filters">
        <select value={competition} onChange={(e) => { setCompetition(e.target.value); setClub(''); }} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">Tous les clubs</option>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Joueurs</div><strong>{players.length}{players.length !== all.length && <span className="muted"> / {all.length}</span>}</strong></div>
        <div className="card"><div className="card-kicker">Prix total</div><strong>{fmtEur(total)}</strong>
          {unpriced > 0 && <div className="muted small">+ {unpriced} joueur{unpriced > 1 ? 's' : ''} sans prix</div>}</div>
      </div>
      <div className="table-wrap">
        <table aria-label="Liste OTW">
          <thead><tr><th>Joueur</th><th>Club</th><th>Prix actuel</th><th /></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.slug}>
                <td><span className="player-cell"><PlayerAvatar name={p.name} url={p.pictureUrl} size={32} /><Link href={`/joueurs/${p.slug}?onglet=marche`}>{p.name}</Link></span></td>
                <td>{p.team ?? '—'}</td>
                <td className="num strong">{priceOf(p) === null ? '—' : fmtEur(priceOf(p)!)}</td>
                <td><button type="button" className="chip" onClick={() => remove(p.slug)} aria-label={`Retirer ${p.name}`}>Retirer</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="history-total"><td>Total</td><td /><td className="num">{fmtEur(total)}</td><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
