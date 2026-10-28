import { SORARE_COMPETITIONS } from '@/sources/sorare';
import { AF_LEAGUES } from '@/sources/apiFootball';

export interface League {
  key: keyof typeof AF_LEAGUES;
  name: string;
  sorareSlug: string;
  apifootballId: number;
}

export const LEAGUES: League[] = [
  { key: 'ligue1', name: 'Ligue 1', sorareSlug: SORARE_COMPETITIONS.ligue1, apifootballId: AF_LEAGUES.ligue1 },
  { key: 'premierLeague', name: 'Premier League', sorareSlug: SORARE_COMPETITIONS.premierLeague, apifootballId: AF_LEAGUES.premierLeague },
  { key: 'laliga', name: 'LaLiga', sorareSlug: SORARE_COMPETITIONS.laliga, apifootballId: AF_LEAGUES.laliga },
  { key: 'serieA', name: 'Serie A', sorareSlug: SORARE_COMPETITIONS.serieA, apifootballId: AF_LEAGUES.serieA },
  { key: 'bundesliga', name: 'Bundesliga', sorareSlug: SORARE_COMPETITIONS.bundesliga, apifootballId: AF_LEAGUES.bundesliga },
];

/** Saison API-Football en cours (une saison démarrant en juillet porte l'année de départ). */
export function currentSeason(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
