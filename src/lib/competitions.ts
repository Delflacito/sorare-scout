/** Les championnats Contender de Sorare, réunis partout sur le site sous un seul nom. */
export const CONTENDER = 'contender';
export const CONTENDER_NAME = 'Contender';
export const CONTENDER_SLUGS = ['austrian-bundesliga', '2-bundesliga', 'ligue-2-fr', 'segunda-division-es', '1-hnl'];

/** Les 4 grands championnats (Ligue 1, Bundesliga, LaLiga, Premier League), filtre commun de la Game Week. */
export const BIG4 = 'big4';
export const BIG4_NAME = 'Big 4';
export const BIG4_SLUGS = ['ligue-1-fr', 'bundesliga-de', 'laliga-es', 'premier-league-gb-eng'];

/** Championnat tel que montré sur le site : « contender » pour un championnat Contender, sinon son slug Sorare. */
export const competitionGroup = (slug: string) => (CONTENDER_SLUGS.includes(slug) ? CONTENDER : slug);

/** Slugs Sorare couverts par un championnat du site (les 5 championnats Contender pour « contender », les 4 grands pour « big4 »). */
export const slugsOf = (competition: string) => (competition === CONTENDER ? CONTENDER_SLUGS : competition === BIG4 ? BIG4_SLUGS : [competition]);

/** Liste de championnats avec les Contender remplacés par une seule entrée, triée par nom. */
export function groupCompetitions(list: { slug: string; name: string }[]): { slug: string; name: string }[] {
  const others = list.filter((c) => !CONTENDER_SLUGS.includes(c.slug));
  const grouped = others.length < list.length ? [...others, { slug: CONTENDER, name: CONTENDER_NAME }] : others;
  return grouped.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
