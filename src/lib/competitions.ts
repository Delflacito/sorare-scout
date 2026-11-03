/** Les championnats Contender de Sorare, réunis partout sur le site sous un seul nom. */
export const CONTENDER = 'contender';
export const CONTENDER_NAME = 'Contender';
export const CONTENDER_SLUGS = ['austrian-bundesliga', '2-bundesliga', 'ligue-2-fr', 'segunda-division-es', '1-hnl'];

/** Championnat tel que montré sur le site : « contender » pour un championnat Contender, sinon son slug Sorare. */
export const competitionGroup = (slug: string) => (CONTENDER_SLUGS.includes(slug) ? CONTENDER : slug);

/** Slugs Sorare couverts par un championnat du site (les 5 championnats Contender pour « contender »). */
export const slugsOf = (competition: string) => (competition === CONTENDER ? CONTENDER_SLUGS : [competition]);

/** Liste de championnats avec les Contender remplacés par une seule entrée, triée par nom. */
export function groupCompetitions(list: { slug: string; name: string }[]): { slug: string; name: string }[] {
  const others = list.filter((c) => !CONTENDER_SLUGS.includes(c.slug));
  const grouped = others.length < list.length ? [...others, { slug: CONTENDER, name: CONTENDER_NAME }] : others;
  return grouped.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
