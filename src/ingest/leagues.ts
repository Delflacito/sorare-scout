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
  // shortcut: la MLS se joue de février à décembre, mais seuls ses matchs depuis le 1er août sont importés (cf. seasonStart) ; suffisant pour L15.
  { key: 'mls', name: 'MLS', sorareSlug: SORARE_COMPETITIONS.mls },
  { key: 'championship', name: 'Championship', sorareSlug: SORARE_COMPETITIONS.championship },
  { key: 'bundesliga2', name: '2. Bundesliga', sorareSlug: SORARE_COMPETITIONS.bundesliga2 },
  { key: 'austrianBundesliga', name: 'Bundesliga (Autriche)', sorareSlug: SORARE_COMPETITIONS.austrianBundesliga },
  { key: 'ligue2', name: 'Ligue 2', sorareSlug: SORARE_COMPETITIONS.ligue2 },
  { key: 'hnl', name: 'HNL (Croatie)', sorareSlug: SORARE_COMPETITIONS.hnl },
  { key: 'liga2', name: 'Liga 2 (Espagne)', sorareSlug: SORARE_COMPETITIONS.liga2 },
  { key: 'scottishPremiership', name: 'Premiership (Écosse)', sorareSlug: SORARE_COMPETITIONS.scottishPremiership },
];

/** Début de la saison en cours : 1er août (UTC). Les matchs antérieurs ne sont pas importés. */
export function seasonStart(now = new Date()): string {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 7, 1)).toISOString();
}
