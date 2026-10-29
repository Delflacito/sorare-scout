'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { MarketPlayerView } from '@/db/queries';
import { cardLabel, type GenericPosition } from '@/domain/types';
import { fmtChange, fmtEur } from '@/lib/format';
import { PlayerAvatar } from './Media';

/**
 * Carte de l'effectif : possédée (avec son prix d'achat) ou envisagée (prix d'achat prévu, à défaut le prix actuel) ;
 * fromSorare : importée de la galerie Sorare (retirée à la mise à jour suivante si elle n'y est plus).
 */
export interface SquadEntry { slug: string; competition: string; status: 'owned' | 'target'; purchasePrice: number | null; fromSorare?: boolean }

export const STORAGE_KEY = 'sorare-scout:effectif:v1';
const PSEUDO_KEY = 'sorare-scout:pseudo';

/**
 * Fusionne la galerie Sorare dans l'effectif : ses cartes deviennent possédées (prix saisi à la main conservé, sinon prix
 * payé selon Sorare), les cartes importées absentes de la galerie (vendues) sont retirées, les ajouts manuels gardés.
 */
export function mergeImport(entries: SquadEntry[], imported: { slug: string; competition: string; purchasePrice: number | null }[]): SquadEntry[] {
  const key = (e: { slug: string; competition: string }) => `${e.slug}|${e.competition}`;
  const prev = new Map(entries.map((e) => [key(e), e]));
  const owned = new Set(imported.map(key));
  return [
    ...entries.filter((e) => !owned.has(key(e)) && !e.fromSorare),
    ...imported.map((e) => {
      const before = prev.get(key(e));
      const manual = before?.status === 'owned' && !before.fromSorare ? before.purchasePrice : null;
      return { ...e, status: 'owned' as const, purchasePrice: manual ?? e.purchasePrice, fromSorare: true };
    }),
  ];
}

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

/**
 * Totaux d'un effectif : coût réel des cartes possédées (prix d'achat, à défaut prix actuel : missingPurchase cartes estimées),
 * leur valeur actuelle, coût des achats envisagés, valeur potentielle avant la GW.
 */
export function squadTotals(entries: SquadEntry[], info: Map<string, MarketPlayerView>): SquadTotals {
  const owned = entries.filter((e) => e.status === 'owned');
  const targets = entries.filter((e) => e.status === 'target');
  const priceOf = (e: SquadEntry) => info.get(e.slug)?.price ?? 0;
  const cost = owned.reduce((t, e) => t + (e.purchasePrice ?? priceOf(e)), 0);
  const value = owned.reduce((t, e) => t + priceOf(e), 0);
  const targetCost = targets.reduce((t, e) => t + (e.purchasePrice ?? priceOf(e)), 0);
  const potential = entries.reduce((t, e) => t + (info.get(e.slug)?.potentialPrice ?? priceOf(e)), 0);
  return {
    cost, value, gain: value - cost, missingPurchase: owned.filter((e) => e.purchasePrice === null).length,
    targets: targetCost, costWithTargets: cost + targetCost, potential,
  };
}

/** Effectif enregistré en base pour ce pseudo (null s'il n'y en a pas encore). */
async function loadServer(pseudo: string): Promise<SquadEntry[] | null> {
  const res = await fetch(`/api/effectif/enregistre?user=${encodeURIComponent(pseudo)}`);
  if (!res.ok) throw new Error('lecture impossible');
  return (await res.json()).entries;
}

const POSITIONS: [GenericPosition, string][] = [['Goalkeeper', 'Gardiens'], ['Defender', 'Défenseurs'], ['Midfielder', 'Milieux'], ['Forward', 'Attaquants']];
const ORDER = POSITIONS.map(([p]) => p);
type Sort = 'poste' | 'valeur' | 'gain';

const parsePrice = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

export function SquadBuilder({ competitions, teams }: {
  competitions: { slug: string; name: string }[]; teams: { slug: string; name: string; competitionSlug: string }[];
}) {
  const [entries, setEntries] = useState<SquadEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState<Map<string, MarketPlayerView>>(new Map());
  const [league, setLeague] = useState(competitions[0]?.slug ?? '');
  const [club, setClub] = useState('');
  const [clubPlayers, setClubPlayers] = useState<MarketPlayerView[]>([]);
  const [pseudo, setPseudo] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  // Pseudo dont l'effectif en base a été chargé : les modifications y sont ensuite enregistrées.
  const [syncedPseudo, setSyncedPseudo] = useState<string | null>(null);
  const [position, setPosition] = useState<GenericPosition | ''>('');
  const [clubFilter, setClubFilter] = useState('');
  const [sort, setSort] = useState<Sort>('poste');

  // Effectif enregistré dans ce navigateur ; on ouvre le premier championnat qui contient des cartes.
  useEffect(() => {
    const stored = load();
    setEntries(stored);
    let storedPseudo = '';
    try { storedPseudo = window.localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { /* stockage indisponible */ }
    setPseudo(storedPseudo);
    setLoaded(true);
    // Même effectif sur tous les appareils : la copie en base l'emporte sur celle du navigateur.
    if (storedPseudo) {
      loadServer(storedPseudo)
        .then((server) => { if (server) setEntries(server); setSyncedPseudo(storedPseudo); })
        .catch(() => setImportMessage('Effectif en ligne indisponible : copie de ce navigateur affichée'));
    }
    if (stored.length && !stored.some((e) => e.competition === competitions[0]?.slug)) setLeague(stored[0].competition);
  }, [competitions]);
  useEffect(() => { if (loaded) save(entries); }, [entries, loaded]);
  useEffect(() => {
    if (!syncedPseudo) return;
    const t = setTimeout(() => {
      fetch(`/api/effectif/enregistre?user=${encodeURIComponent(syncedPseudo)}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries }),
      }).catch(() => setImportMessage('Modification non enregistrée en ligne (réseau)'));
    }, 600);
    return () => clearTimeout(t);
  }, [entries, syncedPseudo]);

  // Prix à jour des cartes de l'effectif.
  const slugsKey = [...new Set(entries.map((e) => e.slug))].sort().join(',');
  useEffect(() => {
    if (!slugsKey) return;
    fetch(`/api/joueurs?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => r.json())
      .then((rows: MarketPlayerView[]) => setInfo((m) => new Map([...m, ...rows.map((r) => [r.slug, r] as const)])))
      .catch(() => {});
  }, [slugsKey]);

  // Joueurs du club choisi, à cocher.
  useEffect(() => {
    if (!club) { setClubPlayers([]); return; }
    fetch(`/api/joueurs?team=${encodeURIComponent(club)}`).then((r) => r.json()).then(setClubPlayers).catch(() => setClubPlayers([]));
  }, [club]);

  const leagueEntries = entries.filter((e) => e.competition === league);
  const totals = useMemo(() => squadTotals(leagueEntries, info), [leagueEntries, info]);
  const allTotals = useMemo(() => squadTotals(entries, info), [entries, info]);
  const posOf = (e: SquadEntry) => info.get(e.slug)?.cardPositions[0];
  const owned = leagueEntries.filter((e) => e.status === 'owned');
  const visible = (e: SquadEntry) => (!position || info.get(e.slug)?.cardPositions.includes(position))
    && (!clubFilter || info.get(e.slug)?.team === clubFilter);
  const priceOf = (e: SquadEntry) => info.get(e.slug)?.price ?? 0;
  const sortKey = (e: SquadEntry): [number, number] => {
    if (sort === 'valeur') return [0, -priceOf(e)];
    if (sort === 'gain') return [0, -(priceOf(e) - (e.purchasePrice ?? priceOf(e)))];
    const i = ORDER.indexOf(posOf(e) as GenericPosition);
    return [i < 0 ? ORDER.length : i, -priceOf(e)];
  };
  const sorted = (es: SquadEntry[]) => es.filter(visible).sort((a, b) => {
    const [x, y] = [sortKey(a), sortKey(b)];
    return x[0] - y[0] || x[1] - y[1];
  });
  const shownOwned = sorted(owned);
  const shownTargets = sorted(leagueEntries.filter((e) => e.status === 'target'));

  const inSquad = (slug: string) => entries.find((e) => e.slug === slug && e.competition === league);
  const add = (p: MarketPlayerView, status: SquadEntry['status']) => {
    setInfo((m) => new Map(m).set(p.slug, p));
    setEntries((es) => [...es.filter((e) => !(e.slug === p.slug && e.competition === league)), { slug: p.slug, competition: league, status, purchasePrice: null }]);
  };
  const update = (slug: string, patch: Partial<SquadEntry>) =>
    setEntries((es) => es.map((e) => (e.slug === slug && e.competition === league ? { ...e, ...patch } : e)));
  const remove = (slug: string) => setEntries((es) => es.filter((e) => !(e.slug === slug && e.competition === league)));
  const count = (slug: string) => entries.filter((e) => e.competition === slug).length;
  const importFromSorare = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setImporting(true);
    setImportMessage('Import en cours…');
    try {
      const res = await fetch(`/api/effectif?user=${encodeURIComponent(pseudo.trim())}`);
      const body = await res.json();
      if (!res.ok) { setImportMessage(body.error ?? 'Import impossible'); return; }
      const p = pseudo.trim().toLowerCase();
      try { window.localStorage.setItem(PSEUDO_KEY, p); } catch { /* stockage indisponible */ }
      // Nouvel appareil ou nouveau pseudo : on part de l'effectif enregistré en base (prix saisis, achats envisagés).
      const base = syncedPseudo === p ? null : await loadServer(p);
      setEntries((es) => mergeImport(base ?? es, body.entries));
      setSyncedPseudo(p);
      const skipped = [body.classic && `${body.classic} Classic`, body.untracked && `${body.untracked} de championnats non suivis`].filter(Boolean).join(', ');
      setImportMessage(`${body.entries.length} joueur${body.entries.length > 1 ? 's' : ''} importé${body.entries.length > 1 ? 's' : ''}${skipped ? ` (ignorées : ${skipped})` : ''}`);
    } catch {
      setImportMessage('Import impossible, réessaie dans un instant');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="squad">
      <form className="squad-import" onSubmit={importFromSorare}>
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Pseudo Sorare" aria-label="Pseudo Sorare" autoCapitalize="none" required />
        <button type="submit" disabled={importing || !pseudo.trim()}>
          {entries.some((e) => e.fromSorare) ? 'Mettre à jour depuis Sorare' : 'Importer depuis Sorare'}
        </button>
        {importMessage && <span className="muted small" role="status">{importMessage}</span>}
      </form>
      <nav className="tabs" aria-label="Championnats">
        {competitions.map((c) => (
          <button key={c.slug} type="button" className="tab-btn" aria-current={league === c.slug ? 'page' : undefined} onClick={() => { setLeague(c.slug); setClub(''); setClubFilter(''); }}>
            {c.name}{count(c.slug) > 0 && <span className="tab-count">{count(c.slug)}</span>}
          </button>
        ))}
      </nav>

      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Coût réel</div><strong>{fmtEur(totals.cost)}</strong>
          <div className="muted small">{totals.missingPurchase > 0 ? `dont ${totals.missingPurchase} carte${totals.missingPurchase > 1 ? 's' : ''} au prix actuel (prix d’achat inconnu)` : 'prix d’achat réels'}</div></div>
        <div className="card"><div className="card-kicker">Valeur actuelle</div><strong>{fmtEur(totals.value)}</strong>
          <div className={`small ${totals.gain > 0 ? 'hot' : totals.gain < 0 ? 'cold' : 'muted'}`}>
            {totals.gain >= 0 ? '+' : '−'}{fmtEur(Math.abs(totals.gain))}{totals.cost > 0 && ` (${fmtChange(totals.gain / totals.cost)})`}
          </div></div>
        <div className="card"><div className="card-kicker">Achats envisagés</div><strong>{fmtEur(totals.targets)}</strong>
          <div className="muted small">total avec l’effectif : {fmtEur(totals.costWithTargets)}</div></div>
        <div className="card"><div className="card-kicker">Valeur potentielle avant la GW</div><strong>{fmtEur(totals.potential)}</strong>
          <div className="muted small">si chacun marque son score potentiel</div></div>
      </div>

      {leagueEntries.length > 0 && (
        <div className="gw-toolbar">
          {/* Cartes possédées par poste : un poste vide saute aux yeux. Un clic filtre sur ce poste. */}
          <nav className="chip-row" aria-label="Poste">
            <button type="button" className="chip" aria-pressed={position === ''} onClick={() => setPosition('')}>Tous <span>{owned.length}</span></button>
            {POSITIONS.map(([p, label]) => {
              const n = owned.filter((e) => posOf(e) === p).length;
              return (
                <button key={p} type="button" className={`chip ${n === 0 ? 'missing' : ''}`} aria-pressed={position === p} onClick={() => setPosition(position === p ? '' : p)}>
                  {label} <span>{n === 0 ? 'aucun' : n}</span>
                </button>
              );
            })}
          </nav>
          <div className="gw-controls">
            <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} aria-label="Filtrer par club" className="squad-club-filter">
              <option value="">Tous les clubs</option>
              {[...new Set(leagueEntries.map((e) => info.get(e.slug)?.team).filter((t): t is string => !!t))].sort().map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="segmented" role="radiogroup" aria-label="Trier par">
              {([['poste', 'Poste'], ['valeur', 'Valeur'], ['gain', '+/− value']] as const).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={sort === v} onClick={() => setSort(v)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {leagueEntries.length === 0 ? (
        <p className="empty">Aucune carte dans ce championnat : importe ta galerie Sorare, ou choisis un club ci-dessous et ajoute tes joueurs.</p>
      ) : (
        <>
          <section className="card gw-section" aria-labelledby="mes-cartes">
            <h2 className="card-title" id="mes-cartes">Mes cartes<span>{shownOwned.length}</span></h2>
            {shownOwned.length === 0 ? <p className="empty">Aucune carte pour ce filtre</p> : (
              <ul className="gw-list" aria-label="Mes cartes">
                {shownOwned.map((e) => {
                  const p = info.get(e.slug);
                  const paid = e.purchasePrice;
                  const diff = p?.price != null ? p.price - (paid ?? p.price) : null;
                  return (
                    <li key={e.slug} className="gw-row no-rank squad-row">
                      <PlayerAvatar name={p?.name ?? e.slug} url={p?.pictureUrl ?? null} size={40} />
                      <div className="gw-who">
                        <div className="gw-name"><Link href={`/joueurs/${e.slug}?onglet=marche`}>{p?.name ?? e.slug}</Link></div>
                        <div className="gw-meta">{p?.team ?? ''}{p?.cardPositions.length ? ` · ${cardLabel(p.cardPositions)}` : ''}
                          {p?.potentialGain != null && <span className={p.potentialGain > 0 ? 'hot' : p.potentialGain < 0 ? 'cold' : ''}> · GW {fmtChange(p.potentialGain)}</span>}
                        </div>
                        <label className="squad-paid">Acheté
                          <input key={`${e.slug}-${paid}`} className="price-input" inputMode="decimal" aria-label={`Prix d’achat de ${p?.name ?? e.slug}`}
                            defaultValue={paid ?? ''} placeholder="?" onBlur={(ev) => update(e.slug, { purchasePrice: parsePrice(ev.target.value) })} /> €
                        </label>
                      </div>
                      <div className="gw-score squad-money">
                        <strong>{p?.price == null ? '—' : fmtEur(p.price)}</strong>
                        <span className={`gw-boost ${diff === null || paid === null ? '' : diff > 0 ? 'hot' : diff < 0 ? 'cold' : ''}`}>
                          {paid === null || diff === null ? 'prix d’achat ?' : `${diff >= 0 ? '+' : '−'}${fmtEur(Math.abs(diff))}`}
                        </span>
                      </div>
                      <button type="button" className="link-btn squad-remove" aria-label={`Retirer ${p?.name ?? e.slug}`} onClick={() => remove(e.slug)}>✕</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {shownTargets.length > 0 && (
            <section className="card gw-section" aria-labelledby="a-acheter">
              <h2 className="card-title" id="a-acheter">À acheter<span>{shownTargets.length}</span></h2>
              <ul className="gw-list" aria-label="À acheter">
                {shownTargets.map((e) => {
                  const p = info.get(e.slug);
                  return (
                    <li key={e.slug} className="gw-row no-rank squad-row row-target">
                      <PlayerAvatar name={p?.name ?? e.slug} url={p?.pictureUrl ?? null} size={40} />
                      <div className="gw-who">
                        <div className="gw-name"><Link href={`/joueurs/${e.slug}?onglet=marche`}>{p?.name ?? e.slug}</Link></div>
                        <div className="gw-meta">{p?.team ?? ''}{p?.cardPositions.length ? ` · ${cardLabel(p.cardPositions)}` : ''}
                          {p?.potentialGain != null && <span className={p.potentialGain > 0 ? 'hot' : p.potentialGain < 0 ? 'cold' : ''}> · GW {fmtChange(p.potentialGain)}</span>}
                        </div>
                        <label className="squad-paid">Prix visé
                          <input key={`${e.slug}-${e.purchasePrice}`} className="price-input" inputMode="decimal" aria-label={`Prix visé pour ${p?.name ?? e.slug}`}
                            defaultValue={e.purchasePrice ?? ''} placeholder={p?.price != null ? String(Math.round(p.price * 100) / 100) : '€'}
                            onBlur={(ev) => update(e.slug, { purchasePrice: parsePrice(ev.target.value) })} /> €
                        </label>
                      </div>
                      <div className="gw-score squad-money">
                        <strong>{p?.price == null ? '—' : fmtEur(p.price)}</strong>
                        <button type="button" className="squad-bought" onClick={() => update(e.slug, { status: 'owned', purchasePrice: e.purchasePrice ?? p?.price ?? null })}>Acheté ✓</button>
                      </div>
                      <button type="button" className="link-btn squad-remove" aria-label={`Retirer ${p?.name ?? e.slug}`} onClick={() => remove(e.slug)}>✕</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="squad-search">
        <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">Ajouter une carte : choisir un club</option>
          {teams.filter((t) => t.competitionSlug === league).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
        {clubPlayers.length > 0 && (
          <ul className="search-results" aria-label="Joueurs du club">
            {clubPlayers.map((p) => {
              const entry = inSquad(p.slug);
              return (
                <li key={p.slug}>
                  <span className="player-cell">
                    <PlayerAvatar name={p.name} url={p.pictureUrl} size={28} />
                    <span>{p.name}</span>
                    <span className="muted small">{cardLabel(p.cardPositions)} · {p.price === null ? '—' : fmtEur(p.price)}</span>
                  </span>
                  <span className="search-actions">
                    {entry ? <button type="button" className="secondary" onClick={() => remove(p.slug)}>{entry.status === 'owned' ? 'Dans mes cartes ✕' : 'À acheter ✕'}</button> : (
                      <>
                        <button type="button" onClick={() => add(p, 'owned')} aria-label={`J’ai ${p.name}`}>Je l’ai</button>
                        <button type="button" className="secondary" onClick={() => add(p, 'target')} aria-label={`Acheter ${p.name}`}>À acheter</button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {entries.length > leagueEntries.length && (
        <p className="note">
          Tous championnats : coût réel {fmtEur(allTotals.cost)} · valeur actuelle {fmtEur(allTotals.value)} · avec achats envisagés {fmtEur(allTotals.costWithTargets)}.
        </p>
      )}
      <p className="note">
        Prix actuel : carte Limited de la saison la moins chère en vente. Une fois ton pseudo Sorare saisi, l’effectif est enregistré en ligne : le même sur ton téléphone et ton ordinateur. « Mettre à jour depuis Sorare » relit ta galerie à tout moment.
      </p>
    </div>
  );
}
