import { cardLabel, type GenericPosition } from '@/domain/types';

/** Signale qu'une carte Classic du joueur est alignable à un autre poste que sa carte de la saison. */
export function ClassicHint({ positions }: { positions?: GenericPosition[] }) {
  if (!positions?.length) return null;
  const text = `Carte Classic aussi alignable en ${cardLabel(positions)}. Sans effet sur la prédiction : le score Sorare et le potentiel ne dépendent pas de la carte, seulement du poste joué sur le terrain.`;
  return <span className="classic-hint" title={text} aria-label={text}>C · {cardLabel(positions)}</span>;
}
