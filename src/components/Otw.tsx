'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketPlayerView } from '@/db/queries';
import { PlayerAvatar } from './Media';
import { fmtEur } from '@/lib/format';
import { loadOwned } from './MyCards';
import { GENERIC_LABEL_FR, cardLabel, type GenericPosition } from '@/domain/types';

const POSITIONS = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];
// Rang du premier poste de la carte : gardiens, défenseurs, milieux puis attaquants.
const posRank = (p: MarketPlayerView) => Math.min(...p.cardPositions.map((x) => POSITIONS.indexOf(x)), POSITIONS.length);
import { CONTENDER, CONTENDER_NAME, competitionGroup } from '@/lib/competitions';

// shortcut: liste gardée dans le navigateur (pas synchronisée entre appareils), passer par une API liée au pseudo si besoin.
const KEY = 'sorare-scout:otw';

function read(): string[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(slugs: string[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(slugs)); } catch { /* stockage indisponible */ }
}

// Cartes déjà possédées au moment de l'ajout : le joueur ne sort de la liste qu'après un nouvel achat.
const COUNTS_KEY = 'sorare-scout:otw:cartes';
function readCounts(): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem(COUNTS_KEY) ?? '{}'); } catch { return {}; }
}
function writeCounts(c: Record<string, number>) {
  try { window.localStorage.setItem(COUNTS_KEY, JSON.stringify(c)); } catch { /* stockage indisponible */ }
}

/** « + » : ajoute (ou retire) le joueur de la liste d'achats souhaités (onglet OTW). */
export function OtwButton({ slug, name }: { slug: string; name: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read().includes(slug)), [slug]);
  const toggle = () => {
    const list = read().filter((s) => s !== slug);
    if (!on) list.push(slug);
    write(list);
    if (!on) loadOwned().then((owned) => writeCounts({ ...readCounts(), [slug]: owned.get(slug) ?? 0 }));
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
  const [position, setPosition] = useState('');
  useEffect(() => {
    loadOwned().then((owned) => {
    // Joueur acheté depuis l'ajout (plus de cartes qu'à l'ajout) : il sort de la liste.
    // Ajout sans compte connu (anciennes listes) : on part des cartes actuelles, rien n'est retiré.
    const counts = readCounts();
    const s = read().filter((x) => (owned.get(x) ?? 0) <= (counts[x] ??= owned.get(x) ?? 0));
    writeCounts(Object.fromEntries(s.map((x) => [x, counts[x]])));
    write(s);
    setSlugs(s);
    if (!s.length) return setPlayers([]);
    fetch(`/api/joueurs?slugs=${s.map(encodeURIComponent).join(',')}`).then(async (r) => {
      if (!r.ok) throw new Error('Prix indisponibles');
      setPlayers(await r.json());
    }).catch((e: Error) => setError(e.message));
    });
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
  // Championnats Contender regroupés en un seul choix.
  const groupOf = (p: MarketPlayerView) => (p.competitionSlug ? competitionGroup(p.competitionSlug) : null);
  const inComp = (p: MarketPlayerView) => !competition || groupOf(p) === competition;
  const competitions = [...new Map(players.flatMap((p) => { const g = groupOf(p); return g ? [[g, g === CONTENDER ? CONTENDER_NAME : p.competition ?? g] as const] : []; })).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const clubs = [...new Set(players.filter(inComp).map((p) => p.team).filter((t): t is string => !!t))].sort();
  const all = players;
  players = players.filter((p) => inComp(p) && (!club || p.team === club) && (!position || p.cardPositions.includes(position as GenericPosition)))
    .sort((a, b) => posRank(a) - posRank(b));
  const total = players.reduce((t, p) => t + (priceOf(p) ?? 0), 0);
  const unpriced = players.filter((p) => priceOf(p) === null).length;
  return (
    <>
      <div className="filters">
        <select value={competition} onChange={(e) => { setCompetition(e.target.value); setClub(''); }} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map(([g, name]) => <option key={g} value={g}>{name}</option>)}
        </select>
        <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">Tous les clubs</option>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Poste">
          <option value="">Tous les postes</option>
          {POSITIONS.map((g) => <option key={g} value={g}>{GENERIC_LABEL_FR[g]}</option>)}
        </select>
      </div>
      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Joueurs</div><strong>{players.length}{players.length !== all.length && <span className="muted"> / {all.length}</span>}</strong></div>
        <div className="card"><div className="card-kicker">Prix total</div><strong>{fmtEur(total)}</strong>
          {unpriced > 0 && <div className="muted small">+ {unpriced} joueur{unpriced > 1 ? 's' : ''} sans prix</div>}</div>
      </div>
      <div className="table-wrap">
        <table aria-label="Liste OTW">
          <thead><tr><th>Joueur</th><th>Poste</th><th>Club</th><th>Prix actuel</th><th /></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.slug}>
                <td><span className="player-cell"><PlayerAvatar name={p.name} url={p.pictureUrl} size={32} /><Link href={`/joueurs/${p.slug}?onglet=marche`}>{p.name}</Link></span></td>
                <td>{cardLabel(p.cardPositions)}</td>
                <td>{p.team ?? '—'}</td>
                <td className="num strong">{priceOf(p) === null ? '—' : fmtEur(priceOf(p)!)}</td>
                <td><a href={`https://sorare.com/football/players/${p.slug}`} target="_blank" rel="noopener noreferrer"
                  aria-label={`Voir ${p.name} sur Sorare (nouvel onglet)`}>Sorare ↗</a>{' '}
                  <button type="button" className="chip" onClick={() => remove(p.slug)} aria-label={`Retirer ${p.name}`}>Retirer</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="history-total"><td>Total</td><td /><td /><td className="num">{fmtEur(total)}</td><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
