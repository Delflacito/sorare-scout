// Banc d'essai du score potentiel : caractéristiques de chaque joueur avant une journée, et évaluation d'un réglage.
import type { CompletedFixture, AppearanceRow } from '@/db/repo';
import type { DetailedPosition } from '@/domain/types';
import { GENERIC_OF } from '@/domain/types';
import { concededOverall, type ConcededObs } from '@/domain/metrics';
import { venueFactors } from '@/domain/projection';
import { predict, type GameRecord, type GoalStats, type ModelParams, type PlayerFeatures, type PositionStats, type Window } from '@/domain/model';
import type { Round } from './backtest';

const WINDOWS: Window[] = [5, 10];
const GOALS_K = 5;
const USUAL_POSITION_SAMPLE = 10;

export interface TuningRow { playerId: number; fixtureId: number; started: boolean; actual: number; features: PlayerFeatures }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const byDateDesc = (a: { date: string }, b: { date: string }) => Date.parse(b.date) - Date.parse(a.date);

interface Obs { opponent: number; fixtureId: number; position: DetailedPosition; total: number; aa: number; decisive: number }

/** Concédé par équipe et par poste (total, All-Around, décisif) sur ses N derniers matchs, avec moyennes de la ligue. */
function positionStats(obs: Obs[], teamFixtures: Map<number, number[]>, window: Window): Map<string, PositionStats> {
  const groups = new Map<string, Obs[]>();
  const league = new Map<DetailedPosition, Obs[]>();
  for (const [team, fixtureIds] of teamFixtures) {
    const inWindow = new Set(fixtureIds.slice(0, window));
    for (const o of obs) {
      if (o.opponent !== team || !inWindow.has(o.fixtureId)) continue;
      const key = `${team}|${o.position}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
      league.set(o.position, [...(league.get(o.position) ?? []), o]);
    }
  }
  const result = new Map<string, PositionStats>();
  for (const [key, xs] of groups) {
    const lg = league.get(key.split('|')[1] as DetailedPosition) ?? [];
    result.set(key, {
      total: mean(xs.map((o) => o.total)), aa: mean(xs.map((o) => o.aa)), decisive: mean(xs.map((o) => o.decisive)), obs: xs.length,
      leagueTotal: mean(lg.map((o) => o.total)), leagueAA: mean(lg.map((o) => o.aa)), leagueDecisive: mean(lg.map((o) => o.decisive)),
    });
  }
  // Poste sans observation pour une équipe : on garde au moins les moyennes de la ligue.
  for (const [position, lg] of league) {
    result.set(`*|${position}`, {
      total: null, aa: null, decisive: null, obs: 0,
      leagueTotal: mean(lg.map((o) => o.total)), leagueAA: mean(lg.map((o) => o.aa)), leagueDecisive: mean(lg.map((o) => o.decisive)),
    });
  }
  return result;
}

/** Caractéristiques de chaque joueur ayant joué la journée, calculées avec les seules données antérieures. */
export function buildRoundRows(fixtures: CompletedFixture[], appearances: AppearanceRow[], round: Round): TuningRow[] {
  const cutoff = Date.parse(round.cutoff);
  const history = fixtures.filter((f) => Date.parse(f.date) < cutoff).sort(byDateDesc);
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const historyIds = new Set(history.map((f) => f.id));
  const pastApps = appearances.filter((a) => historyIds.has(a.fixtureId));

  // Par championnat : concédé par poste et global, avantage du terrain, buts.
  const perCompetition = new Map<number, {
    position: Record<Window, Map<string, PositionStats>>;
    overall: Record<Window, Map<string, { index: number | null; obs: number }>>;
    venue: { home: number; away: number };
    goals: (team: number, opp: number) => GoalStats;
  }>();
  for (const competitionId of new Set(history.map((f) => f.competitionId))) {
    const compFixtures = history.filter((f) => f.competitionId === competitionId);
    const teamFixtures = new Map<number, number[]>();
    for (const f of compFixtures) for (const t of [f.homeTeamId, f.awayTeamId]) teamFixtures.set(t, [...(teamFixtures.get(t) ?? []), f.id]);
    const compIds = new Set(compFixtures.map((f) => f.id));
    const starters = pastApps.filter((a) => compIds.has(a.fixtureId) && a.started);
    const obs: Obs[] = starters
      .filter((a) => a.detailedPosition)
      .map((a) => {
        const f = fixtureById.get(a.fixtureId)!;
        return {
          opponent: a.teamId === f.homeTeamId ? f.awayTeamId : f.homeTeamId, fixtureId: f.id, position: a.detailedPosition!,
          total: a.score, aa: a.allAround, decisive: a.decisive,
        };
      });
    const conceded: ConcededObs[] = obs.map((o) => ({
      opponentTeamId: String(o.opponent), fixtureId: String(o.fixtureId), date: '', position: o.position, score: o.total, started: true,
    }));
    const teamFixturesStr = Object.fromEntries([...teamFixtures].map(([t, ids]) => [String(t), ids.map(String)]));
    const overall = (w: Window) => new Map(concededOverall(conceded, teamFixturesStr, w).map((c) => [c.teamId, { index: c.index, obs: c.observations }]));
    const v = venueFactors(starters.map((a) => ({ home: a.teamId === fixtureById.get(a.fixtureId)!.homeTeamId, score: a.score })));

    // Buts par match : moyenne de la ligue, attaque / défense de chaque équipe (ramenées vers la ligue), effet du lieu.
    const played = compFixtures.filter((f) => f.homeGoals != null && f.awayGoals != null);
    const goalsLeague = mean(played.flatMap((f) => [f.homeGoals!, f.awayGoals!])) ?? 1.4;
    const homeGoals = mean(played.map((f) => f.homeGoals!)) ?? goalsLeague;
    const awayGoals = mean(played.map((f) => f.awayGoals!)) ?? goalsLeague;
    const teamGoals = (team: number) => {
      const games = played.filter((f) => f.homeTeamId === team || f.awayTeamId === team);
      const gf = games.map((f) => (f.homeTeamId === team ? f.homeGoals! : f.awayGoals!));
      const ga = games.map((f) => (f.homeTeamId === team ? f.awayGoals! : f.homeGoals!));
      const shrunk = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) + GOALS_K * goalsLeague) / (xs.length + GOALS_K);
      return { for: shrunk(gf), against: shrunk(ga) };
    };
    perCompetition.set(competitionId, {
      position: { 5: positionStats(obs, teamFixtures, 5), 10: positionStats(obs, teamFixtures, 10) },
      overall: { 5: overall(5), 10: overall(10) },
      venue: { home: v.home, away: v.away },
      goals: (team, opp) => {
        const t = teamGoals(team);
        const o = teamGoals(opp);
        return {
          teamFor: t.for, teamAgainst: t.against, oppFor: o.for, oppAgainst: o.against, league: goalsLeague,
          homeFactor: homeGoals / goalsLeague, awayFactor: awayGoals / goalsLeague,
        };
      },
    });
  }

  // Historique de chaque joueur : matchs joués, du plus récent au plus ancien.
  const historyOf = new Map<number, (GameRecord & { started: boolean; position: DetailedPosition | null })[]>();
  for (const a of [...pastApps].sort((x, y) => byDateDesc(fixtureById.get(x.fixtureId)!, fixtureById.get(y.fixtureId)!))) {
    if (a.minutes <= 0) continue;
    const f = fixtureById.get(a.fixtureId)!;
    historyOf.set(a.playerId, [...(historyOf.get(a.playerId) ?? []), {
      score: a.score, decisive: a.decisive, allAround: a.allAround, home: f.homeTeamId === a.teamId,
      started: a.started, position: a.detailedPosition,
    }]);
  }

  const inRound = new Set(round.fixtureIds);
  const rows: TuningRow[] = [];
  for (const a of appearances) {
    if (!inRound.has(a.fixtureId) || a.minutes <= 0) continue;
    const hist = historyOf.get(a.playerId);
    if (!hist?.length) continue;
    const counts = new Map<DetailedPosition, number>();
    for (const g of hist.filter((x) => x.started && x.position).slice(0, USUAL_POSITION_SAMPLE)) counts.set(g.position!, (counts.get(g.position!) ?? 0) + 1);
    const usual = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    if (!usual) continue;
    const f = fixtureById.get(a.fixtureId)!;
    const comp = perCompetition.get(f.competitionId);
    if (!comp) continue;
    const isHome = f.homeTeamId === a.teamId;
    const opp = isHome ? f.awayTeamId : f.homeTeamId;
    const pick = (w: Window) => comp.position[w].get(`${opp}|${usual}`) ?? comp.position[w].get(`*|${usual}`) ?? null;
    rows.push({
      playerId: a.playerId, fixtureId: a.fixtureId, started: a.started, actual: a.score,
      features: {
        history: hist, defensive: ['Goalkeeper', 'Defender'].includes(GENERIC_OF[usual]), isHome,
        leagueVenue: comp.venue,
        position: { 5: pick(5), 10: pick(10) },
        overall: { 5: comp.overall[5].get(String(opp)) ?? null, 10: comp.overall[10].get(String(opp)) ?? null },
        goals: comp.goals(a.teamId, opp),
      },
    });
  }
  return rows;
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return vx && vy ? cov / Math.sqrt(vx * vy) : 0;
}

/** Corrélation, erreur moyenne absolue et biais d'un réglage (ou d'une fonction de prédiction) sur des lignes. */
export function evaluate(rows: TuningRow[], predictor: ModelParams | ((f: PlayerFeatures) => number | null)) {
  const fn = typeof predictor === 'function' ? predictor : (f: PlayerFeatures) => predict(f, predictor);
  const pairs = rows.map((r) => [fn(r.features), r.actual] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  const preds = pairs.map((x) => x[0]);
  const actual = pairs.map((x) => x[1]);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n: pairs.length,
    corr: r3(correlation(preds, actual)),
    mae: r3(pairs.reduce((s, [p, a]) => s + Math.abs(p - a), 0) / pairs.length),
    bias: r3(pairs.reduce((s, [p, a]) => s + p - a, 0) / pairs.length),
  };
}

/** Toutes les combinaisons de réglages testées. */
export function parameterGrid(): ModelParams[] {
  const grid: ModelParams[] = [];
  for (const model of ['total', 'split', 'split+match'] as const)
    for (const baseGames of [5, 10, 15, 40])
      for (const shrinkK of [3, 5, 10])
        for (const positionWeight of [0.2, 0.4, 0.6])
          for (const amplification of [0.5, 1, 1.5])
            for (const positionWindow of WINDOWS)
              for (const overallWindow of WINDOWS)
                for (const decisiveAmp of model === 'split+match' ? [0.5, 1, 1.5] : [1])
                  grid.push({ model, baseGames, shrinkK, positionWeight, amplification, positionWindow, overallWindow, decisiveAmp });
  return grid;
}
