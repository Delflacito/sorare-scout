'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayerGameView } from '@/db/queries';
import { POSITION_LABEL_FR } from '@/domain/types';

const BAR = 20;
/** Largeur d'une bande par match : s'adapte à la carte, défilement horizontal en dessous du minimum. */
const BAND_MIN = 32;
const BAND_MAX = 64;
const BAND_DEFAULT = 46;
/** Au-dessus de ce point, l'info-bulle passe sous le curseur pour ne pas sortir de la carte. */
const TOOLTIP_FLIP = 80;
const PLOT_H = 170;
const TOP = 18;
const LEFT = 30;
const RIGHT = 70;
const BOTTOM = 44;
const TICKS = [0, 25, 50, 75, 100];

const y = (score: number) => TOP + PLOT_H - (Math.min(score, 100) / 100) * PLOT_H;
const fmt = (n: number) => n.toFixed(1);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

/** Colonne à extrémité arrondie (4 px) et base carrée, posée sur la ligne de base. */
function columnPath(x: number, top: number, width: number, bottom: number): string {
  const r = Math.min(4, (bottom - top) / 2, width / 2);
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`;
}

/** Scores des derniers matchs, du plus ancien (gauche) au plus récent (droite), avec le L15 en repère. */
export function ScoreChart({ games, l15 }: { games: PlayerGameView[]; l15: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ordered = [...games].reverse();
  if (!ordered.length) return null;
  const BAND = available
    ? Math.max(BAND_MIN, Math.min(BAND_MAX, (available - LEFT - RIGHT) / ordered.length))
    : BAND_DEFAULT;
  const width = LEFT + ordered.length * BAND + RIGHT;
  const height = TOP + PLOT_H + BOTTOM;
  const baseline = TOP + PLOT_H;
  const played = ordered.filter((g) => g.status !== 'absent');
  const maxIdx = played.length ? ordered.indexOf(played.reduce((a, b) => (b.score > a.score ? b : a))) : -1;
  const lastIdx = ordered.length - 1;
  const g = hover !== null ? ordered[hover] : null;

  return (
    <figure className="chart-card">
      <figcaption className="chart-head">
        <span className="chart-title">Scores Sorare</span>
        <span className="legend">
          <span><i className="swatch start" /> Titulaire</span>
          <span><i className="swatch sub" /> Entré en jeu</span>
          <span><i className="swatch absent" /> Absent</span>
        </span>
      </figcaption>
      <div className="chart-scroll" ref={scrollRef}>
        <div className="chart-box" role="img" aria-label={`Scores Sorare des ${ordered.length} derniers matchs`} style={{ width }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={LEFT - 8} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
              </g>
            ))}
            {ordered.map((m, i) => {
              const x = LEFT + i * BAND + (BAND - BAR) / 2;
              const cx = LEFT + i * BAND + BAND / 2;
              const label = i === maxIdx || i === lastIdx;
              return (
                <g key={m.fixtureId} className={hover === i ? 'is-hover' : undefined}>
                  {m.status === 'absent' ? (
                    <rect data-testid="score-bar" x={x} y={baseline - 2} width={BAR} height={2} className="bar absent" />
                  ) : (
                    <path data-testid="score-bar" d={columnPath(x, y(Math.max(m.score, 1.5)), BAR, baseline)} className={`bar ${m.status === 'started' ? 'start' : 'sub'}`} />
                  )}
                  {label && m.status !== 'absent' && (
                    <text x={cx} y={y(m.score) - 6} textAnchor="middle" className="cap-label">{Math.round(m.score)}</text>
                  )}
                  {m.opponentPictureUrl && (
                    <image href={m.opponentPictureUrl} x={cx - 9} y={baseline + 8} width={18} height={18} aria-hidden="true" />
                  )}
                  <text x={cx} y={baseline + 40} textAnchor="middle" className="tick">{fmtDay(m.date)}</text>
                  <rect
                    data-testid="score-hit"
                    x={LEFT + i * BAND} y={TOP - 10} width={BAND} height={PLOT_H + BOTTOM + 10}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                  />
                </g>
              );
            })}
            {l15 !== null && (
              <g pointerEvents="none">
                <line x1={LEFT} x2={width - RIGHT + 4} y1={y(l15)} y2={y(l15)} className="ref" />
                <text x={width - RIGHT + 8} y={y(l15) + 4} className="ref-label">{`L15 ${fmt(l15)}`}</text>
              </g>
            )}
          </svg>
          {g && hover !== null && (
            <div
              role="tooltip"
              className={`chart-tooltip ${y(g.score) < TOOLTIP_FLIP ? 'below' : ''}`}
              style={{
                left: Math.max(110, Math.min(LEFT + hover * BAND + BAND / 2, width - 110)),
                top: y(g.score) < TOOLTIP_FLIP ? y(g.score) + 12 : y(g.score) - 8,
              }}
            >
              <strong>{g.status === 'absent' ? 'Absent' : fmt(g.score)}</strong>
              <span>{fmtDay(g.date)} · {g.isHome ? 'vs' : '@'} {g.opponent}</span>
              {g.status !== 'absent' && (
                <span>
                  {g.minutes} min{g.position ? ` · ${POSITION_LABEL_FR[g.position]}` : ''} · Décisif {fmt(g.decisive)} · AA {fmt(g.allAround)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
