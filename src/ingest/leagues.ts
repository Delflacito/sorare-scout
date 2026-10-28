import { SORARE_COMPETITIONS } from '@/sources/sorare';

export interface League {
  key: keyof typeof SORARE_COMPETITIONS;
  name: string;
  sorareSlug: string;
}

export const LEAGUES: League[] = [
  { key: 'ligue1', name: 'Ligue 1', sorareSlug: SORARE_COMPETITIONS.ligue1 },
  { key: 'premierLeague', name: 'Premier League', sorareSlug: SORARE_COMPETITIONS.premierLeague },
  { key: 'laliga', name: 'LaLiga', sorareSlug: SORARE_COMPETITIONS.laliga },
  { key: 'serieA', name: 'Serie A', sorareSlug: SORARE_COMPETITIONS.serieA },
  { key: 'bundesliga', name: 'Bundesliga', sorareSlug: SORARE_COMPETITIONS.bundesliga },
];
