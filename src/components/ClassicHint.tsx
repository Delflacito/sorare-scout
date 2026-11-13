import { cardLabel, type GenericPosition } from '@/domain/types';

/** Signale qu'une carte Classic du joueur est alignable à un autre poste que sa carte de la saison. */
export function ClassicHint({ positions }: { positions?: GenericPosition[] }) {
  if (!positions?.length) return null;
  const text = `Carte Classic aussi alignable en ${cardLabel(positions)}. Sans effet sur la prédiction : le score Sorare et le potentiel ne dépendent pas de la carte, seulement du poste joué sur le terrain.`;
  return <span className="classic-hint" title={text} aria-label={text}>C · {cardLabel(positions)}</span>;
}

/** Pas de carte de la saison : « IS » barré s'il reste des Classic, rond barré rouge s'il n'existe aucune carte Limited. */
export function CardStatusIcon({ status }: { status?: 'in_season' | 'classic' | 'none' | null }) {
  if (status === 'classic') {
    const text = 'Pas de carte de la saison (in-season) : seulement des cartes Classic';
    return <span className="card-status is-off" title={text} aria-label={text}>IS</span>;
  }
  if (status !== 'none') return null;
  const text = 'Attention : aucune carte Limited de ce joueur (ni de la saison, ni Classic)';
  return (
    <span className="card-status no-card" title={text} aria-label={text} role="img">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  );
}
