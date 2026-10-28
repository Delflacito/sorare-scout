// Réglage du score potentiel sur le passé : essaie toutes les combinaisons de parameterGrid() sur les journées 3 à 8
// (en partant de la plus récente), puis vérifie les meilleures sur les 2 dernières journées, jamais vues pendant le réglage.
// Lancé par le workflow « Backtest » ; écrit backtest-output/tuning.md et tuning.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { lastRounds } from '@/ingest/backtest';
import { buildRoundRows, evaluate, parameterGrid, type TuningRow } from '@/ingest/tuning';
import { DEFAULT_PARAMS, type ModelParams, type PlayerFeatures } from '@/domain/model';

config({ path: '.env.local', quiet: true });

const ROUNDS = 8;
const VALIDATION_ROUNDS = 2;

const sql = getSql();
const { fixtures, appearances } = await createRepo(sql).aggregateInputs();
const competitions = await sql`select id from competitions`;
await sql.end();

const train: TuningRow[] = [];
const validation: TuningRow[] = [];
for (const c of competitions) {
  const rounds = lastRounds(fixtures.filter((f) => f.competitionId === c.id), ROUNDS);
  rounds.forEach((r, i) => (i < VALIDATION_ROUNDS ? validation : train).push(...buildRoundRows(fixtures, appearances, r).filter((x) => x.started)));
}

const l15 = (f: PlayerFeatures) => {
  const h = f.history.slice(0, 15);
  return h.length ? h.reduce((s, g) => s + g.score, 0) / h.length : null;
};
const describe = (p: ModelParams) =>
  `${p.model} · L${p.baseGames} · k=${p.shrinkK} · poste ${Math.round(p.positionWeight * 100)} % · adv ×${p.amplification} · fenêtres ${p.positionWindow}/${p.overallWindow}` +
  (p.model === 'split+match' ? ` · décisif ×${p.decisiveAmp}` : '');

const scored = parameterGrid().map((p) => ({ params: p, train: evaluate(train, p) })).sort((a, b) => b.train.corr - a.train.corr);
const withValidation = (p: ModelParams) => ({ params: p, label: describe(p), train: evaluate(train, p), validation: evaluate(validation, p) });
const top = scored.slice(0, 10).map((s) => withValidation(s.params));
const bestPerModel = (['total', 'split', 'split+match'] as const).map((m) => withValidation(scored.find((s) => s.params.model === m)!.params));
const baselines = [
  { label: 'L15 seul', train: evaluate(train, l15), validation: evaluate(validation, l15) },
  { label: `Réglage actuel (${describe(DEFAULT_PARAMS)})`, train: evaluate(train, DEFAULT_PARAMS), validation: evaluate(validation, DEFAULT_PARAMS) },
];

const line = (label: string, t: ReturnType<typeof evaluate>, v: ReturnType<typeof evaluate>) =>
  `| ${label} | ${t.corr} | ${t.mae} | ${v.corr} | ${v.mae} | ${v.bias} |`;
const header = ['| Réglage | Corr. réglage | Erreur réglage | Corr. vérification | Erreur vérification | Biais vérification |', '|---|---|---|---|---|---|'];
const md = [
  '# Réglage du score potentiel',
  '',
  `Titulaires : ${train.length} pour le réglage (journées 3 à ${ROUNDS}), ${validation.length} pour la vérification (2 dernières journées).`,
  `${scored.length} réglages essayés.`,
  '',
  '## Références', '', ...header, ...baselines.map((b) => line(b.label, b.train, b.validation)),
  '', '## Meilleur réglage de chaque modèle', '', ...header, ...bestPerModel.map((b) => line(b.label, b.train, b.validation)),
  '', '## 10 meilleurs réglages (classés sur le réglage)', '', ...header, ...top.map((b) => line(b.label, b.train, b.validation)),
  '',
].join('\n');

mkdirSync('backtest-output', { recursive: true });
writeFileSync('backtest-output/tuning.md', md);
writeFileSync('backtest-output/tuning.json', JSON.stringify({ baselines, bestPerModel, top }, null, 1));
console.log(md);
