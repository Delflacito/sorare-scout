/** Actions décisives Sorare (statistiques du détail de score) : icône, libellé et sens. */
export interface ActionInfo { icon: string; singular: string; plural: string; positive: boolean }

export const ACTIONS: Record<string, ActionInfo> = {
  goals: { icon: '⚽', singular: 'but', plural: 'buts', positive: true },
  goal_assist: { icon: '🎯', singular: 'passe décisive', plural: 'passes décisives', positive: true },
  assist_penalty_won: { icon: '🎯', singular: 'penalty obtenu', plural: 'penalties obtenus', positive: true },
  penalty_save: { icon: '🧤', singular: 'penalty arrêté', plural: 'penalties arrêtés', positive: true },
  clean_sheet_60: { icon: '🧤', singular: 'clean sheet', plural: 'clean sheets', positive: true },
  clearance_off_line: { icon: '🛡️', singular: 'sauvetage sur la ligne', plural: 'sauvetages sur la ligne', positive: true },
  last_man_tackle: { icon: '🛡️', singular: 'tacle du dernier défenseur', plural: 'tacles du dernier défenseur', positive: true },
  red_card: { icon: '🟥', singular: 'carton rouge', plural: 'cartons rouges', positive: false },
  own_goals: { icon: '⚠️', singular: 'but contre son camp', plural: 'buts contre son camp', positive: false },
  error_lead_to_goal: { icon: '⚠️', singular: 'erreur menant à un but', plural: 'erreurs menant à un but', positive: false },
  penalty_conceded: { icon: '⚠️', singular: 'penalty concédé', plural: 'penalties concédés', positive: false },
};

const ORDER = Object.keys(ACTIONS);

export interface ActionItem extends ActionInfo { stat: string; count: number }

/** Actions connues d'un match, dans un ordre stable (buts d'abord). */
export function actionItems(actions: Record<string, number> | null | undefined): ActionItem[] {
  return Object.entries(actions ?? {})
    .filter(([stat, n]) => ACTIONS[stat] && n > 0)
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map(([stat, count]) => ({ stat, count, ...ACTIONS[stat] }));
}

/** « 2 buts · 1 passe décisive » */
export function describeActions(actions: Record<string, number> | null | undefined): string {
  return actionItems(actions).map((a) => `${a.count} ${a.count > 1 ? a.plural : a.singular}`).join(' · ');
}
