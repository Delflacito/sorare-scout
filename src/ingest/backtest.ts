import type { CompletedFixture, AppearanceRow } from '@/db/repo';
import { projectForFixture } from '@/domain/projection';
import { computeAggregates } from './aggregates';

const ROUND_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Round { cutoff: string; fixtureIds: number[] }

export interface BacktestRow {
  competitionId: number; fixtureId: number; playerId: number; isHome: boolean; started: boolean;
  actual: number; base: number; projected: number; venueFactor: number; opponent: number;
}

/** Dernière journée d'un championnat : matchs joués dans les 4 jours précédant le dernier match ; coupure au premier d'entre eux. */
export function lastRound(fixtures: CompletedFixture[]): Round | null {
  if (!fixtures.length) return null;
  const last = Math.max(...fixtures.map((f) => Date.parse(f.date)));
  const round = fixtures.filter((f) => Date.parse(f.date) >= last - ROUND_DAYS * DAY_MS).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { cutoff: round[0].date, fixtureIds: round.map((f) => f.id) };
}

/** Les N dernières journées d'un championnat, de la plus récente à la plus ancienne. */
export function lastRounds(fixtures: CompletedFixture[], n: number): Round[] {
  const rounds: Round[] = [];
  let remaining = fixtures;
  for (let i = 0; i < n; i++) {
    const r = lastRound(remaining);
    if (!r) break;
    rounds.push(r);
    remaining = remaining.filter((f) => Date.parse(f.date) < Date.parse(r.cutoff));
  }
  return rounds;
}

/** Projette chaque joueur ayant joué la journée, avec les seules données antérieures à la coupure, et compare au score réel. */
export function backtestRound(
  fixtures: CompletedFixture[],
  appearances: AppearanceRow[],
  round: Round,
  amplification?: number,
): BacktestRow[] {
  const cutoff = Date.parse(round.cutoff);
  const history = fixtures.filter((f) => Date.parse(f.date) < cutoff);
  const historyIds = new Set(history.map((f) => f.id));
  const agg = computeAggregates(history, appearances.filter((a) => historyIds.has(a.fixtureId)));

  const summaryOf = new Map(agg.summaries.map((s) => [s.playerId, s]));
  const byPosition = new Map(agg.byPosition.filter((c) => c.window === 5).map((c) => [`${c.teamId}|${c.position}`, c]));
  const leagueAtPosition = new Map(agg.byPosition.filter((c) => c.window === 5).map((c) => [c.position, c.leagueAverage]));
  const overall = new Map(agg.overall.filter((c) => c.window === 10).map((c) => [c.teamId, c]));
  const venues = new Map(agg.venues.map((v) => [v.competitionId, v]));
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const inRound = new Set(round.fixtureIds);

  const rows: BacktestRow[] = [];
  for (const a of appearances) {
    if (!inRound.has(a.fixtureId) || a.minutes <= 0) continue;
    const s = summaryOf.get(a.playerId);
    if (!s || s.base === null || !s.usualPosition) continue; // aucun match joué avant la journée
    const f = fixtureById.get(a.fixtureId)!;
    const isHome = f.homeTeamId === a.teamId;
    const opp = String(isHome ? f.awayTeamId : f.homeTeamId);
    const pos = byPosition.get(`${opp}|${s.usualPosition}`);
    const all = overall.get(opp);
    const venue = venues.get(f.competitionId);
    const { venueFactor, opponent, projected } = projectForFixture(s, {
      isHome,
      leagueVenueFactor: venue ? (isHome ? venue.home : venue.away) : 1,
      position: { average: pos?.average ?? null, leagueAverage: pos?.leagueAverage ?? leagueAtPosition.get(s.usualPosition) ?? null, observations: pos?.observations ?? 0 },
      overall: all ? { index: all.index, observations: all.observations } : null,
    }, amplification);
    rows.push({
      competitionId: f.competitionId, fixtureId: f.id, playerId: a.playerId, isHome, started: a.started,
      actual: a.score, base: s.base, projected: projected!, venueFactor, opponent,
    });
  }
  return rows;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(mean(ys.map((y) => (y - my) ** 2)));
  return sx && sy ? Math.round((cov / (sx * sy)) * 1000) / 1000 : 0;
}

/** Erreur moyenne absolue, biais et corrélation du modèle, comparés au L15 seul ; effet réel selon l'adversaire annoncé. */
export function summarize(rows: BacktestRow[]) {
  const actual = rows.map((r) => r.actual);
  const buckets = [
    { label: 'adversaire difficile (< ×0,9)', test: (r: BacktestRow) => r.opponent < 0.9 },
    { label: 'adversaire moyen (×0,9 à ×1,1)', test: (r: BacktestRow) => r.opponent >= 0.9 && r.opponent <= 1.1 },
    { label: 'adversaire favorable (> ×1,1)', test: (r: BacktestRow) => r.opponent > 1.1 },
  ]
    .map((b) => {
      const sel = rows.filter((r) => b.test(r) && r.base > 0);
      return {
        label: b.label, n: sel.length,
        /** Score réel / L15 : le modèle a raison si c'est < 1 pour « difficile » et > 1 pour « favorable ». */
        actualOverBase: Math.round(mean(sel.map((r) => r.actual / r.base)) * 1000) / 1000,
        projectedOverBase: Math.round(mean(sel.map((r) => r.projected / r.base)) * 1000) / 1000,
      };
    })
    .filter((b) => b.n > 0);
  return {
    n: rows.length,
    maeModel: round1(mean(rows.map((r) => Math.abs(r.projected - r.actual)))),
    maeBase: round1(mean(rows.map((r) => Math.abs(r.base - r.actual)))),
    biasModel: round1(mean(rows.map((r) => r.projected - r.actual))),
    biasBase: round1(mean(rows.map((r) => r.base - r.actual))),
    corrModel: correlation(rows.map((r) => r.projected), actual),
    corrBase: correlation(rows.map((r) => r.base), actual),
    buckets,
  };
}
