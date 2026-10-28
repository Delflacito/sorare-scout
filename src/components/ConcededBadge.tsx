import type { ConcededView } from '@/db/queries';
import { POSITION_LABEL_FR } from '@/domain/types';
import { fmtIndex, fmtScore, indexClass } from '@/lib/format';

/** Score moyen concédé par une équipe à un poste, comparé à la moyenne de la ligue. */
export function ConcededBadge({ conceded }: { conceded: ConcededView | null }) {
  if (!conceded || conceded.average === null) return <span className="badge">Pas encore de données</span>;
  const cls = `badge ${indexClass(conceded.index)} ${conceded.lowSample ? 'low-sample' : ''}`;
  return (
    <span className={cls} data-testid="conceded-badge">
      Concède <strong>{fmtScore(conceded.average)}</strong> aux {POSITION_LABEL_FR[conceded.position]}
      {conceded.leagueAverage !== null && <> · moyenne ligue {fmtScore(conceded.leagueAverage)}</>}
      {conceded.index !== null && <> · indice {fmtIndex(conceded.index)}</>}
      {conceded.lowSample && <> · échantillon faible ({conceded.observations} obs.)</>}
    </span>
  );
}
