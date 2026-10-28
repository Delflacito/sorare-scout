// Requêtes GraphQL Sorare. Écrites d'après la connaissance du schéma public, à confirmer avec `node scripts/spike.mjs`
// (voir docs/spike-results.md). Toute correction de schéma se fait ici et dans le mapping de sorare.ts.

export const CLUBS_QUERY = `query Clubs($slug: String!) {
  football { competition(slug: $slug) { slug clubs(first: 50) { nodes { slug name } } } }
}`;

export const CLUB_GAMES_QUERY = `query ClubGames($slug: String!) {
  football { club(slug: $slug) {
    slug
    latestGames(first: 40) { id date status homeGoals awayGoals homeTeam { slug name } awayTeam { slug name } }
    upcomingGames(first: 5) { id date status homeGoals awayGoals homeTeam { slug name } awayTeam { slug name } }
  } }
}`;

export const GAME_SCORES_QUERY = `query GameScores($id: ID!) {
  football { game(id: $id) {
    id
    playerGameScores {
      score
      decisiveScore { totalScore }
      allAroundStats { totalScore }
      playerGameStats { minsPlayed team { slug } }
      anyPlayer { slug displayName position }
    }
  } }
}`;
