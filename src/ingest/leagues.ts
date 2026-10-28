import { SORARE_COMPETITIONS } from '@/sources/sorare';

export interface League {
  key: keyof typeof SORARE_COMPETITIONS;
  name: string;
  sorareSlug: string;
  /** Championnat prioritaire : ses matchs sont complétés avant les autres. */
  priority?: boolean;
}

/** Les championnats prioritaires d'abord (les plus joués). */
export const LEAGUES: League[] = [
  { key: 'eredivisie', name: 'Eredivisie', sorareSlug: SORARE_COMPETITIONS.eredivisie, priority: true },
  { key: 'jupilerProLeague', name: 'Jupiler Pro League', sorareSlug: SORARE_COMPETITIONS.jupilerProLeague, priority: true },
  { key: 'primeiraLiga', name: 'Primeira Liga', sorareSlug: SORARE_COMPETITIONS.primeiraLiga, priority: true },
  { key: 'ligue1', name: 'Ligue 1', sorareSlug: SORARE_COMPETITIONS.ligue1 },
  { key: 'premierLeague', name: 'Premier League', sorareSlug: SORARE_COMPETITIONS.premierLeague },
  { key: 'laliga', name: 'LaLiga', sorareSlug: SORARE_COMPETITIONS.laliga },
  { key: 'serieA', name: 'Serie A', sorareSlug: SORARE_COMPETITIONS.serieA },
  { key: 'bundesliga', name: 'Bundesliga', sorareSlug: SORARE_COMPETITIONS.bundesliga },
];

/** Début de la saison en cours : 1er août (UTC). Les matchs antérieurs ne sont pas importés. */
export function seasonStart(now = new Date()): string {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 7, 1)).toISOString();
}
