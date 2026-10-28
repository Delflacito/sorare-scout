'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayerGameView } from '@/db/queries';
import { POSITION_LABEL_FR } from '@/domain/types';
import { actionItems, describeActions } from '@/domain/actions';
import { scoreTier } from '@/lib/format';
import { Venue } from './Venue';

/** Barre fine à extrémités arrondies, colorée selon le niveau du score (comme dans l'application Sorare). */
const BAR = 8;
/** Largeur d'une bande par match : s'adapte à la carte, défilement horizontal en dessous du minimum. */
const BAND_MIN = 40;
const BAND_MAX = 64;
const BAND_DEFAULT = 50;
/** Au-dessus de ce point, l'info-bulle passe sous le curseur pour ne pas sortir de la carte. */
const TOOLTIP_FLIP = 90;
/** Pastille d'action décisive posée au pied de la barre. */
const ICON = 20;
const PLOT_H = 190;
/** Mois en haut, puis valeur au-dessus de chaque barre. */
const TOP = 46;
const LEFT = 12;
const RIGHT = 62;
const BOTTOM = 52;
/** Matchs affichés après filtrage. */
const SHOWN = 15;

export type VenueFilter = 'all' | 'home' | 'away';
/** all : toutes compétitions ; league : championnat ; sinon nom d'une compétition. */
export type CompetitionFilter = string;

/** Matchs retenus par les filtres, du plus récent au plus ancien, au plus `limit`. */
export function filterGames(games: PlayerGameView[], competition: CompetitionFilter, venue: VenueFilter, limit = SHOWN): PlayerGameView[] {
  return games
    .filter((g) => competition === 'all' || (competition === 'league' ? g.isLeague : g.competition === competition))
    .filter((g) => venue === 'all' || (venue === 'home') === g.isHome)
    .slice(0, limit);
}

const y = (score: number) => TOP + PLOT_H - (Math.min(score, 100) / 100) * PLOT_H;
const fmt = (n: number) => n.toFixed(1);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'Europe/Paris' });
const monthKey = (iso: string) => iso.slice(0, 7);

/** Icônes d'un match regroupées par symbole (⚽ ×2), deux au plus. */
function groupIcons(actions: Record<string, number>): { icon: string; count: number }[] {
  const groups = new Map<string, number>();
  for (const a of actionItems(actions)) groups.set(a.icon, (groups.get(a.icon) ?? 0) + a.count);
  return [...groups].map(([icon, count]) => ({ icon, count })).slice(0, 2);
}

/**
 * Scores des derniers matchs, du plus ancien (gauche) au plus récent (droite), avec le L15 en repère,
 * filtrables par compétition et par lieu ; pastilles au pied des barres pour les actions décisives.
 * `games` : matchs de la saison, du plus récent au plus ancien.
 */
export function ScoreChart({ games, l15 }: { games: PlayerGameView[]; l15: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [competition, setCompetition] = useState<CompetitionFilter>('all');
  const [venue, setVenue] = useState<VenueFilter>('all');
  const [available, setAvailable] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Le match le plus récent est à droite : on ouvre le graphique dessus (et après chaque changement de filtre).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [competition, venue, available, games]);
  if (!games.length) return null;
  const others = [...new Set(games.filter((g) => !g.isLeague).map((g) => g.competition))];
  const ordered = filterGames(games, competition, venue).reverse();
  const playedScores = ordered.filter((g) => g.status !== 'absent').map((g) => g.score);
  const average = playedScores.length ? playedScores.reduce((a, b) => a + b, 0) / playedScores.length : null;
  const select = (f: () => void) => { setHover(null); f(); };
  const BAND = available
    ? Math.max(BAND_MIN, Math.min(BAND_MAX, (available - LEFT - RIGHT) / Math.max(ordered.length, 1)))
    : BAND_DEFAULT;
  const width = LEFT + ordered.length * BAND + RIGHT;
  const height = TOP + PLOT_H + BOTTOM;
  const baseline = TOP + PLOT_H;
  const g = hover !== null ? ordered[hover] : null;

  return (
    <figure className="card chart-card">
      <figcaption className="chart-head">
        <span className="card-title">Scores Sorare</span>
        <span className="legend">
          <span>⚽ but</span>
          <span>🎯 passe déc.</span>
          <span>🧤 arrêt / clean sheet</span>
          <span>🟥⚠️ action négative</span>
        </span>
      </figcaption>
      <div className="chart-filters">
        <select aria-label="Compétition du graphique" value={competition} onChange={(e) => select(() => setCompetition(e.target.value))}>
          <option value="all">Toutes compétitions</option>
          <option value="league">Championnat</option>
          {others.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Lieu">
          {([['all', 'Dom. & Ext.'], ['home', 'Domicile'], ['away', 'Extérieur']] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={venue === v} onClick={() => select(() => setVenue(v))}>{label}</button>
          ))}
        </div>
        <span className="chart-avg">
          {average === null ? 'Aucun match joué' : <>Moyenne <strong>{fmt(average)}</strong> sur {playedScores.length} match{playedScores.length > 1 ? 's' : ''} joué{playedScores.length > 1 ? 's' : ''}</>}
        </span>
      </div>
      <div className="chart-scroll" ref={scrollRef}>
        {ordered.length === 0 ? <p className="empty">Aucun match pour ces filtres</p> : (
        <div className="chart-box" role="img" aria-label={`Scores Sorare des ${ordered.length} derniers matchs`} style={{ width }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1={LEFT} x2={width - RIGHT} y1={baseline} y2={baseline} className="axis" />
            {ordered.map((m, i) => {
              const x0 = LEFT + i * BAND;
              const cx = x0 + BAND / 2;
              const newMonth = i === 0 || monthKey(ordered[i - 1].date) !== monthKey(m.date);
              const top = y(Math.max(m.score, 3));
              const tier = m.status === 'absent' ? 'absent' : scoreTier(m.score);
              return (
                <g key={m.fixtureId} className={hover === i ? 'is-hover' : undefined}>
                  {newMonth && (
                    <>
                      {i > 0 && <line x1={x0} x2={x0} y1={14} y2={baseline} className="month-sep" />}
                      <text x={x0 + 4} y={12} className="month-label">{fmtMonth(m.date)}</text>
                    </>
                  )}
                  {m.status === 'absent' ? (
                    <circle data-testid="score-bar" cx={cx} cy={baseline - 3} r={3} className="bar absent" />
                  ) : (
                    <>
                      <rect data-testid="score-bar" x={cx - BAR / 2} y={top} width={BAR} height={baseline - top} rx={BAR / 2} className={`bar ${tier}`} />
                      <text x={cx} y={top - 8} textAnchor="middle" className={`value-label ${tier}`}>{Math.round(m.score)}</text>
                    </>
                  )}
                  {groupIcons(m.actions).map((a, k) => (
                    <g key={a.icon} transform={`translate(${cx}, ${baseline - ICON / 2 - 4 - k * (ICON + 2)})`}>
                      <circle r={ICON / 2} className={`action-dot ${tier}`} />
                      <text data-testid="action-icon" textAnchor="middle" dy="4" className="action-icon">{a.icon}</text>
                      {a.count > 1 && (
                        <g transform={`translate(${ICON / 2}, ${-ICON / 2 + 1})`}>
                          <circle r={6} className="action-count-bg" />
                          <text textAnchor="middle" dy="3" className="action-count">{a.count}</text>
                        </g>
                      )}
                    </g>
                  ))}
                  {m.opponentPictureUrl
                    ? <image href={m.opponentPictureUrl} x={cx - 10} y={baseline + 8} width={20} height={20} aria-hidden="true" />
                    : <text x={cx} y={baseline + 22} textAnchor="middle" className="tick">{m.opponent.slice(0, 3).toUpperCase()}</text>}
                  <text x={cx} y={baseline + 44} textAnchor="middle" className="minutes-label">{m.status === 'absent' ? '—' : `${m.minutes}′`}</text>
                  <rect
                    data-testid="score-hit"
                    x={x0} y={TOP - 24} width={BAND} height={PLOT_H + BOTTOM + 24}
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
                top: y(g.score) < TOOLTIP_FLIP ? y(g.score) + 12 : y(g.score) - 24,
              }}
            >
              <strong>{g.status === 'absent' ? 'Absent' : fmt(g.score)}</strong>
              <span>{fmtDay(g.date)} · <Venue isHome={g.isHome} /> {g.opponent}{!g.isLeague && ` · ${g.competition}`}</span>
              {g.status !== 'absent' && (
                <span>
                  {g.status === 'started' ? 'Titulaire' : 'Entré en jeu'} · {g.minutes} min{g.position ? ` · ${POSITION_LABEL_FR[g.position]}` : ''}
                </span>
              )}
              {g.status !== 'absent' && <span>Décisif {fmt(g.decisive)} · All-Around {fmt(g.allAround)}</span>}
              {describeActions(g.actions) && <span>{describeActions(g.actions)}</span>}
            </div>
          )}
        </div>
        )}
      </div>
    </figure>
  );
}
