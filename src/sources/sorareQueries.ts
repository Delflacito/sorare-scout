// Requêtes GraphQL Sorare, vérifiées sur l'API réelle (l'introspection est désactivée ; voir docs/spike-results.md).

export const CLUBS_QUERY = `query Clubs($slug: String!) {
  football { competition(slug: $slug) { slug teams(first: 50) { nodes { ... on Club { slug name shortName pictureUrl } } } } }
}`;

const TEAM = '__typename slug name pictureUrl';
const GAME_FIELDS = `id date statusTyped homeGoals awayGoals homeTeam { ${TEAM} } awayTeam { ${TEAM} } competition { slug displayName }`;

export const CLUB_GAMES_QUERY = `query ClubGames($slug: String!) {
  football { club(slug: $slug) {
    latestGames(first: 40) { nodes { ${GAME_FIELDS} } }
    upcomingGames(first: 5) { ${GAME_FIELDS} }
  } }
}`;

/** Matchs d'une sélection nationale (toutes compétitions). */
export const NATIONAL_TEAM_GAMES_QUERY = `query NationalTeamGames($slug: String!) {
  football { nationalTeam(slug: $slug) {
    latestGames(first: 15) { nodes { ${GAME_FIELDS} } }
    upcomingGames(first: 3) { ${GAME_FIELDS} }
  } }
}`;

const LINEUP = 'startingLineup { slug displayName } bench { slug displayName }';

/** football.game attend l'identifiant sans le préfixe « Game: ». */
export const GAME_DETAIL_QUERY = `query GameDetail($id: ID!) {
  football { game(id: $id) {
    homeFormation { ${LINEUP} }
    awayFormation { ${LINEUP} }
    playerGameScores {
      score
      anyPlayer { slug displayName anyPositions }
      anyPlayerGameStats { ... on PlayerGameStats { minsPlayed gameStarted formationPlace } }
      detailedScore { category stat statValue totalScore }
    }
  } }
}`;

/** Joueurs actifs d'un club : statut de jeu, blessures, suspensions, projection Sorare du prochain match, photo. */
export const CLUB_PLAYERS_QUERY = `query ClubPlayers($slug: String!) {
  football { club(slug: $slug) { activePlayers(first: 100) { nodes {
    slug squaredPictureUrl playingStatus position cardPositions
    activeInjuries { kind expectedEndDate }
    activeSuspensions { reason endDate }
    nextClassicFixtureProjectedScore
    activeNationalTeam { slug name pictureUrl }
  } } } }
}`;

/** Statistiques de championnat d'une saison (Sorare ne précise ni le club ni la compétition). */
const SEASON_STATS = 'appearances substituteIn goals assists minutesPlayed yellowCards redCards';

/** Identité et historique par saison de plusieurs joueurs en une requête (un alias par joueur et par saison). */
export function playerProfilesQuery(count: number, seasons: number[]): string {
  const vars = Array.from({ length: count }, (_, i) => `$p${i}: String!`).join(', ');
  const players = Array.from({ length: count }, (_, i) => `p${i}: anyPlayer(slug: $p${i}) { ... on Player {
    slug firstName lastName height shirtNumber pictureUrl birthDate country { code name flagUrl } activeClub { slug name pictureUrl }
    ${seasons.map((y) => `s${y}: stats(seasonStartYear: ${y}) { ${SEASON_STATS} }`).join('\n    ')}
  } }`).join('\n  ');
  return `query PlayerProfiles(${vars}) {\n  ${players}\n}`;
}

const PRICE = 'seasonYear liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents wei } } }';

/** Taux de change Sorare (ETH → EUR / USD) pour convertir les prix affichés en dollars ou en ETH. */
export const EXCHANGE_RATES_QUERY = `query ExchangeRates { config { exchangeRate { rates } } }`;

/** Marché Limited de plusieurs joueurs : prix planchers (saison en cours, toutes saisons) et dernières ventes. */
export function playerMarketsQuery(count: number, sales: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$p${i}: String!`).join(', ');
  const players = Array.from({ length: count }, (_, i) => `p${i}: anyPlayer(slug: $p${i}) { ... on Player {
    slug
    inSeason: lowestPriceAnyCard(rarity: limited, inSeason: true) { ${PRICE} }
    anySeason: lowestPriceAnyCard(rarity: limited, inSeason: false) { ${PRICE} }
    tokenPrices(rarity: limited, last: ${sales}) { nodes { date amounts { eurCents usdCents wei } card { seasonYear } } }
  } }`).join('\n  ');
  return `query PlayerMarkets(${vars}) {\n  ${players}\n}`;
}
