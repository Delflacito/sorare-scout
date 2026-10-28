import type { PlayerGameView } from '@/db/queries';
import { fmtDate, fmtScore } from '@/lib/format';

const STATUS_LABEL = { started: 'titulaire', sub: 'remplaçant', absent: 'absent' } as const;
const H = 120;
const BAR = 22;
const GAP = 6;

/** Barres des derniers scores, du plus ancien (gauche) au plus récent (droite). Score Sorare plafonné à 100. */
export function ScoreChart({ games }: { games: PlayerGameView[] }) {
  const ordered = [...games].reverse();
  const width = ordered.length * (BAR + GAP);
  return (
    <figure className="score-chart">
      <svg viewBox={`0 0 ${Math.max(width, 1)} ${H + 16}`} width="100%" height={H + 16} preserveAspectRatio="xMinYMid meet" role="img"
        aria-label="Derniers scores Sorare">
        {ordered.map((g, i) => {
          const h = g.status === 'absent' ? 3 : Math.max(3, (Math.min(g.score, 100) / 100) * H);
          return (
            <g key={g.fixtureId} data-testid="score-bar">
              <title>{`${fmtDate(g.date)} ${g.isHome ? 'vs' : '@'} ${g.opponent} : ${fmtScore(g.score)} (${STATUS_LABEL[g.status]})`}</title>
              <rect x={i * (BAR + GAP)} y={H - h} width={BAR} height={h} rx={3} className={`bar ${g.status}`} />
              <text x={i * (BAR + GAP) + BAR / 2} y={H + 13} textAnchor="middle" className="bar-label">
                {g.status === 'absent' ? '–' : Math.round(g.score)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span><i className="dot started" /> titulaire</span>
        <span><i className="dot sub" /> remplaçant</span>
        <span><i className="dot absent" /> absent</span>
      </figcaption>
    </figure>
  );
}
