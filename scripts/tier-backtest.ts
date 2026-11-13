// Test sur le passé : le profil du joueur par tranche d'adversaire (classement à la date de la journée) rapproche-t-il
// le score potentiel du score réel ? Compare le score potentiel actuel et des variantes ajustées, par championnat.
// Lancé par le workflow « Backtest » ; écrit backtest-output/tier.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { getSql } from '@/db/client';
import { createRepo } from '@/db/repo';
import { backtestRound, lastRounds, summarize, tierFactor, type BacktestRow } from '@/ingest/backtest';
import { CONTENDER_SLUGS } from '@/lib/competitions';

config({ path: '.env.local', quiet: true });

const sql = getSql();
const { fixtures, appearances } = await createRepo(sql).aggregateInputs();
const competitions = await sql`select id, slug from competitions where is_league`;
const GROUPS: [string, string[]][] = [
  ['Belgique', ['jupiler-pro-league']], ['Pays-Bas', ['eredivisie']], ['Portugal', ['primeira-liga-pt']], ['Contender', CONTENDER_SLUGS],
];
// [libellé, k (matchs pour peser autant que la moyenne), plafond]
const VARIANTS: [string, number, number][] = [['k 4 · ±10 %', 4, 0.1], ['k 8 · ±10 %', 8, 0.1], ['k 16 · ±10 %', 16, 0.1], ['k 8 · ±20 %', 8, 0.2]];

const adjusted = (r: BacktestRow, k: number, cap: number) => ({ ...r, projected: Math.min(100, Math.max(0, r.projected * tierFactor(r.tier ?? null, k, cap))) });

function table(rows: BacktestRow[]): string[] {
  const base = summarize(rows);
  const lines = [
    '| Version | Erreur moyenne | Biais | Corrélation | Plus proche que l’actuel | Joueurs modifiés |',
    '|---|---|---|---|---|---|',
    `| Score potentiel actuel | ${base.maeModel} | ${base.biasModel} | ${base.corrModel} | — | — |`,
  ];
  for (const [label, k, cap] of VARIANTS) {
    const adj = rows.map((r) => adjusted(r, k, cap));
    const s = summarize(adj);
    const changed = adj.map((a, i) => [a, rows[i]] as const).filter(([a, r]) => Math.abs(a.projected - r.projected) >= 0.5);
    const closer = changed.filter(([a, r]) => Math.abs(a.projected - a.actual) < Math.abs(r.projected - r.actual)).length;
    lines.push(`| ${label} | ${s.maeModel} | ${s.biasModel} | ${s.corrModel} | ${changed.length ? `${closer}/${changed.length} (${Math.round((closer / changed.length) * 100)} %)` : '—'} | ${changed.length} |`);
  }
  return lines;
}

const md = [
  '# Profil par tranche d’adversaire dans le score potentiel — test sur le passé',
  '',
  'Pour chaque journée, tout est recalculé avec les seules données antérieures (classement compris). Titulaires ayant joué.',
  'Facteur = (moyenne du joueur contre la tranche de l’adversaire / sa moyenne) ÷ (même rapport pour son poste dans le championnat),',
  'rapproché de 1 selon le nombre de matchs contre cette tranche (k), plafonné. « Plus proche » : parmi les joueurs dont le score',
  'potentiel bouge d’au moins 0,5 point, part où l’ajusté est plus près du score réel.',
  '',
];
const all: Record<string, BacktestRow[]> = { last: [], five: [] };
for (const [name, slugs] of GROUPS) {
  const ids = competitions.filter((c) => slugs.includes(c.slug)).map((c) => c.id as number);
  for (const [key, n, title] of [['last', 1, 'dernière journée'], ['five', 5, '5 dernières journées']] as const) {
    const rows = ids.flatMap((id) => lastRounds(fixtures.filter((f) => f.competitionId === id), n)
      .flatMap((r) => backtestRound(fixtures, appearances, r))).filter((r) => r.started);
    all[key].push(...rows);
    md.push(`## ${name} — ${title} (${rows.length} titulaires)`, '', ...table(rows), '');
  }
}
md.push('## Les quatre ensemble — dernière journée', '', ...table(all.last), '', '## Les quatre ensemble — 5 dernières journées', '', ...table(all.five), '');

mkdirSync('backtest-output', { recursive: true });
writeFileSync('backtest-output/tier.md', md.join('\n'));
console.log(md.join('\n'));
await sql.end();
