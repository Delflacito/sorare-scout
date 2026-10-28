// Test sur le passé : la formule du score potentiel aurait-elle bien prédit les dernières journées de chaque championnat ?
// Compare plusieurs amplifications de l'effet adversaire (0 = L15 × lieu seulement).
// Lancé par le workflow « Backtest » ; écrit backtest-output/backtest.md et backtest.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { backtestRound, lastRounds, summarize, type BacktestRow } from '@/ingest/backtest';
import { OPPONENT_AMPLIFICATION } from '@/domain/projection';

config({ path: '.env.local', quiet: true });

const sql = getSql();
const { fixtures, appearances } = await createRepo(sql).aggregateInputs();
const competitions = await sql`select id, name from competitions order by name`;
const players = new Map((await sql`select id, name from players`).map((p) => [p.id as number, p.name as string]));
const teams = new Map((await sql`select id, name from teams`).map((t) => [t.id as number, t.name as string]));

const ROUNDS = 5;
const AMPLIFICATIONS = [0, 0.5, 1, 2];
const roundsByCompetition = competitions.map((c) => ({
  name: c.name as string,
  rounds: lastRounds(fixtures.filter((f) => f.competitionId === c.id), ROUNDS),
}));
const run = (amplification: number) =>
  roundsByCompetition.flatMap((c) => c.rounds.flatMap((r) => backtestRound(fixtures, appearances, r, amplification)));

const comparison = AMPLIFICATIONS.map((a) => ({ amplification: a, ...summarize(run(a).filter((r) => r.started)) }));
const all = run(OPPONENT_AMPLIFICATION);
const starters = all.filter((r) => r.started);
const perCompetition = Object.fromEntries(
  roundsByCompetition.map((c) => {
    const ids = new Set(c.rounds.flatMap((r) => r.fixtureIds));
    return [c.name, { journées: c.rounds.length, ...summarize(starters.filter((r) => ids.has(r.fixtureId))) }];
  }),
);
const summary = { comparaison: comparison, titulaires: summarize(starters), parChampionnat: perCompetition };

const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
const describe = (r: BacktestRow) => {
  const f = fixtureById.get(r.fixtureId)!;
  return `${players.get(r.playerId)} (${teams.get(f.homeTeamId)} – ${teams.get(f.awayTeamId)}) : projeté ${r.projected}, réel ${r.actual}, L15 ${r.base.toFixed(1)}, adv ×${r.opponent.toFixed(2)}, lieu ×${r.venueFactor.toFixed(2)}`;
};
const bySurprise = [...starters].sort((a, b) => Math.abs(b.projected - b.actual) - Math.abs(a.projected - a.actual));

const s = summary.titulaires;
const md = [
  `# Test sur le passé — ${ROUNDS} dernières journées de chaque championnat`,
  '',
  `Titulaires ayant joué : ${s.n}. Projection calculée avec les seules données antérieures à chaque journée.`,
  '',
  '## Réglage de l’effet adversaire',
  '',
  '| Amplification | Erreur moyenne | Biais | Corrélation |',
  '|---|---|---|---|',
  `| L15 seul | ${comparison[0].maeBase} | ${comparison[0].biasBase} | ${comparison[0].corrBase} |`,
  ...comparison.map((c) => `| ×${c.amplification} (avec lieu) | ${c.maeModel} | ${c.biasModel} | ${c.corrModel} |`),
  '',
  `## Détail avec le réglage actuel (×${OPPONENT_AMPLIFICATION})`,
  '',
  '| | Modèle (score potentiel) | L15 seul |',
  '|---|---|---|',
  `| Erreur moyenne (points) | ${s.maeModel} | ${s.maeBase} |`,
  `| Biais moyen (projeté − réel) | ${s.biasModel} | ${s.biasBase} |`,
  `| Corrélation avec le réel | ${s.corrModel} | ${s.corrBase} |`,
  '',
  '## Le sens de l’effet adversaire est-il le bon ?',
  '',
  '| Adversaire annoncé | Joueurs | Projeté / L15 | Réel / L15 |',
  '|---|---|---|---|',
  ...s.buckets.map((b) => `| ${b.label} | ${b.n} | ${b.projectedOverBase} | ${b.actualOverBase} |`),
  '',
  '## Par championnat (titulaires)',
  '',
  '| Championnat | Journées | Joueurs | Erreur modèle | Erreur L15 | Biais modèle | Corr. modèle | Corr. L15 |',
  '|---|---|---|---|---|---|---|---|',
  ...Object.entries(perCompetition).map(([name, x]) =>
    `| ${name} | ${x.journées} | ${x.n} | ${x.maeModel} | ${x.maeBase} | ${x.biasModel} | ${x.corrModel} | ${x.corrBase} |`),
  '',
  '## Plus gros écarts (titulaires)',
  '',
  ...bySurprise.slice(0, 15).map((r) => `- ${describe(r)}`),
  '',
].join('\n');

mkdirSync('backtest-output', { recursive: true });
writeFileSync('backtest-output/backtest.md', md);
writeFileSync('backtest-output/backtest.json', JSON.stringify({ summary, rows: all }, null, 1));
console.log(md);
await sql.end();
