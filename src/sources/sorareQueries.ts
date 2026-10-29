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

/**
 * Identité et historique par saison de plusieurs joueurs en une requête (champ racine `players`, Sorare refusant
 * plusieurs `anyPlayer` dans une même requête).
 */
export function playerProfilesQuery(seasons: number[]): string {
  return `query PlayerProfiles($slugs: [String!]!) {
  players(slugs: $slugs) { ... on Player {
    slug firstName lastName height shirtNumber pictureUrl birthDate country { code name flagUrl } activeClub { slug name pictureUrl }
    ${seasons.map((y) => `s${y}: stats(seasonStartYear: ${y}) { ${SEASON_STATS} }`).join('\n    ')}
  } }
}`;
}

const PRICE = 'seasonYear liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents gbpCents wei } } }';

/** Taux de change Sorare (ETH → EUR / USD) pour convertir les prix affichés en dollars ou en ETH. */
export const EXCHANGE_RATES_QUERY = `query ExchangeRates { config { exchangeRate { rates } } }`;

/** Prix planchers Limited de plusieurs joueurs (saison en cours, toutes saisons). */
export const PLAYER_FLOORS_QUERY = `query PlayerFloors($slugs: [String!]!) {
  players(slugs: $slugs) { ... on Player {
    slug
    inSeason: lowestPriceAnyCard(rarity: limited, inSeason: true) { ${PRICE} }
    anySeason: lowestPriceAnyCard(rarity: limited, inSeason: false) { ${PRICE} }
  } }
}`;

/**
 * Offres en cours d'un joueur, toutes raretés et saisons confondues (Sorare ne les filtre pas) : secours quand
 * lowestPriceAnyCard renvoie une carte dont l'offre vient de disparaître.
 * shortcut: 50 premières offres seulement, la moins chère peut manquer au-delà ; à paginer si des planchers restent vides.
 */
export const PLAYER_OFFERS_QUERY = `query PlayerOffers($slug: String!) {
  tokens { liveSingleSaleOffers(playerSlug: $slug, first: 50) { nodes {
    receiverSide { amounts { eurCents usdCents gbpCents wei } } senderSide { anyCards { seasonYear rarityTyped } }
  } } }
}`;

/** Dernières ventes Limited d'un joueur (Sorare n'accepte pas ce champ dans une liste de joueurs). */
export const PLAYER_SALES_QUERY = `query PlayerSales($slug: String!, $last: Int!) {
  anyPlayer(slug: $slug) { ... on Player {
    tokenPrices(rarity: limited, last: $last) { nodes { date amounts { eurCents usdCents gbpCents wei } card { seasonYear } deal { __typename } } }
  } }
}`;

/**
 * Cartes Limited d'un utilisateur (galerie publique), par pages ; dernier propriétaire = l'utilisateur, avec son prix d'achat.
 * Complexité ≈ 54 par carte : sans clé API, Sorare plafonne à 500 (8 cartes par page), avec clé à 30 000.
 */
export const USER_CARDS_QUERY = `query UserCards($slug: String!, $after: String, $first: Int!) {
  user(slug: $slug) { cards(rarities: [limited], first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { seasonYear anyPlayer { slug } ownershipHistory { amounts { eurCents usdCents gbpCents wei } } }
  } }
}`;
