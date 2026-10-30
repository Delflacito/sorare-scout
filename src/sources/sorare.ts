import type { GenericPosition } from '@/domain/types';
import { fetchWithRetry } from './http';
import { CLUBS_QUERY, CLUB_GAMES_QUERY, CLUB_PLAYERS_QUERY, EXCHANGE_RATES_QUERY, GAME_DETAIL_QUERY, NATIONAL_TEAM_GAMES_QUERY, PLAYER_FLOORS_QUERY, PLAYER_OFFERS_QUERY, PLAYER_SALES_QUERY, USER_CARDS_QUERY, playerProfilesQuery } from './sorareQueries';

export const SORARE_URL = 'https://api.sorare.com/graphql';

/** Slugs Sorare des championnats suivis. */
export const SORARE_COMPETITIONS = {
  eredivisie: 'eredivisie',
  jupilerProLeague: 'jupiler-pro-league',
  primeiraLiga: 'primeira-liga-pt',
  ligue1: 'ligue-1-fr',
  premierLeague: 'premier-league-gb-eng',
  laliga: 'laliga-es',
  serieA: 'serie-a-it',
  bundesliga: 'bundesliga-de',
  mls: 'mlspa',
  championship: 'football-league-championship',
  bundesliga2: '2-bundesliga',
  austrianBundesliga: 'austrian-bundesliga',
  ligue2: 'ligue-2-fr',
  hnl: '1-hnl',
  scottishPremiership: 'premiership-gb-sct',
} as const;

export interface SorareClub { slug: string; name: string; shortName: string | null; pictureUrl: string | null; competitionSlug: string }
/** Statut actuel d'un joueur (STARTER, REGULAR, SUBSTITUTE, NOT_PLAYING…), blessure, suspension, projection Sorare du prochain match. */
export interface SorarePlayerStatus {
  slug: string; pictureUrl: string | null; playingStatus: string | null;
  injury: { kind: string | null; expectedEnd: string | null } | null;
  suspension: { reason: string | null; end: string | null } | null;
  projection: number | null;
  nationalTeam: { slug: string; name: string; pictureUrl: string | null } | null;
  /** Poste principal Sorare et postes où ses cartes peuvent être alignées. */
  position: GenericPosition | null;
  cardPositions: GenericPosition[];
}
interface RawPlayerStatus {
  slug: string; squaredPictureUrl: string | null; playingStatus: string | null;
  position?: GenericPosition | null; cardPositions?: GenericPosition[] | null;
  activeInjuries: { kind: string | null; expectedEndDate: string | null }[] | null;
  activeSuspensions: { reason: string | null; endDate: string | null }[] | null;
  nextClassicFixtureProjectedScore: number | null;
  activeNationalTeam: { slug: string; name: string; pictureUrl: string | null } | null;
}
/** Équipe d'un match : club ou sélection nationale. */
export interface SorareTeam { slug: string; name: string; pictureUrl: string | null; kind: 'club' | 'national' }
export interface SorareGame {
  id: string; date: string; homeClubSlug: string; awayClubSlug: string; competitionSlug: string | null; competitionName: string | null;
  home: SorareTeam; away: SorareTeam;
  homeGoals: number | null; awayGoals: number | null; status: 'played' | 'scheduled' | 'postponed';
}
export interface SorareLineupPlayer { slug: string; displayName: string }
/** Compo d'une équipe : titulaires par ligne (gardien d'abord, chaque ligne de droite à gauche) et remplaçants. */
export interface SorareTeamLineup { starting: SorareLineupPlayer[][]; bench: SorareLineupPlayer[] }
export interface SorarePlayerScore {
  playerSlug: string; displayName: string; position: GenericPosition;
  score: number; decisive: number; allAround: number; minutes: number; started: boolean;
  /** Actions décisives du match (goals, goal_assist, clean_sheet_60, red_card…) et leur nombre. */
  actions: Record<string, number>;
  /** Numéro de placement Opta du titulaire (2 = latéral droit, 3 = gauche…), null s'il est inconnu. */
  formationPlace: number | null;
}
export interface SorareSeasonStats {
  startYear: number; appearances: number; substituteIn: number; goals: number; assists: number;
  minutes: number; yellowCards: number; redCards: number;
}
/** Identité et historique en championnat, saison par saison. */
export interface SorarePlayerProfile {
  slug: string; birthDate: string | null;
  firstName: string | null; lastName: string | null; height: number | null; shirtNumber: number | null;
  /** Photo détourée (en pied) de la carte Sorare. */
  bodyPictureUrl: string | null;
  country: { code: string; name: string; flagUrl: string | null } | null;
  /** Club actuel (peut être hors des championnats suivis). */
  activeClub: { slug: string; name: string; pictureUrl: string | null } | null;
  seasons: SorareSeasonStats[];
}
/** Taux de conversion vers l'euro. */
export interface ExchangeRates { usdToEur: number; gbpToEur: number; weiToEur: number }
/** auction : vente aux enchères (sinon vente d'un manager ou vente primaire de Sorare). */
/** dealType : type de vente selon Sorare (TokenAuction pour une enchère…), null s'il n'est pas renseigné. */
/**
 * Carte Limited d'un utilisateur ; purchaseEur : prix payé, 0 pour une carte craftée, null si reçue autrement (récompense, échange…) ;
 * transferType : mode d'acquisition selon Sorare (SHARDS pour un craft…).
 */
export interface SorareUserCard { playerSlug: string; playerName: string; seasonYear: number | null; purchaseEur: number | null; transferType: string | null }
export interface SorareSale { date: string; eur: number; seasonYear: number | null; auction: boolean; dealType: string | null }
/** Marché Limited d'un joueur (prix en euros). */
export interface SorarePlayerMarket {
  slug: string;
  /** Carte de la saison en cours la moins chère en vente. */
  floorInSeason: number | null;
  /** Carte d'une saison passée (Classic) la moins chère en vente, si c'est la moins chère toutes saisons confondues. */
  floorClassic: number | null;
  sales: SorareSale[];
}
interface RawAmounts { eurCents: number | null; usdCents: number | null; gbpCents?: number | null; wei: string | null }
interface RawPriced { seasonYear: number | null; liveSingleSaleOffer: { receiverSide: { amounts: RawAmounts | null } | null } | null }
interface RawOffer {
  receiverSide: { amounts: RawAmounts | null } | null;
  senderSide: { anyCards: { seasonYear: number | null; rarityTyped: string | null }[] } | null;
}

/** Montant en euros, quelle que soit la devise de référence de l'offre ou de la vente. */
export function toEuros(a: RawAmounts | null | undefined, rates: ExchangeRates): number | null {
  if (!a) return null;
  if (a.eurCents != null) return a.eurCents / 100;
  if (a.usdCents != null) return Math.round(a.usdCents * rates.usdToEur) / 100;
  if (a.gbpCents != null) return Math.round(a.gbpCents * rates.gbpToEur) / 100;
  if (a.wei != null) return Math.round(Number(a.wei) * rates.weiToEur * 100) / 100;
  return null;
}

interface RawSeasonStats {
  appearances: number | null; substituteIn: number | null; goals: number | null; assists: number | null;
  minutesPlayed: number | null; yellowCards: number | null; redCards: number | null;
}
export interface SorareGameDetail { home: SorareTeamLineup; away: SorareTeamLineup; scores: SorarePlayerScore[] }

interface RawGame {
  id: string; date: string; statusTyped: string; homeGoals: number | null; awayGoals: number | null;
  homeTeam: RawTeam; awayTeam: RawTeam; competition: { slug: string; displayName: string | null } | null;
}
interface RawTeam { __typename?: string; slug: string; name?: string | null; pictureUrl?: string | null }
interface RawLineup { startingLineup: SorareLineupPlayer[][] | null; bench: SorareLineupPlayer[] | null }
interface RawScore {
  score: number | null;
  anyPlayer: { slug: string; displayName: string; anyPositions: GenericPosition[] };
  anyPlayerGameStats: { minsPlayed: number | null; gameStarted: number | null; formationPlace: number | null } | null;
  detailedScore: { category: string; stat: string; statValue?: number | null; totalScore: number }[] | null;
}

/** Catégories du détail de score qui ne relèvent pas de l'All-Around (le décisif est porté par level_score). */
const NOT_ALL_AROUND = new Set(['UNKNOWN', 'POSITIVE_DECISIVE_STAT', 'NEGATIVE_DECISIVE_STAT']);
const DECISIVE = new Set(['POSITIVE_DECISIVE_STAT', 'NEGATIVE_DECISIVE_STAT']);

const toLineup = (l: RawLineup | null): SorareTeamLineup => ({ starting: l?.startingLineup ?? [], bench: l?.bench ?? [] });

function toScore(s: RawScore): SorarePlayerScore {
  const details = s.detailedScore ?? [];
  const sum = (xs: typeof details) => Math.round(xs.reduce((a, x) => a + x.totalScore, 0) * 10) / 10;
  return {
    playerSlug: s.anyPlayer.slug,
    displayName: s.anyPlayer.displayName,
    position: s.anyPlayer.anyPositions[0] ?? 'Midfielder',
    score: s.score ?? 0,
    decisive: sum(details.filter((d) => d.stat === 'level_score')),
    allAround: sum(details.filter((d) => !NOT_ALL_AROUND.has(d.category))),
    minutes: s.anyPlayerGameStats?.minsPlayed ?? 0,
    started: s.anyPlayerGameStats?.gameStarted === 1,
    actions: Object.fromEntries(details.filter((d) => DECISIVE.has(d.category) && d.statValue).map((d) => [d.stat, d.statValue!])),
    formationPlace: s.anyPlayerGameStats?.formationPlace || null,
  };
}

function gameStatus(s: string): SorareGame['status'] {
  const v = s.toLowerCase();
  if (v === 'played') return 'played';
  if (v === 'postponed' || v === 'cancelled' || v === 'canceled' || v === 'suspended') return 'postponed';
  return 'scheduled';
}

const toTeam = (t: RawTeam): SorareTeam => ({
  slug: t.slug, name: t.name ?? t.slug, pictureUrl: t.pictureUrl ?? null, kind: t.__typename === 'NationalTeam' ? 'national' : 'club',
});

const toGame = (g: RawGame): SorareGame => ({
  id: g.id, date: g.date, homeClubSlug: g.homeTeam.slug, awayClubSlug: g.awayTeam.slug,
  competitionSlug: g.competition?.slug ?? null, competitionName: g.competition?.displayName ?? null,
  home: toTeam(g.homeTeam), away: toTeam(g.awayTeam),
  homeGoals: g.homeGoals, awayGoals: g.awayGoals, status: gameStatus(g.statusTyped),
});

export function createSorareClient(apiKey: string | undefined, fetchImpl: typeof fetch = fetch) {
  async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchWithRetry(
      SORARE_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { APIKEY: apiKey } : {}) },
        body: JSON.stringify({ query: q, variables }),
      },
      { fetchImpl },
    );
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (!res.ok || json.errors?.length || !json.data) {
      throw new Error(`Sorare GraphQL: ${json.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`}`);
    }
    return json.data;
  }

  return {
    async clubs(competitionSlug: string): Promise<SorareClub[]> {
      const d = await query<{ football: { competition: { teams: { nodes: { slug: string; name: string; shortName: string | null; pictureUrl: string | null }[] } } } }>(
        CLUBS_QUERY, { slug: competitionSlug });
      return d.football.competition.teams.nodes.map((c) => ({
        slug: c.slug, name: c.name, shortName: c.shortName ?? null, pictureUrl: c.pictureUrl ?? null, competitionSlug,
      }));
    },

    async clubPlayers(clubSlug: string): Promise<SorarePlayerStatus[]> {
      const d = await query<{ football: { club: { activePlayers: { nodes: RawPlayerStatus[] } } } }>(CLUB_PLAYERS_QUERY, { slug: clubSlug });
      return d.football.club.activePlayers.nodes.map((p) => {
        const injury = p.activeInjuries?.[0];
        const suspension = p.activeSuspensions?.[0];
        return {
          slug: p.slug, pictureUrl: p.squaredPictureUrl ?? null, playingStatus: p.playingStatus ?? null,
          injury: injury ? { kind: injury.kind ?? null, expectedEnd: injury.expectedEndDate ?? null } : null,
          suspension: suspension ? { reason: suspension.reason ?? null, end: suspension.endDate ?? null } : null,
          projection: p.nextClassicFixtureProjectedScore ?? null,
          nationalTeam: p.activeNationalTeam
            ? { slug: p.activeNationalTeam.slug, name: p.activeNationalTeam.name, pictureUrl: p.activeNationalTeam.pictureUrl ?? null }
            : null,
          position: p.position ?? null,
          cardPositions: p.cardPositions ?? (p.position ? [p.position] : []),
        };
      });
    },

    async clubGames(clubSlug: string): Promise<SorareGame[]> {
      const d = await query<{ football: { club: { latestGames: { nodes: RawGame[] }; upcomingGames: RawGame[] } } }>(
        CLUB_GAMES_QUERY, { slug: clubSlug });
      return [...d.football.club.latestGames.nodes, ...d.football.club.upcomingGames].map(toGame);
    },

    async nationalTeamGames(slug: string): Promise<SorareGame[]> {
      const d = await query<{ football: { nationalTeam: { latestGames: { nodes: RawGame[] }; upcomingGames: RawGame[] } | null } }>(
        NATIONAL_TEAM_GAMES_QUERY, { slug });
      const t = d.football.nationalTeam;
      return t ? [...t.latestGames.nodes, ...t.upcomingGames].map(toGame) : [];
    },

    /** Identité et statistiques de championnat par saison ; les joueurs introuvables sont ignorés. */
    async playerProfiles(slugs: string[], seasons: number[]): Promise<SorarePlayerProfile[]> {
      if (!slugs.length) return [];
      type Club = { slug: string; name: string; pictureUrl: string | null };
      type Raw = {
        slug: string; birthDate: string | null; firstName?: string | null; lastName?: string | null; height?: number | null;
        shirtNumber?: number | null; pictureUrl?: string | null; country: { code: string; name: string; flagUrl: string | null } | null; activeClub?: Club | null } & Record<string, unknown>;
      const d = await query<{ players: (Raw | null)[] }>(playerProfilesQuery(seasons), { slugs });
      return d.players.filter((p): p is Raw => !!p?.slug).map((p) => ({
        slug: p.slug,
        birthDate: p.birthDate ? p.birthDate.slice(0, 10) : null,
        firstName: p.firstName ?? null, lastName: p.lastName ?? null, height: p.height || null, shirtNumber: p.shirtNumber ?? null,
        bodyPictureUrl: p.pictureUrl ?? null,
        country: p.country ? { code: p.country.code, name: p.country.name, flagUrl: p.country.flagUrl ?? null } : null,
        activeClub: p.activeClub ? { slug: p.activeClub.slug, name: p.activeClub.name, pictureUrl: p.activeClub.pictureUrl ?? null } : null,
        seasons: seasons
          .map((y) => [y, p[`s${y}`] as RawSeasonStats | null] as const)
          .filter(([, st]) => st && (st.appearances ?? 0) > 0)
          .map(([y, st]) => ({
            startYear: y, appearances: st!.appearances ?? 0, substituteIn: st!.substituteIn ?? 0, goals: st!.goals ?? 0,
            assists: st!.assists ?? 0, minutes: st!.minutesPlayed ?? 0, yellowCards: st!.yellowCards ?? 0, redCards: st!.redCards ?? 0,
          })),
      }));
    },

    async exchangeRates(): Promise<ExchangeRates> {
      const d = await query<{ config: { exchangeRate: { rates: { eth: { eur: number; usd: number; gbp: number }; wei: { eur: number } } } } }>(EXCHANGE_RATES_QUERY, {});
      const r = d.config.exchangeRate.rates;
      return { usdToEur: r.eth.eur / r.eth.usd, gbpToEur: r.eth.eur / r.eth.gbp, weiToEur: r.wei.eur };
    },

    /**
     * Prix planchers (par lot) et dernières ventes (une requête par joueur) Limited ;
     * `season` : année de début de la saison en cours.
     */
    async playerMarkets(slugs: string[], rates: ExchangeRates, season: number, sales = 50): Promise<SorarePlayerMarket[]> {
      if (!slugs.length) return [];
      type RawFloors = { slug: string; inSeason: RawPriced | null; anySeason: RawPriced | null };
      type RawSales = { tokenPrices: { nodes: { date: string; amounts: RawAmounts | null; card: { seasonYear: number | null } | null; deal?: { __typename: string } | null }[] } | null };
      const d = await query<{ players: (RawFloors | null)[] }>(PLAYER_FLOORS_QUERY, { slugs });
      const offer = (c: RawPriced | null) => toEuros(c?.liveSingleSaleOffer?.receiverSide?.amounts, rates);
      const result: SorarePlayerMarket[] = [];
      for (const p of d.players.filter((x): x is RawFloors => !!x?.slug)) {
        const s = await query<{ anyPlayer: RawSales | null }>(PLAYER_SALES_QUERY, { slug: p.slug, last: sales });
        let floorInSeason = p.inSeason?.seasonYear === season ? offer(p.inSeason) : null;
        // Plancher vide alors que des cartes sont en vente : la moins chère des offres Limited de la saison.
        if (floorInSeason === null) {
          const o = await query<{ tokens: { liveSingleSaleOffers: { nodes: RawOffer[] } } }>(PLAYER_OFFERS_QUERY, { slug: p.slug });
          const prices = o.tokens.liveSingleSaleOffers.nodes
            .filter((n) => n.senderSide?.anyCards.length === 1 && n.senderSide.anyCards[0].rarityTyped === 'limited' && n.senderSide.anyCards[0].seasonYear === season)
            .map((n) => toEuros(n.receiverSide?.amounts, rates))
            .filter((x): x is number => x !== null && x > 0);
          floorInSeason = prices.length ? Math.min(...prices) : null;
        }
        result.push({
          slug: p.slug,
          floorInSeason,
          floorClassic: p.anySeason && p.anySeason.seasonYear !== season ? offer(p.anySeason) : null,
          sales: (s.anyPlayer?.tokenPrices?.nodes ?? [])
            .map((n) => ({ date: n.date, eur: toEuros(n.amounts, rates), seasonYear: n.card?.seasonYear ?? null, auction: n.deal?.__typename === 'TokenAuction', dealType: n.deal?.__typename ?? null }))
            .filter((x): x is SorareSale => x.eur !== null && x.eur > 0),
        });
      }
      return result;
    },

    /** Cartes Limited de la galerie d'un utilisateur (toutes les pages) ; null si le pseudo n'existe pas. */
    async userCards(userSlug: string, rates: ExchangeRates): Promise<SorareUserCard[] | null> {
      type Page = { user: { cards: { pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: { seasonYear: number | null; anyPlayer: { slug: string; displayName: string } | null; ownershipHistory: { transferType: string | null; amounts: RawAmounts | null }[] }[] } } | null };
      const cards: SorareUserCard[] = [];
      for (let after: string | null = null; ;) {
        const d: Page = await query<Page>(USER_CARDS_QUERY, { slug: userSlug, after, first: apiKey ? 50 : 8 });
        if (!d.user) return null;
        for (const n of d.user.cards.nodes) {
          const last = n.ownershipHistory.at(-1);
          // Carte craftée (avec des fragments) : rien payé.
          const purchaseEur = last?.transferType === 'SHARDS' ? 0 : toEuros(last?.amounts, rates);
          if (n.anyPlayer) {
            cards.push({ playerSlug: n.anyPlayer.slug, playerName: n.anyPlayer.displayName, seasonYear: n.seasonYear, purchaseEur, transferType: last?.transferType ?? null });
          }
        }
        if (!d.user.cards.pageInfo.hasNextPage) return cards;
        after = d.user.cards.pageInfo.endCursor;
      }
    },

    async gameDetail(gameId: string): Promise<SorareGameDetail> {
      const d = await query<{ football: { game: { homeFormation: RawLineup | null; awayFormation: RawLineup | null; playerGameScores: RawScore[] } } }>(
        GAME_DETAIL_QUERY, { id: gameId.replace(/^Game:/, '') });
      const g = d.football.game;
      return { home: toLineup(g.homeFormation), away: toLineup(g.awayFormation), scores: g.playerGameScores.map(toScore) };
    },
  };
}

export type SorareClient = ReturnType<typeof createSorareClient>;
