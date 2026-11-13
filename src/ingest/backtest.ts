import type { CompletedFixture, AppearanceRow } from '@/db/repo';
import { computeAggregates, projector } from './aggregates';
import { standings, tierOf, tierSizes } from '@/domain/splits';
import { shrinkTowards } from '@/domain/projection';
import type { DetailedPosition } from '@/domain/types';

const ROUND_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Round { cutoff: string; fixtureIds: number[] }

export interface BacktestRow {
  competitionId: number; fixtureId: number; playerId: number; isHome: boolean; started: boolean;
  actual: number; base: number; projected: number; venueFactor: number; opponent: number;
  /** Réaction du joueur à la tranche de l'adversaire, relative à son poste (1 = comme tout le monde) ; null sans historique. */
  tier?: TierProfile | null;
  /** Tranches (0 = haut) du club du joueur et de l'adversaire au classement de la veille ; nombre de tranches du championnat. */
  teamTier?: number | null; oppTier?: number | null; tierCount?: number;
}

export interface TierProfile { ratio: number; games: number }

/**
 * Profil par tranche à partir de l'historique (classement à la date de coupure) : (moyenne du joueur contre la tranche
 * / sa moyenne) ÷ (même rapport pour son poste habituel dans le championnat). Retire ce que le facteur adversaire compte déjà.
 */
export function tierProfiles(history: CompletedFixture[], apps: AppearanceRow[], usualPosition: Map<number, DetailedPosition | null>) {
  const league = history.filter((f) => (f.scope ?? 'league') === 'league');
  const table = standings(league);
  const fixtureById = new Map(league.map((f) => [f.id, f]));
  const tierAgainst = (competitionId: number, opponentId: number) => {
    const s = table.get(`${competitionId}|${opponentId}`);
    return s ? tierOf(s.rank, s.teams) : null;
  };
  const player = new Map<string, { sum: number; n: number }>();
  const ref = new Map<string, { sum: number; n: number }>();
  const add = (m: Map<string, { sum: number; n: number }>, key: string, x: number) => {
    const a = m.get(key) ?? { sum: 0, n: 0 };
    a.sum += x; a.n++;
    m.set(key, a);
  };
  for (const a of apps) {
    const f = fixtureById.get(a.fixtureId);
    if (!f || a.minutes <= 0) continue;
    const t = tierAgainst(f.competitionId, a.teamId === f.homeTeamId ? f.awayTeamId : f.homeTeamId);
    if (t === null) continue;
    add(player, `${a.playerId}|${f.competitionId}|${t}`, a.score);
    add(player, `${a.playerId}|${f.competitionId}|all`, a.score);
    const pos = usualPosition.get(a.playerId);
    if (pos) { add(ref, `${f.competitionId}|${pos}|${t}`, a.score); add(ref, `${f.competitionId}|${pos}|all`, a.score); }
  }
  const avg = (a?: { sum: number; n: number }) => (a?.n ? a.sum / a.n : null);
  return (playerId: number, competitionId: number, opponentId: number): TierProfile | null => {
    const t = tierAgainst(competitionId, opponentId);
    const pos = usualPosition.get(playerId);
    if (t === null || !pos) return null;
    const pt = player.get(`${playerId}|${competitionId}|${t}`);
    const pa = avg(player.get(`${playerId}|${competitionId}|all`));
    const rt = avg(ref.get(`${competitionId}|${pos}|${t}`));
    const ra = avg(ref.get(`${competitionId}|${pos}|all`));
    if (!pt || !pa || !rt || !ra) return null;
    return { ratio: (pt.sum / pt.n / pa) / (rt / ra), games: pt.n };
  };
}

/** Multiplicateur appliqué au score potentiel : rapproché de 1 selon le nombre de matchs (k), plafonné à ±cap. */
export const tierFactor = (p: TierProfile | null, k: number, cap: number) =>
  (p ? Math.min(1 + cap, Math.max(1 - cap, shrinkTowards(p.ratio, 1, p.games, k))) : 1);

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
  const table = standings(history.filter((f) => (f.scope ?? 'league') === 'league'));
  const tierAt = (competitionId: number, teamId: number) => {
    const t = table.get(`${competitionId}|${teamId}`);
    return t ? { tier: tierOf(t.rank, t.teams), count: tierSizes(t.teams).length } : null;
  };
  const tierOfPlayer = tierProfiles(history, appearances.filter((a) => historyIds.has(a.fixtureId)), new Map(agg.summaries.map((s) => [s.playerId, s.usualPosition])));
  const project = projector(agg, amplification);
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  const inRound = new Set(round.fixtureIds);

  const rows: BacktestRow[] = [];
  for (const a of appearances) {
    if (!inRound.has(a.fixtureId) || a.minutes <= 0) continue;
    const s = summaryOf.get(a.playerId);
    if (!s) continue;
    const f = fixtureById.get(a.fixtureId)!;
    const isHome = f.homeTeamId === a.teamId;
    const opponentId = isHome ? f.awayTeamId : f.homeTeamId;
    const p = project(s, { isHome, opponentId, competitionId: f.competitionId, teamId: a.teamId });
    if (!p) continue; // aucun match joué avant la journée
    rows.push({
      competitionId: f.competitionId, fixtureId: f.id, playerId: a.playerId, isHome, started: a.started,
      actual: a.score, base: s.base!, projected: p.projected!, venueFactor: p.venueFactor, opponent: p.opponent,
      tier: tierOfPlayer(a.playerId, f.competitionId, opponentId),
      teamTier: tierAt(f.competitionId, a.teamId)?.tier ?? null,
      oppTier: tierAt(f.competitionId, opponentId)?.tier ?? null,
      tierCount: tierAt(f.competitionId, opponentId)?.count,
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
