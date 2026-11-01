'use client';

import { useEffect, useRef, useState } from 'react';
import type { SaleView } from '@/db/queries';
import { median } from '@/domain/market';
import { fmtEur } from '@/lib/format';

const H = 240;
const TOP = 16;
const BOTTOM = 30;
const LEFT = 52;
const RIGHT = 16;
const MIN_W = 240;
/** Médiane glissante des ventes de la saison : tendance lisible malgré la dispersion des prix. */
const ROLLING = 5;

type Filter = 'season' | 'classic' | 'all';

/** Graduations « rondes » de 0 au maximum. */
function ticks(max: number): number[] {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

/** Dernières ventes Limited : un point par vente (saison en cours / Classic) et la médiane glissante de la saison. */
export function SalesChart({ sales, season }: { sales: SaleView[]; season: number }) {
  const [filter, setFilter] = useState<Filter>('season');
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(MIN_W, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const yy = String(season % 100).padStart(2, '0');
  const shown = sales.filter((s) => filter === 'all' || (filter === 'season') === s.inSeason);
  const times = shown.map((s) => Date.parse(s.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const yTicks = ticks(Math.max(...shown.map((s) => s.eur), 1) * 1.1);
  const yMax = yTicks.at(-1)!;
  const x = (t: number) => LEFT + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (width - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - v / yMax) * (H - TOP - BOTTOM);
  const seasonSales = shown.filter((s) => s.inSeason);
  const trend = seasonSales.map((s, i) => ({ t: Date.parse(s.date), v: median(seasonSales.slice(Math.max(0, i - ROLLING + 1), i + 1).map((v) => v.eur))! }));
  const h = hover !== null ? shown[hover] : null;
  const xLabels = shown.length ? [t0, (t0 + t1) / 2, t1] : [];

  return (
    <figure className="card chart-card">
      <figcaption className="chart-head">
        <span className="card-title">Dernières ventes <span>Limited</span></span>
        <span className="legend">
          <span><i className="swatch start" /> Saison {yy}</span>
          <span><i className="swatch sub" /> Classic</span>
          <span><i className="swatch line" /> Médiane ({ROLLING} ventes)</span>
        </span>
      </figcaption>
      <div className="chart-filters">
        <div className="segmented" role="radiogroup" aria-label="Cartes">
          {([['season', `Saison ${yy}`], ['classic', 'Classic'], ['all', 'Toutes']] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={filter === v} onClick={() => { setHover(null); setFilter(v); }}>{label}</button>
          ))}
        </div>
        <span className="chart-avg">{shown.length} vente{shown.length > 1 ? 's' : ''}</span>
      </div>
      <div ref={ref} className="chart-box" style={{ width: '100%' }}>
        {shown.length === 0 ? <p className="empty">Aucune vente pour ces cartes</p> : (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`${shown.length} dernières ventes, de ${fmtEur(Math.min(...shown.map((s) => s.eur)))} à ${fmtEur(Math.max(...shown.map((s) => s.eur)))}`}>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={width - RIGHT} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />
                <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="tick">{v === 0 ? '0 €' : fmtEur(v)}</text>
              </g>
            ))}
            {xLabels.map((t, i) => (
              <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="tick">{fmtDay(new Date(t).toISOString())}</text>
            ))}
            {trend.length > 1 && (
              <polyline className="sales-trend" points={trend.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />
            )}
            {shown.map((s, i) => (
              <circle key={`${s.date}-${s.eur}-${i}`} data-testid="sale-point" cx={x(Date.parse(s.date))} cy={y(s.eur)} r={hover === i ? 6 : 4}
                className={`sale ${s.inSeason ? 'start' : 'sub'}`} tabIndex={0}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>
        )}
        {h && hover !== null && (
          <div role="tooltip" className="chart-tooltip" style={{ left: Math.max(90, Math.min(x(Date.parse(h.date)), width - 90)), top: y(h.eur) - 10 }}>
            <strong>{fmtEur(h.eur)}</strong>
            <span>{new Date(h.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} · {h.inSeason ? `Saison ${yy}` : 'Classic'}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
