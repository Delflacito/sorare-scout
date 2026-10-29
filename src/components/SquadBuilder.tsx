'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { MarketPlayerView } from '@/db/queries';
import { cardLabel } from '@/domain/types';
import { fmtChange, fmtEur } from '@/lib/format';
import { ClubLogo, PlayerAvatar } from './Media';

/** Carte de l'effectif : possédée (avec son prix d'achat) ou envisagée (prix d'achat prévu, à défaut le prix actuel). */
export interface SquadEntry { slug: string; competition: string; status: 'owned' | 'target'; purchasePrice: number | null }

export const STORAGE_KEY = 'sorare-scout:effectif:v1';

function load(): SquadEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SquadEntry[]) : [];
  } catch {
    return [];
  }
}
function save(entries: SquadEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // stockage indisponible (navigation privée) : l'effectif reste en mémoire
  }
}

export interface SquadTotals {
  cost: number; value: number; gain: number; missingPurchase: number;
  targets: number; costWithTargets: number; potential: number;
}

/** Totaux d'un effectif : coût réel et valeur des cartes possédées, coût des achats envisagés, valeur potentielle avant la GW. */
export function squadTotals(entries: SquadEntry[], info: Map<string, MarketPlayerView>): SquadTotals {
  const owned = entries.filter((e) => e.status === 'owned');
  const targets = entries.filter((e) => e.status === 'target');
  const priceOf = (e: SquadEntry) => info.get(e.slug)?.price ?? 0;
  const cost = owned.reduce((t, e) => t + (e.purchasePrice ?? 0), 0);
  const value = owned.reduce((t, e) => t + priceOf(e), 0);
  const targetCost = targets.reduce((t, e) => t + (e.purchasePrice ?? priceOf(e)), 0);
  const potential = entries.reduce((t, e) => t + (info.get(e.slug)?.potentialPrice ?? priceOf(e)), 0);
  return {
    cost, value, gain: value - cost, missingPurchase: owned.filter((e) => e.purchasePrice === null).length,
    targets: targetCost, costWithTargets: cost + targetCost, potential,
  };
}

const parsePrice = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

export function SquadBuilder({ competitions }: { competitions: { slug: string; name: string }[] }) {
  const [entries, setEntries] = useState<SquadEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState<Map<string, MarketPlayerView>>(new Map());
  const [league, setLeague] = useState(competitions[0]?.slug ?? '');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MarketPlayerView[]>([]);

  // Effectif enregistré dans ce navigateur ; on ouvre le premier championnat qui contient des cartes.
  useEffect(() => {
    const stored = load();
    setEntries(stored);
    setLoaded(true);
    if (stored.length && !stored.some((e) => e.competition === competitions[0]?.slug)) setLeague(stored[0].competition);
  }, [competitions]);
  useEffect(() => { if (loaded) save(entries); }, [entries, loaded]);

  // Prix à jour des cartes de l'effectif.
  const slugsKey = [...new Set(entries.map((e) => e.slug))].sort().join(',');
  useEffect(() => {
    if (!slugsKey) return;
    fetch(`/api/joueurs?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => r.json())
      .then((rows: MarketPlayerView[]) => setInfo((m) => new Map([...m, ...rows.map((r) => [r.slug, r] as const)])))
      .catch(() => {});
  }, [slugsKey]);

  // Recherche dans le championnat affiché.
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/joueurs?q=${encodeURIComponent(q.trim())}&competition=${encodeURIComponent(league)}`)
        .then((r) => r.json()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, league]);

  const leagueEntries = entries.filter((e) => e.competition === league);
  const totals = useMemo(() => squadTotals(leagueEntries, info), [leagueEntries, info]);
  const allTotals = useMemo(() => squadTotals(entries, info), [entries, info]);

  const add = (p: MarketPlayerView, status: SquadEntry['status']) => {
    setInfo((m) => new Map(m).set(p.slug, p));
    setEntries((es) => es.some((e) => e.slug === p.slug && e.competition === league)
      ? es
      : [...es, { slug: p.slug, competition: league, status, purchasePrice: status === 'target' ? p.price : null }]);
    setQ('');
  };
  const update = (slug: string, patch: Partial<SquadEntry>) =>
    setEntries((es) => es.map((e) => (e.slug === slug && e.competition === league ? { ...e, ...patch } : e)));
  const remove = (slug: string) => setEntries((es) => es.filter((e) => !(e.slug === slug && e.competition === league)));
  const count = (slug: string) => entries.filter((e) => e.competition === slug).length;

  return (
    <div className="squad">
      <nav className="tabs" aria-label="Championnats">
        {competitions.map((c) => (
          <button key={c.slug} type="button" className="tab-btn" aria-current={league === c.slug ? 'page' : undefined} onClick={() => setLeague(c.slug)}>
            {c.name}{count(c.slug) > 0 && <span className="tab-count">{count(c.slug)}</span>}
          </button>
        ))}
      </nav>

      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Coût réel</div><strong>{fmtEur(totals.cost)}</strong>
          {totals.missingPurchase > 0 && <div className="muted small">{totals.missingPurchase} prix d’achat à renseigner</div>}</div>
        <div className="card"><div className="card-kicker">Valeur actuelle</div><strong>{fmtEur(totals.value)}</strong>
          <div className={`small ${totals.gain > 0 ? 'hot' : totals.gain < 0 ? 'cold' : 'muted'}`}>
            {totals.gain >= 0 ? '+' : '−'}{fmtEur(Math.abs(totals.gain))}{totals.cost > 0 && ` (${fmtChange(totals.gain / totals.cost)})`}
          </div></div>
        <div className="card"><div className="card-kicker">Avec les achats envisagés</div><strong>{fmtEur(totals.costWithTargets)}</strong>
          <div className="muted small">dont {fmtEur(totals.targets)} d’achats</div></div>
        <div className="card"><div className="card-kicker">Valeur potentielle avant la GW</div><strong>{fmtEur(totals.potential)}</strong>
          <div className="muted small">si chacun marque son score potentiel</div></div>
      </div>

      <div className="squad-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ajouter un joueur"
          placeholder={`Ajouter un joueur (${competitions.find((c) => c.slug === league)?.name ?? ''})`} />
        {results.length > 0 && (
          <ul className="search-results" aria-label="Résultats">
            {results.map((p) => (
              <li key={p.slug}>
                <span className="player-cell">
                  <PlayerAvatar name={p.name} url={p.pictureUrl} size={28} />
                  <span>{p.name}</span>
                  {p.team && <ClubLogo name={p.team} url={p.teamPictureUrl} size={16} />}
                  <span className="muted small">{p.price === null ? '' : fmtEur(p.price)}</span>
                </span>
                <span className="search-actions">
                  <button type="button" onClick={() => add(p, 'owned')}>J’ai la carte</button>
                  <button type="button" className="secondary" onClick={() => add(p, 'target')}>À acheter</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {leagueEntries.length === 0 ? (
        <p className="empty">Aucune carte dans ce championnat : cherche un joueur pour l’ajouter.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label="Cartes de l’effectif">
            <thead>
              <tr><th>Joueur</th><th>Statut</th><th>Prix d’achat</th><th>Prix actuel</th><th>+/− value</th><th>Potentiel GW</th><th /></tr>
            </thead>
            <tbody>
              {leagueEntries.map((e) => {
                const p = info.get(e.slug);
                const diff = p?.price != null && e.purchasePrice !== null ? p.price - e.purchasePrice : null;
                return (
                  <tr key={e.slug} className={e.status === 'target' ? 'row-target' : undefined}>
                    <td>
                      <span className="player-cell">
                        <PlayerAvatar name={p?.name ?? e.slug} url={p?.pictureUrl ?? null} size={28} />
                        <Link href={`/joueurs/${e.slug}?onglet=marche`}>{p?.name ?? e.slug}</Link>
                      </span>
                      {p && <div className="muted small">{p.team ?? ''}{p.cardPositions.length ? ` · ${cardLabel(p.cardPositions)}` : ''}</div>}
                    </td>
                    <td>
                      <select value={e.status} aria-label={`Statut de ${p?.name ?? e.slug}`}
                        onChange={(ev) => update(e.slug, { status: ev.target.value as SquadEntry['status'] })}>
                        <option value="owned">Possédée</option>
                        <option value="target">À acheter</option>
                      </select>
                    </td>
                    <td>
                      <input className="price-input" inputMode="decimal" aria-label={`Prix d’achat de ${p?.name ?? e.slug}`}
                        defaultValue={e.purchasePrice ?? ''} placeholder={p?.price != null ? String(Math.round(p.price * 100) / 100) : '€'}
                        onBlur={(ev) => update(e.slug, { purchasePrice: parsePrice(ev.target.value) })} />
                    </td>
                    <td className="num">{p?.price == null ? '—' : fmtEur(p.price)}</td>
                    <td className={`num ${diff === null ? '' : diff > 0 ? 'hot' : diff < 0 ? 'cold' : ''}`}>
                      {diff === null ? '—' : `${diff >= 0 ? '+' : '−'}${fmtEur(Math.abs(diff))}`}
                    </td>
                    <td className="num">
                      {p?.potentialPrice == null ? '—' : fmtEur(p.potentialPrice)}
                      {p?.potentialGain != null && <div className={`small ${p.potentialGain > 0 ? 'hot' : p.potentialGain < 0 ? 'cold' : 'muted'}`}>{fmtChange(p.potentialGain)}</div>}
                    </td>
                    <td><button type="button" className="link-btn" aria-label={`Retirer ${p?.name ?? e.slug}`} onClick={() => remove(e.slug)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > leagueEntries.length && (
        <p className="note">
          Tous championnats : coût réel {fmtEur(allTotals.cost)} · valeur actuelle {fmtEur(allTotals.value)} · avec achats envisagés {fmtEur(allTotals.costWithTargets)}.
        </p>
      )}
      <p className="note">
        Prix actuel : carte Limited de la saison la moins chère en vente. Effectif enregistré dans ce navigateur (il n’est pas partagé entre ton téléphone et ton ordinateur).
      </p>
    </div>
  );
}
