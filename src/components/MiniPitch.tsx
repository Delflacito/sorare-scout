import type { DetailedPosition } from '@/domain/types';
import { POSITION_LABEL_FR } from '@/domain/types';

/** Coordonnées (en %) de chaque poste sur un terrain vertical, attaque vers le haut. */
const SPOT: Record<DetailedPosition, [number, number]> = {
  GK: [50, 91], LB: [16, 70], CB: [50, 74], RB: [84, 70], LWB: [12, 56], RWB: [88, 56],
  DM: [50, 60], CM: [50, 47], AM: [50, 33], LW: [17, 24], RW: [83, 24], ST: [50, 13],
};

/** Postes occupés récemment : le plus fréquent en plein, les autres en creux. */
export function MiniPitch({ positions }: { positions: { position: DetailedPosition; count: number }[] }) {
  if (!positions.length) return null;
  const sorted = [...positions].sort((a, b) => b.count - a.count);
  const label = `Postes occupés récemment : ${sorted.map((p) => `${POSITION_LABEL_FR[p.position]} × ${p.count}`).join(', ')}`;
  return (
    <svg className="mini-pitch" viewBox="0 0 100 130" role="img" aria-label={label}>
      <rect x="2" y="2" width="96" height="126" rx="6" className="mp-grass" />
      <path d="M30 2 A20 20 0 0 0 70 2" className="mp-line" />
      <rect x="22" y="104" width="56" height="24" className="mp-line" />
      <rect x="36" y="118" width="28" height="10" className="mp-line" />
      <circle cx="50" cy="112" r="0.9" className="mp-dot" />
      {sorted.map((p, i) => {
        const [x, y] = SPOT[p.position];
        return <circle key={p.position} cx={x} cy={y * 1.3} r={i === 0 ? 6 : 5} className={i === 0 ? 'mp-main' : 'mp-other'} />;
      })}
    </svg>
  );
}
