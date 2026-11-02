'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { MarketPlayerView } from '@/db/queries';
import { cardLabel, type GenericPosition } from '@/domain/types';
import { fmtChange, fmtEur } from '@/lib/format';
import { PlayerAvatar } from './Media';
import { tokens } from '@/lib/star';

/**
 * Carte de l'effectif : possédée (avec son prix d'achat) ou envisagée (prix d'achat prévu, à défaut le prix actuel) ;
 * fromSorare : importée de la galerie Sorare (retirée à la mise à jour suivante si elle n'y est plus).
 */
export interface SquadEntry {
  slug: string; competition: string; status: 'owned' | 'target'; purchasePrice: number | null; fromSorare?: boolean;
  /** Ajout à la main d'un joueur que le site ne suit pas encore (slug « manuel:… ») : remplacé dès que le joueur apparaît. */
  name?: string;
}

export const MANUAL = 'manuel:';
const isManual = (e: SquadEntry) => e.slug.startsWith(MANUAL);

/**
 * Remplace chaque ajout manuel dont le nom correspond désormais à un seul joueur suivi par ce joueur (même statut, même prix) ;
 * l'ajout est simplement retiré si ce joueur est déjà dans l'effectif.
 */
export function resolveManual(entries: SquadEntry[], found: Map<string, { slug: string; name: string }[]>): SquadEntry[] {
  return entries.flatMap((e) => {
    if (!isManual(e) || !e.name) return [e];
    const want = tokens(e.name);
    const hits = (found.get(e.name) ?? []).filter((p) => { const have = tokens(p.name); return want.every((t) => have.includes(t)); });
    if (hits.length !== 1) return [e];
    if (entries.some((x) => x.slug === hits[0].slug && x.competition === e.competition)) return [];
    const { name: _, ...rest } = e;
    return [{ ...rest, slug: hits[0].slug }];
  });
}

export const STORAGE_KEY = 'sorare-scout:effectif:v1';
export const PSEUDO_KEY = 'sorare-scout:pseudo';

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
  const slugsKey = [...new Set(entries.filter((e) => !isManual(e)).map((e) => e.slug))].sort().join(',');
  useEffect(() => {
    if (!slugsKey) return;
    // Par paquets : l'API plafonne chaque demande à 200 joueurs (et l'URL doit rester courte).
    const slugs = slugsKey.split(',');
    for (let i = 0; i < slugs.length; i += 150) {
      fetch(`/api/joueurs?slugs=${encodeURIComponent(slugs.slice(i, i + 150).join(','))}`)
        .then((r) => r.json())
        .then((rows: MarketPlayerView[]) => setInfo((m) => new Map([...m, ...rows.map((r) => [r.slug, r] as const)])))
        .catch(() => {});
    }
  }, [slugsKey]);

  // Ajouts manuels : dès que le joueur est suivi par le site (sous ce nom), il remplace l'ajout.
  const manualKey = [...new Set(entries.filter(isManual).map((e) => e.name ?? ''))].filter(Boolean).sort().join('|');
  useEffect(() => {
    if (!manualKey) return;
    const names = manualKey.split('|');
    Promise.all(names.map((n) => {
      const q = [...tokens(n)].sort((a, b) => b.length - a.length)[0] ?? n; // le mot le plus long (le nom de famille, d'ordinaire)
      return fetch(`/api/joueurs?q=${encodeURIComponent(q)}`).then((r) => r.json() as Promise<MarketPlayerView[]>).then((rows) => [n, rows] as const);
    })).then((res) => {
      const found = new Map(res);
      for (const rows of found.values()) setInfo((m) => new Map([...m, ...rows.map((r) => [r.slug, r] as const)]));
      setEntries((es) => resolveManual(es, found));
    }).catch(() => {});
  }, [manualKey]);

  // Joueurs du club choisi, à cocher.
  useEffect(() => {
    if (!club) { setClubPlayers([]); return; }
    fetch(`/api/joueurs?team=${encodeURIComponent(club)}`).then((r) => r.json()).then(setClubPlayers).catch(() => setClubPlayers([]));
  }, [club]);

  const leagueEntries = entries.filter((e) => e.competition === league);
  const allTotals = useMemo(() => squadTotals(entries, info), [entries, info]);
  const posOf = (e: SquadEntry) => info.get(e.slug)?.cardPositions[0];
  const owned = leagueEntries.filter((e) => e.status === 'owned');
  const visible = (e: SquadEntry) => (!position || info.get(e.slug)?.cardPositions.includes(position))
    && (!clubFilter || info.get(e.slug)?.team === clubFilter);
  // Les tuiles suivent les filtres (club, poste) : coût, valeur et potentiel des seules cartes affichées.
  const totals = squadTotals(leagueEntries.filter(visible), info);
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
  const [manualName, setManualName] = useState('');
  const addManual = (ev: React.FormEvent) => {
    ev.preventDefault();
    const name = manualName.trim();
    const key = tokens(name).join('-');
    if (!key) return;
    setEntries((es) => [...es.filter((e) => !(e.slug === MANUAL + key && e.competition === league)),
      { slug: MANUAL + key, name, competition: league, status: 'owned', purchasePrice: null }]);
    setManualName('');
  };
  const nameOf = (e: SquadEntry) => info.get(e.slug)?.name ?? e.name ?? e.slug;
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
              <ul className="gw-list squad-grid" aria-label="Mes cartes">
                {shownOwned.map((e) => {
                  const p = info.get(e.slug);
                  const paid = e.purchasePrice;
                  const diff = p?.price != null ? p.price - (paid ?? p.price) : null;
                  return (
                    <li key={e.slug} className="gw-row no-rank squad-row">
                      <PlayerAvatar name={nameOf(e)} url={p?.pictureUrl ?? null} size={40} />
                      <div className="gw-who">
                        <div className="gw-name">{isManual(e) ? nameOf(e) : <Link href={`/joueurs/${e.slug}?onglet=marche`}>{nameOf(e)}</Link>}</div>
                        <div className="gw-meta">{isManual(e) ? 'Ajout manuel · pas encore suivi par le site' : p?.team ?? ''}{p?.cardPositions.length ? ` · ${cardLabel(p.cardPositions)}` : ''}
                          {p?.potentialGain != null && <span className={p.potentialGain > 0 ? 'hot' : p.potentialGain < 0 ? 'cold' : ''}> · GW {fmtChange(p.potentialGain)}</span>}
                        </div>
                        <label className="squad-paid">Acheté
                          <input key={`${e.slug}-${paid}`} className="price-input" inputMode="decimal" aria-label={`Prix d’achat de ${nameOf(e)}`}
                            defaultValue={paid ?? ''} placeholder="?" onBlur={(ev) => update(e.slug, { purchasePrice: parsePrice(ev.target.value) })} /> €
                        </label>
                      </div>
                      <div className="gw-score squad-money">
                        <strong>{p?.price == null ? '—' : fmtEur(p.price)}</strong>
                        <span className={`gw-boost ${diff === null || paid === null ? '' : diff > 0 ? 'hot' : diff < 0 ? 'cold' : ''}`}>
                          {paid === null || diff === null ? 'prix d’achat ?' : `${diff >= 0 ? '+' : '−'}${fmtEur(Math.abs(diff))}`}
                        </span>
                      </div>
                      <button type="button" className="link-btn squad-remove" aria-label={`Retirer ${nameOf(e)}`} onClick={() => remove(e.slug)}>✕</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {shownTargets.length > 0 && (
            <section className="card gw-section" aria-labelledby="a-acheter">
              <h2 className="card-title" id="a-acheter">À acheter<span>{shownTargets.length}</span></h2>
              <ul className="gw-list squad-grid" aria-label="À acheter">
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

      <form className="squad-import squad-manual" onSubmit={addManual}>
        <input value={manualName} onChange={(e) => setManualName(e.target.value)} maxLength={80}
          placeholder="Joueur absent de la liste : son nom" aria-label="Nom d’un joueur absent de la liste" />
        <button type="submit" disabled={!tokens(manualName).length}>Ajouter à mes cartes</button>
      </form>

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
