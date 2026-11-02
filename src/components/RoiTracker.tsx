'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fmtChange, fmtEur } from '@/lib/format';
import {
  ROI_GROUPS, STREAK_TIERS, breakEven, emptyManual, roiTotals, type RoiData, type RoiGroup, type RoiManual, type RoiOwned, type RoiTotals, type RoiWeek,
} from '@/lib/roi';
import { PSEUDO_KEY } from './SquadBuilder';

const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };
const tone = (r: number | null) => (r === null ? '' : r > 0 ? 'hot' : r < 0 ? 'cold' : '');

const SORTS = [
  { key: 'roiWithValue', label: 'ROI avec cartes' },
  { key: 'roiGross', label: 'ROI brut' },
  { key: 'invested', label: 'Investi' },
  { key: 'gains', label: 'Gains' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const isRoi = (k: SortKey) => k === 'roiWithValue' || k === 'roiGross';

/**
 * Barre de classement : pour un ROI, barre divergente centrée sur 0 % (bleu au-dessus, rouge en dessous) ;
 * pour un montant, barre depuis 0. La valeur est écrite à côté, la couleur ne porte que le sens.
 */
function RankBar({ v, max, roi }: { v: number | null; max: number; roi: boolean }) {
  if (v === null) return <span className="roi-rank-bar" />;
  const w = `${(Math.abs(v) / (max || 1)) * (roi ? 50 : 100)}%`;
  const style = roi ? (v >= 0 ? { left: '50%', width: w } : { right: '50%', width: w }) : { left: 0, width: w };
  return (
    <span className={`roi-rank-bar ${roi ? 'diverging' : ''}`} aria-hidden="true">
      <span className={roi ? (v >= 0 ? 'pos' : 'neg') : 'mag'} style={style} />
    </span>
  );
}

function Badge({ label, r }: { label: string; r: number | null }) {
  return <span className={`roi-badge ${tone(r)}`}><span>{label}</span> {r === null ? '—' : fmtChange(r)}</span>;
}

/** Compteur tactile : − / + et saisie directe du nombre. */
function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <span className="roi-stepper">
      <button type="button" aria-label={`${label} : un de moins`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
      <input inputMode="numeric" aria-label={label} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(Math.round(toNum(text)))} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label={`${label} : un de plus`} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

/** Champ en euros : la saisie reste libre (virgule, champ vide) et n'est convertie qu'en quittant le champ. */
function EurInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <span className="roi-num">
      <input inputMode="decimal" aria-label={label} value={text} placeholder="0"
        onChange={(e) => setText(e.target.value)} onBlur={() => onChange(toNum(text))} />€
    </span>
  );
}

/** Total cumulé + case « ajouter » : le gain du jour s'ajoute au total (négatif pour corriger, jamais sous 0). */
function AddToTotal({ label, total, format, integer, onChange }: {
  label: string; total: number; format: (n: number) => string; integer?: boolean; onChange: (n: number) => void;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const n = Number(text.replace(',', '.').replace('−', '-'));
    if (!text.trim() || !Number.isFinite(n)) return;
    const next = Math.max(0, total + n);
    onChange(integer ? Math.round(next) : Math.round(next * 100) / 100);
    setText('');
  };
  return (
    <form className="roi-addtotal" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div><span className="tile-label">{label} · total</span><strong aria-label={`${label} total`}>{format(total)}</strong></div>
      <input inputMode="decimal" aria-label={`${label} à ajouter`} placeholder="+ ajouter" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="roi-ok" aria-label={`Ajouter au total ${label.toLowerCase()}`}>Ajouter</button>
    </form>
  );
}

/** Seuil de rentabilité : combien de streaks d'un palier il faut encore pour couvrir l'investi (sans compter la valeur des cartes). */
function BreakEven({ group, t }: { group: RoiGroup; t: RoiTotals }) {
  const need = breakEven(group, t);
  if (!t.invested) return null;
  if (!need.length) return <p className="roi-breakeven ok">✓ Investi remboursé par les gains : tout le reste est du bénéfice.</p>;
  return (
    <div className="roi-breakeven">
      <p>Pour rentrer dans tes frais, il te reste <strong>{fmtEur(t.invested - t.gains)}</strong> à gagner, soit au choix :</p>
      <ul>{need.map((x) => <li key={x.score}><strong>{x.count}</strong> streak{x.count > 1 ? 's' : ''} à {x.score} pts <span className="muted">({fmtEur(x.eur)})</span></li>)}</ul>
    </div>
  );
}

/** Une ligne par semaine : investi, gains, valeur des cartes et ROI, pour suivre la progression. */
function History({ weeks }: { weeks: RoiWeek[] }) {
  if (!weeks.length) return null;
  const ratio = (w: RoiWeek, x: number) => (w.invested > 0 ? fmtChange(x / w.invested - 1) : '—');
  const fmtWeek = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <section className="card roi-history" aria-labelledby="roi-history">
      <h2 className="card-title" id="roi-history">ROI semaine par semaine<span>noté à chaque visite</span></h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Semaine du</th><th scope="col" className="num">Investi</th><th scope="col" className="num">Gains</th>
            <th scope="col" className="num">Cartes</th><th scope="col" className="num">ROI brut</th><th scope="col" className="num">Avec cartes</th></tr></thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w.week}>
                <td>{fmtWeek(w.week)}</td><td className="num">{fmtEur(w.invested)}</td><td className="num">{fmtEur(w.gains)}</td>
                <td className="num">{fmtEur(w.value)}</td><td className="num">{ratio(w, w.gains)}</td><td className="num">{ratio(w, w.gains + w.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Detail({ group, owned, manual, t, onChange }: {
  group: RoiGroup; owned: RoiOwned; manual: RoiManual; t: RoiTotals; onChange: (m: RoiManual) => void;
}) {
  const setSold = (i: number, s: Partial<RoiManual['sold'][number]>) =>
    onChange({ ...manual, sold: manual.sold.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  // Une seule carte revendue dépliée à la fois (celle qu'on saisit) ; les autres tiennent sur une ligne.
  const [editing, setEditing] = useState<number | null>(null);
  const remove = (i: number) => { setEditing(null); onChange({ ...manual, sold: manual.sold.filter((_, j) => j !== i) }); };
  return (
    <div className="roi-detail">
      <div className="roi-badges"><Badge label="ROI brut" r={t.roiGross} /><Badge label="ROI avec cartes" r={t.roiWithValue} /></div>
      <dl className="roi-figures">
        <div><dt>Investi</dt><dd>{fmtEur(t.invested)}</dd></div>
        <div><dt>Streaks</dt><dd>{fmtEur(t.streaks)}</dd></div>
        <div><dt>Leaderboard</dt><dd>{fmtEur(t.leaderboard)}</dd></div>
        <div><dt>Reventes</dt><dd>{fmtEur(t.resales)}</dd></div>
        <div><dt>Cartes aujourd’hui</dt><dd>{fmtEur(t.value)}</dd></div>
        <div><dt>Essence</dt><dd>{t.essence.toLocaleString('fr-FR')}</dd></div>
      </dl>
      <BreakEven group={group} t={t} />
      {(owned.unknownPurchase > 0 || owned.unpriced > 0) && (
        <p className="note">
          {owned.cards} cartes de la saison en galerie.
          {owned.unknownPurchase > 0 && ` ${owned.unknownPurchase} sans prix d’achat connu (récompense, échange) : comptées 0 €.`}
          {owned.unpriced > 0 && ` ${owned.unpriced} sans prix actuel (joueur non suivi) : hors valeur.`}
        </p>
      )}

      <h3 className="roi-sub">Streaks atteints <span>{t.streakCount}</span></h3>
      <ul className="roi-tiers" aria-label="Streaks par palier">
        {STREAK_TIERS[group].map((tier) => {
          const n = manual.streaks[tier.score] ?? 0;
          return (
            <li key={tier.score} className={n > 0 ? 'has' : ''}>
              <span className="roi-tier">
                <strong>{tier.score} pts</strong>
                <span className={tier.eur ? 'roi-eur' : 'roi-ess'}>{tier.eur ? fmtEur(tier.eur) : `${tier.essence} essence`}</span>
              </span>
              <Stepper label={`Streaks à ${tier.score} points`} value={n}
                onChange={(v) => onChange({ ...manual, streaks: { ...manual.streaks, [tier.score]: Math.max(0, v) } })} />
            </li>
          );
        })}
      </ul>

      <h3 className="roi-sub">Leaderboard</h3>
      <div className="roi-lb">
        <AddToTotal label="Euros" total={manual.leaderboard?.eur ?? 0} format={fmtEur}
          onChange={(n) => onChange({ ...manual, leaderboard: { essence: manual.leaderboard?.essence ?? 0, eur: n } })} />
        <AddToTotal label="Essence" total={manual.leaderboard?.essence ?? 0} format={(n) => n.toLocaleString('fr-FR')} integer
          onChange={(n) => onChange({ ...manual, leaderboard: { eur: manual.leaderboard?.eur ?? 0, essence: n } })} />
      </div>

      <h3 className="roi-sub">Cartes revendues <span>{manual.sold.length}</span></h3>
      {manual.sold.length > 0 && (
        <ul className="roi-rows" aria-label="Cartes revendues">
          {/* Clé liée au nombre de lignes : après un retrait, les champs repartent des bonnes valeurs. */}
          {manual.sold.map((s, i) => (editing === i ? (
            <li key={`${i}/${manual.sold.length}`} className="roi-sold-edit">
              <input className="roi-text" aria-label="Joueur" value={s.name} maxLength={80} placeholder="Joueur" autoFocus={!s.name}
                onChange={(e) => setSold(i, { name: e.target.value })} />
              <label className="roi-field">Achat <EurInput label={`Prix d’achat ${s.name}`} value={s.bought} onChange={(n) => setSold(i, { bought: n })} /></label>
              <label className="roi-field">Revente <EurInput label={`Prix de revente ${s.name}`} value={s.sold} onChange={(n) => setSold(i, { sold: n })} /></label>
              <button type="button" className="roi-ok" onClick={() => setEditing(null)}>OK</button>
            </li>
          ) : (
            <li key={`${i}/${manual.sold.length}`} className="roi-sold">
              <span className="roi-sold-name">{s.name || 'Sans nom'}</span>
              <span className="roi-sold-figs">{fmtEur(s.bought)} → {fmtEur(s.sold)} <strong>({s.sold - s.bought >= 0 ? '+' : '−'}{fmtEur(Math.abs(s.sold - s.bought))})</strong></span>
              <button type="button" className="link-btn" aria-label={`Modifier ${s.name || 'cette carte'}`} onClick={() => setEditing(i)}>✎</button>
              <button type="button" className="link-btn" aria-label={`Retirer ${s.name || 'cette carte'}`} onClick={() => remove(i)}>✕</button>
            </li>
          )))}
        </ul>
      )}
      <button type="button" className="roi-add" onClick={() => { setEditing(manual.sold.length); onChange({ ...manual, sold: [...manual.sold, { name: '', bought: 0, sold: 0 }] }); }}>
        + Ajouter une carte revendue
      </button>
    </div>
  );
}

/** ROI par championnat : galerie Sorare (investi, valeur) + saisies enregistrées sur le serveur (streaks, leaderboard, reventes). */
export function RoiTracker() {
  const [pseudo, setPseudo] = useState<string | null>(null);
  const [owned, setOwned] = useState<Record<RoiGroup, RoiOwned> | null>(null);
  const [history, setHistory] = useState<RoiWeek[]>([]);
  const [manual, setManual] = useState<RoiData>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sort, setSort] = useState<SortKey>('roiWithValue');
  const [open, setOpen] = useState<RoiGroup | null>(null);
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
      setHistory(b.history ?? []);
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

  const rows = ROI_GROUPS.map((g) => {
    const m = manual[g.key] ?? emptyManual();
    return { ...g, m, t: roiTotals(g.key, owned[g.key], m) };
  });
  const sorted = [...rows].sort((a, b) => (b.t[sort] ?? -Infinity) - (a.t[sort] ?? -Infinity));
  const max = Math.max(...rows.map((r) => Math.abs(r.t[sort] ?? 0)));
  const metricText = (t: RoiTotals) => (t[sort] === null ? '—' : isRoi(sort) ? fmtChange(t[sort]!) : fmtEur(t[sort]!));
  const invested = rows.reduce((n, r) => n + r.t.invested, 0);
  const gains = rows.reduce((n, r) => n + r.t.gains, 0);
  const value = rows.reduce((n, r) => n + r.t.value, 0);
  const ratio = (x: number) => (invested > 0 ? x / invested - 1 : null);
  const total = { roiGross: ratio(gains), roiWithValue: ratio(gains + value) };

  return (
    <>
      <section className="roi-total" aria-label="Tous championnats">
        <div className="roi-hero">
          <span className="tile-label">ROI avec la valeur des cartes</span>
          <strong>{total.roiWithValue === null ? '—' : fmtChange(total.roiWithValue)}</strong>
          <span className="tile-hint">(gains + cartes − investi) / investi, tous championnats</span>
        </div>
        <div className="roi-kpis">
          <div className="tile"><div className="tile-label">Investi</div><div className="roi-kpi">{fmtEur(invested)}</div></div>
          <div className="tile"><div className="tile-label">Gains</div><div className="roi-kpi">{fmtEur(gains)}</div><div className="tile-hint">streaks + leaderboard + reventes</div></div>
          <div className="tile"><div className="tile-label">Valeur des cartes</div><div className="roi-kpi">{fmtEur(value)}</div></div>
          <div className="tile"><div className="tile-label">ROI brut</div><div className="roi-kpi">{total.roiGross === null ? '—' : fmtChange(total.roiGross)}</div></div>
        </div>
      </section>

      <h2 className="roi-rank-title">Classement des championnats</h2>
      <div className="roi-sort chip-row" role="group" aria-label="Trier par">
        {SORTS.map((s) => (
          <button key={s.key} type="button" className="chip" aria-pressed={sort === s.key}
            onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      <ul className="roi-list" aria-label="Championnats">
        {sorted.map((r) => {
          const isOpen = open === r.key;
          return (
            <li key={r.key} className={`card roi-item ${isOpen ? 'open' : ''}`}>
              <button type="button" className="roi-item-head" aria-expanded={isOpen} aria-controls={`roi-${r.key}`}
                aria-label={`${r.name} : ${metricText(r.t)}, ${fmtEur(r.t.invested)} investis, ${fmtEur(r.t.gains)} gagnés`}
                onClick={() => setOpen(isOpen ? null : r.key)}>
                <span className="roi-item-name">{r.name}{'detail' in r && <small>{r.detail}</small>}</span>
                <span className="roi-item-value">{metricText(r.t)}</span>
                <RankBar v={r.t[sort]} max={max} roi={isRoi(sort)} />
                <span className="roi-chevron" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen && (
                <div id={`roi-${r.key}`}>
                  <Detail group={r.key} owned={owned[r.key]} manual={r.m} t={r.t} onChange={(m) => update(r.key, m)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <History weeks={history} />
      <p className="note" aria-live="polite">
        Galerie de {pseudo} · cartes de la saison seulement (pas les Classic), rangées selon le club actuel du joueur · l’essence ne compte pas dans le ROI.
        {saved === 'saving' ? ' Enregistrement…' : saved === 'saved' ? ' Saisies enregistrées.' : saved === 'error' ? ' Échec de l’enregistrement, réessaie.' : ''}
      </p>
    </>
  );
}
