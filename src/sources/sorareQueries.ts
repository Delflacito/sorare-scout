// Requêtes GraphQL Sorare, vérifiées sur l'API réelle (l'introspection est désactivée ; voir docs/spike-results.md).

export const CLUBS_QUERY = `query Clubs($slug: String!) {
  football { competition(slug: $slug) { slug teams(first: 50) { nodes { ... on Club { slug name shortName pictureUrl } } } } }
}`;

const GAME_FIELDS = 'id date statusTyped homeGoals awayGoals homeTeam { slug } awayTeam { slug } competition { slug }';

export const CLUB_GAMES_QUERY = `query ClubGames($slug: String!) {
  football { club(slug: $slug) {
    latestGames(first: 40) { nodes { ${GAME_FIELDS} } }
    upcomingGames(first: 5) { ${GAME_FIELDS} }
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
      detailedScore { category stat totalScore }
    }
  } }
}`;

/** Joueurs actifs d'un club : statut de jeu, blessures, suspensions, projection Sorare du prochain match, photo. */
export const CLUB_PLAYERS_QUERY = `query ClubPlayers($slug: String!) {
  football { club(slug: $slug) { activePlayers(first: 100) { nodes {
    slug squaredPictureUrl playingStatus
    activeInjuries { kind expectedEndDate }
    activeSuspensions { reason endDate }
    nextClassicFixtureProjectedScore
  } } } }
}`;
