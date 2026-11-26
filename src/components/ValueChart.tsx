'use client';

import { useEffect, useRef, useState } from 'react';
import type { ValueSeries } from '@/domain/market';
import { fmtEur } from '@/lib/format';

const H = 220;
const TOP = 16;
const BOTTOM = 30;
const LEFT = 60;
const RIGHT = 16;
const MIN_W = 240;

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** Graduations « rondes » autour de la plage des valeurs (l'axe ne part pas de 0 : c'est l'évolution qui compte). */
function ticks(min: number, max: number): number[] {
  const raw = (max - min || max || 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const from = Math.floor(min / step) * step;
  return Array.from({ length: Math.ceil((max - from) / step) + 1 }, (_, i) => from + i * step);
}

type Cards = 'season' | 'classic';

/** Valeur de l'effectif d'un club (ou de tous les clubs d'un championnat), jour par jour : cartes de la saison ou Classic. */
export function ValueChart({ series, yy, subject = 'l’effectif' }: { series: ValueSeries; yy: string; subject?: string }) {
  const [cards, setCards] = useState<Cards>(series.season.length >= 2 || series.classic.length < 2 ? 'season' : 'classic');
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(MIN_W, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cards]); // la zone du graphique n'existe pas quand il n'y a pas assez de ventes : on la rattache au changement de cartes
  if (series.season.length < 2 && series.classic.length < 2) return null;
  const points = series[cards];
  const season = cards === 'season';
  const label = 'Valeur actuelle';
  const toggle = (
    <div className="segmented" role="radiogroup" aria-label="Cartes">
      {([['season', `Saison ${yy}`], ['classic', 'Classic']] as const).map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={cards === v} onClick={() => { setHover(null); setCards(v); }}>{text}</button>
      ))}
    </div>
  );
  if (points.length < 2) {
    return (
      <figure className="card chart-card">
        <figcaption className="chart-head"><span className="card-title">Évolution de la valeur actuelle</span>{toggle}</figcaption>
        <p className="empty">Pas assez de ventes de cartes {season ? `de la saison ${yy}` : 'Classic'} pour tracer une courbe</p>
      </figure>
    );
  }
  const values = points.map((p) => p.value);
  const yTicks = ticks(Math.min(...values), Math.max(...values));
  const [yMin, yMax] = [yTicks[0], yTicks.at(-1)!];
  const x = (i: number) => LEFT + (i / (points.length - 1)) * (width - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - TOP - BOTTOM);
  const first = points[0];
  const last = points.at(-1)!;
  const change = first.value ? last.value / first.value - 1 : 0;
  const h = hover !== null ? points[hover] : null;
  // Étiquettes de date espacées d'au moins 56 px.
  const every = Math.ceil(56 / ((width - LEFT - RIGHT) / points.length));

  return (
    <figure className="card chart-card">
      <figcaption className="chart-head">
        <span className="card-title">Évolution de la valeur actuelle</span>
        {toggle}
      </figcaption>
      <p className="chart-avg">
        {label} depuis le {fmtDay(first.day)} : <strong className={change > 0 ? 'hot' : change < 0 ? 'cold' : ''}>
          {change >= 0 ? '+' : '−'}{Math.abs(Math.round(change * 100))} %</strong>
      </p>
      <div ref={ref} className="chart-box" style={{ width: '100%' }} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
          aria-label={`${label} de ${subject} (${season ? `saison ${yy}` : 'Classic'}), de ${fmtEur(first.value)} le ${fmtDay(first.day)} à ${fmtEur(last.value)} aujourd’hui`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(v)} y2={y(v)} className="grid" />
              <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="tick">{fmtEur(v)}</text>
            </g>
          ))}
          {points.map((p, i) => ((i % every === 0 && points.length - 1 - i >= every) || i === points.length - 1) && (
            <text key={p.day} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="tick">{fmtDay(p.day)}</text>
          ))}
          {h && <line x1={x(hover!)} x2={x(hover!)} y1={TOP} y2={H - BOTTOM} className="axis" />}
          <polyline className="value-line" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
          {points.map((p, i) => (
            <circle key={p.day} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : i === points.length - 1 ? 4.5 : 3.5} className="value-dot" />
          ))}
          {/* Zones de survol : toute la hauteur, une par jour (plus large que le point). */}
          {points.map((p, i) => (
            <rect key={p.day} data-testid="value-hit" x={x(i) - (width - LEFT - RIGHT) / (points.length - 1) / 2} y={TOP} height={H - TOP - BOTTOM}
              width={(width - LEFT - RIGHT) / (points.length - 1)} fill="transparent" tabIndex={0} aria-label={`${fmtDay(p.day)} : ${fmtEur(p.value)}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          ))}
        </svg>
        {h && (
          <div role="tooltip" className="chart-tooltip" style={{ left: Math.max(90, Math.min(x(hover!), width - 90)), top: y(h.value) - 10 }}>
            <strong>{fmtEur(h.value)}</strong>
            <span>{fmtDay(h.day)} · {h.players} joueur{h.players > 1 ? 's' : ''} vendu{h.players > 1 ? 's' : ''} ce jour</span>
          </div>
        )}
      </div>
      <details className="chart-data">
        <summary>Voir les données</summary>
        <table>
          <thead><tr><th scope="col">Jour</th><th scope="col">{label}</th><th scope="col">Joueurs vendus</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.day}><td>{fmtDay(p.day)}</td><td className="num">{fmtEur(p.value)}</td><td className="num">{p.players}</td></tr>)}</tbody>
        </table>
      </details>
      <p className="note">
        Reconstituée d’après les ventes de cartes {season ? `de la saison ${yy}` : 'Classic'} : chaque jour, chaque joueur compte
        pour sa vente moyenne du jour, sinon pour sa dernière vente. Chaque point est une moyenne pondérée des 3 derniers
        jours (le jour même compte le plus). Seules les reventes entre managers comptent : ni les enchères ni les ventes
        directes de Sorare, ni la valeur estimée. La courbe commence quand au moins 80 % des joueurs ont une vente connue
        (le site ne garde que les dernières ventes de chaque joueur).
      </p>
    </figure>
  );
}
