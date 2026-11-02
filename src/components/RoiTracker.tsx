'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fmtChange, fmtEur } from '@/lib/format';
import { ROI_GROUPS, emptyManual, roiTotals, type RoiData, type RoiGroup, type RoiManual, type RoiOwned } from '@/lib/roi';
import { PSEUDO_KEY } from './SquadBuilder';

const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };

function Roi({ r }: { r: number | null }) {
  if (r === null) return <span className="tile-value">—</span>;
  return <span className={`tile-value ${r > 0 ? 'hot' : r < 0 ? 'cold' : ''}`}>{fmtChange(r)}</span>;
}

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="tile"><div className="tile-label">{label}</div>{children}{hint && <div className="tile-hint">{hint}</div>}</div>;
}

/** Champ numérique : la saisie reste libre (virgule, champ vide) et n'est convertie qu'au moment de l'enregistrer. */
function NumInput({ value, onChange, label, suffix }: { value: number; onChange: (n: number) => void; label: string; suffix?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <span className="roi-num">
      <input inputMode="decimal" aria-label={label} value={text} placeholder="0"
        onChange={(e) => setText(e.target.value)} onBlur={() => onChange(toNum(text))} />
      {suffix}
    </span>
  );
}

function GroupCard({ name, detail, owned, manual, onChange }: {
  name: string; detail?: string; owned: RoiOwned; manual: RoiManual; onChange: (m: RoiManual) => void;
}) {
  const t = roiTotals(owned, manual);
  const setStreak = (i: number, s: Partial<RoiManual['streaks'][number]>) =>
    onChange({ ...manual, streaks: manual.streaks.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  const setSold = (i: number, s: Partial<RoiManual['sold'][number]>) =>
    onChange({ ...manual, sold: manual.sold.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  return (
    <section className="card roi-group" aria-label={name}>
      <h2 className="card-title">{name}<span>{owned.cards} carte{owned.cards > 1 ? 's' : ''} possédée{owned.cards > 1 ? 's' : ''}{detail && ` · ${detail}`}</span></h2>
      <div className="tiles">
        <Tile label="Investi" hint={`${fmtEur(owned.invested)} en galerie${manual.sold.length ? ` + ${fmtEur(t.invested - owned.invested)} revendues` : ''}`}>
          <span className="tile-value">{fmtEur(t.invested)}</span>
        </Tile>
        <Tile label="Gains" hint={`Streaks ${fmtEur(t.streaks)} · reventes ${fmtEur(t.resales)}`}><span className="tile-value">{fmtEur(t.gains)}</span></Tile>
        <Tile label="ROI brut" hint="Streaks + reventes face à l’investi"><Roi r={t.roiGross} /></Tile>
        <Tile label="ROI avec valeur des cartes" hint={`Cartes possédées : ${fmtEur(t.value)} aujourd’hui`}><Roi r={t.roiWithValue} /></Tile>
      </div>
      {(owned.unknownPurchase > 0 || owned.unpriced > 0) && (
        <p className="note">
          {owned.unknownPurchase > 0 && `${owned.unknownPurchase} carte${owned.unknownPurchase > 1 ? 's' : ''} sans prix d’achat connu (récompense, échange) comptée${owned.unknownPurchase > 1 ? 's' : ''} 0 €. `}
          {owned.unpriced > 0 && `${owned.unpriced} carte${owned.unpriced > 1 ? 's' : ''} sans prix actuel (Classic ou joueur non suivi), exclue${owned.unpriced > 1 ? 's' : ''} de la valeur.`}
        </p>
      )}

      <h3 className="roi-sub">Streaks par palier</h3>
      {manual.streaks.length > 0 && (
        <ul className="roi-rows" aria-label={`Streaks ${name}`}>
          {/* Clé liée au nombre de lignes : après un retrait, les champs repartent des bonnes valeurs. */}
          {manual.streaks.map((s, i) => (
            <li key={`${i}/${manual.streaks.length}`}>
              <input className="roi-text" aria-label="Palier" value={s.level} maxLength={80} placeholder="Palier"
                onChange={(e) => setStreak(i, { level: e.target.value })} />
              <NumInput label={`Nombre de streaks ${s.level}`} value={s.count} onChange={(n) => setStreak(i, { count: Math.round(n) })} suffix="×" />
              <NumInput label={`Gain total ${s.level}`} value={s.eur} onChange={(n) => setStreak(i, { eur: n })} suffix="€" />
              <button type="button" className="link-btn" aria-label={`Retirer le palier ${s.level}`}
                onClick={() => onChange({ ...manual, streaks: manual.streaks.filter((_, j) => j !== i) })}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="roi-add" onClick={() => onChange({ ...manual, streaks: [...manual.streaks, { level: `Palier ${manual.streaks.length + 1}`, count: 0, eur: 0 }] })}>
        + Ajouter un palier
      </button>
      {manual.streaks.length > 0 && <p className="note">{manual.streaks.reduce((n, s) => n + s.count, 0)} streaks au total</p>}

      <h3 className="roi-sub">Essence</h3>
      <NumInput label={`Essence ${name}`} value={manual.essence} onChange={(n) => onChange({ ...manual, essence: n })} suffix="unités (hors ROI)" />

      <h3 className="roi-sub">Cartes revendues</h3>
      {manual.sold.length > 0 && (
        <ul className="roi-rows" aria-label={`Cartes revendues ${name}`}>
          {manual.sold.map((s, i) => (
            <li key={`${i}/${manual.sold.length}`}>
              <input className="roi-text" aria-label="Joueur" value={s.name} maxLength={80} placeholder="Joueur"
                onChange={(e) => setSold(i, { name: e.target.value })} />
              <NumInput label={`Prix d’achat ${s.name}`} value={s.bought} onChange={(n) => setSold(i, { bought: n })} suffix="€ achat" />
              <NumInput label={`Prix de revente ${s.name}`} value={s.sold} onChange={(n) => setSold(i, { sold: n })} suffix="€ revente" />
              <button type="button" className="link-btn" aria-label={`Retirer ${s.name || 'cette carte'}`}
                onClick={() => onChange({ ...manual, sold: manual.sold.filter((_, j) => j !== i) })}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="roi-add" onClick={() => onChange({ ...manual, sold: [...manual.sold, { name: '', bought: 0, sold: 0 }] })}>
        + Ajouter une carte revendue
      </button>
    </section>
  );
}

/** ROI par championnat : galerie Sorare (investi, valeur) + saisies enregistrées sur le serveur (streaks, essence, reventes). */
export function RoiTracker() {
  const [pseudo, setPseudo] = useState<string | null>(null);
  const [owned, setOwned] = useState<Record<RoiGroup, RoiOwned> | null>(null);
  const [manual, setManual] = useState<RoiData>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let p = '';
    try { p = window.localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { /* stockage indisponible */ }
    setPseudo(p);
    if (!p) return;
    fetch(`/api/roi?user=${encodeURIComponent(p)}`).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? 'Galerie indisponible');
      setOwned(b.owned);
      setManual(b.manual);
    }).catch((e: Error) => setError(e.message));
  }, []);

  const update = (g: RoiGroup, m: RoiManual) => {
    const next = { ...manual, [g]: m };
    setManual(next);
    setSaved('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/roi?user=${encodeURIComponent(pseudo!)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
        .then((r) => setSaved(r.ok ? 'saved' : 'error')).catch(() => setSaved('error'));
    }, 600);
  };

  if (pseudo === '') {
    return <p className="empty">Importe d’abord ta galerie dans <Link href="/effectif">Mon effectif</Link> : le ROI se calcule avec ton pseudo Sorare.</p>;
  }
  if (error) return <p className="empty cold">{error}</p>;
  if (!owned) return <p className="empty" aria-live="polite">Lecture de ta galerie Sorare…</p>;

  const all = ROI_GROUPS.map((g) => roiTotals(owned[g.key], manual[g.key] ?? emptyManual()));
  const sum = (f: (t: (typeof all)[number]) => number) => all.reduce((n, t) => n + f(t), 0);
  const invested = sum((t) => t.invested);
  const ratio = (x: number) => (invested > 0 ? x / invested - 1 : null);

  return (
    <>
      <div className="tiles roi-summary">
        <Tile label="Investi au total"><span className="tile-value">{fmtEur(invested)}</span></Tile>
        <Tile label="Gains au total" hint="Streaks + reventes"><span className="tile-value">{fmtEur(sum((t) => t.gains))}</span></Tile>
        <Tile label="ROI brut"><Roi r={ratio(sum((t) => t.gains))} /></Tile>
        <Tile label="ROI avec valeur des cartes"><Roi r={ratio(sum((t) => t.gains + t.value))} /></Tile>
      </div>
      <p className="note" aria-live="polite">
        Galerie de {pseudo}. Les cartes sont rangées selon le club actuel du joueur.
        {saved === 'saving' ? ' Enregistrement…' : saved === 'saved' ? ' Saisies enregistrées.' : saved === 'error' ? ' Échec de l’enregistrement, réessaie.' : ''}
      </p>
      {ROI_GROUPS.map((g) => (
        <GroupCard key={g.key} name={g.name} detail={'detail' in g ? g.detail : undefined}
          owned={owned[g.key]} manual={manual[g.key] ?? emptyManual()} onChange={(m) => update(g.key, m)} />
      ))}
    </>
  );
}
