import type { ConcededView } from '@/db/queries';
import { DETAILED_POSITIONS, POSITION_LABEL_FR, type DetailedPosition } from '@/domain/types';
import { fmtScore, indexClass } from '@/lib/format';

/** Emplacement de chaque poste sur un terrain vertical (attaque en haut), en % de la largeur / hauteur. */
const ZONES: Record<DetailedPosition, { x: number; y: number }> = {
  ST: { x: 50, y: 10 }, LW: { x: 15, y: 22 }, RW: { x: 85, y: 22 }, AM: { x: 50, y: 30 },
  CM: { x: 50, y: 45 }, LWB: { x: 12, y: 52 }, RWB: { x: 88, y: 52 }, DM: { x: 50, y: 59 },
  LB: { x: 15, y: 72 }, CB: { x: 50, y: 75 }, RB: { x: 85, y: 72 }, GK: { x: 50, y: 91 },
};

/** Terrain coloré selon l'indice concédé par poste (rouge : l'équipe concède plus que la moyenne de la ligue). */
export function Pitch({ cells }: { cells: Partial<Record<DetailedPosition, ConcededView>> }) {
  return (
    <div className="pitch" role="img" aria-label="Score Sorare concédé par poste">
      <div className="pitch-line half" />
      <div className="pitch-line box-top" />
      <div className="pitch-line box-bottom" />
      {DETAILED_POSITIONS.map((p) => {
        const c = cells[p];
        const cls = c && c.average !== null ? `${indexClass(c.index)} ${c.lowSample ? 'low-sample' : ''}` : 'empty';
        return (
          <div key={p} data-testid={`zone-${p}`} className={`zone ${cls}`} style={{ left: `${ZONES[p].x}%`, top: `${ZONES[p].y}%` }}
            title={c ? `${c.observations} observation(s)` : 'Aucune donnée'}>
            <span className="zone-label">{POSITION_LABEL_FR[p]}</span>
            <span className="zone-value">{c && c.average !== null ? fmtScore(c.average) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}
