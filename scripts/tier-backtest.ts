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

const r1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (x: number) => String(r1(x)).replace('.', ',');
const code = (count: number | undefined, t: number) => `${count === 4 ? 'Q' : 'T'}${t + 1}`;
/** Écart moyen, biais (estimé − réel) et nombre de titulaires d'un groupe. */
const cellOf = (rows: BacktestRow[]) => {
  if (!rows.length) return '—';
  const mae = rows.reduce((t, r) => t + Math.abs(r.projected - r.actual), 0) / rows.length;
  const bias = rows.reduce((t, r) => t + r.projected - r.actual, 0) / rows.length;
  return `${fmt(mae)} (${bias >= 0 ? '+' : '−'}${fmt(Math.abs(bias))}) · ${rows.length}`;
};

/** Précision du score potentiel actuel selon la tranche du club, de l'adversaire, et le croisement des deux. */
function byTier(rows: BacktestRow[]): string[] {
  const ok = rows.filter((r) => r.teamTier != null && r.oppTier != null);
  const counts = [...new Set(ok.map((r) => r.tierCount!))].sort();
  return counts.flatMap((count) => {
    const sel = ok.filter((r) => r.tierCount === count);
    const tiers = [...Array(count).keys()];
    return [
      ...(counts.length > 1 ? [`Championnats à ${count} tranches :`, ''] : []),
      '| Tranche | Club du joueur | Adversaire |',
      '|---|---|---|',
      ...tiers.map((t) => `| ${code(count, t)} | ${cellOf(sel.filter((r) => r.teamTier === t))} | ${cellOf(sel.filter((r) => r.oppTier === t))} |`),
      '',
      `| Club ↓ / adversaire → | ${tiers.map((t) => code(count, t)).join(' | ')} |`,
      `|---|${tiers.map(() => '---').join('|')}|`,
      ...tiers.map((t) => `| ${code(count, t)} | ${tiers.map((o) => cellOf(sel.filter((r) => r.teamTier === t && r.oppTier === o))).join(' | ')} |`),
      '',
    ];
  });
}

/** Joueurs regroupés par tranche de leur club : score réel moyen, score potentiel moyen, écart moyen, biais, dispersion. */
function byClub(rows: BacktestRow[]): string[] {
  const ok = rows.filter((r) => r.teamTier != null);
  const counts = [...new Set(ok.map((r) => r.tierCount!))].sort();
  return counts.flatMap((count) => [
    ...(counts.length > 1 ? [`Championnats à ${count} tranches :`, ''] : []),
    '| Club du joueur | Titulaires | Score réel moyen | Score potentiel moyen | Écart moyen | Biais | Dispersion de l’erreur |',
    '|---|---|---|---|---|---|---|',
    ...[...Array(count).keys()].map((t) => {
      const sel = ok.filter((r) => r.tierCount === count && r.teamTier === t);
      if (!sel.length) return `| ${code(count, t)} | 0 | — | — | — | — | — |`;
      const m = (f: (r: BacktestRow) => number) => sel.reduce((a, r) => a + f(r), 0) / sel.length;
      const bias = m((r) => r.projected - r.actual);
      const sd = Math.sqrt(m((r) => (r.projected - r.actual - bias) ** 2));
      return `| ${code(count, t)} | ${sel.length} | ${fmt(m((r) => r.actual))} | ${fmt(m((r) => r.projected))} | ${fmt(m((r) => Math.abs(r.projected - r.actual)))} | ${bias >= 0 ? '+' : '−'}${fmt(Math.abs(bias))} | ${fmt(sd)} |`;
    }),
    '',
  ]);
}

const clubMd = [
  '# Comportement des joueurs selon la tranche de leur club',
  '',
  'Titulaires ayant joué, classement de la veille. Biais : + le score potentiel surestime, − il sous-estime.',
  'Dispersion de l’erreur : écart-type de (score potentiel − score réel) ; plus elle est basse, plus les joueurs de cette tranche sont prévisibles.',
  '',
];

const tierMd = [
  '# Précision du score potentiel selon les tranches du classement — 5 dernières journées',
  '',
  'Score potentiel actuel, titulaires ayant joué, classement de la veille de chaque journée (T1 = haut ; Q pour les quarts).',
  'Chaque case : écart moyen avec le score réel (biais : + le score potentiel surestime, − il sous-estime) · nombre de titulaires.',
  '',
];

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
  for (const [key, n, title] of [['last', 3, '3 dernières journées'], ['five', 5, '5 dernières journées']] as const) {
    const rows = ids.flatMap((id) => lastRounds(fixtures.filter((f) => f.competitionId === id), n)
      .flatMap((r) => backtestRound(fixtures, appearances, r))).filter((r) => r.started);
    all[key].push(...rows);
    clubMd.push(`## ${name} — ${title} (${rows.length} titulaires)`, '', ...byClub(rows));
    if (key === 'five') tierMd.push(`## ${name} (${rows.length} titulaires)`, '', ...byTier(rows));
    md.push(`## ${name} — ${title} (${rows.length} titulaires)`, '', ...table(rows), '');
  }
}
md.push('## Les quatre ensemble — 3 dernières journées', '', ...table(all.last), '', '## Les quatre ensemble — 5 dernières journées', '', ...table(all.five), '');

mkdirSync('backtest-output', { recursive: true });
writeFileSync('backtest-output/tier.md', md.join('\n'));
writeFileSync('backtest-output/club-tier.md', [...clubMd, '## Les quatre ensemble — 3 dernières journées', '', ...byClub(all.last),
  '## Les quatre ensemble — 5 dernières journées', '', ...byClub(all.five)].join('\n'));
writeFileSync('backtest-output/tier-precision.md', [...tierMd, '## Les quatre ensemble', '', ...byTier(all.five)].join('\n'));
console.log(md.join('\n'));
console.log(tierMd.join('\n'));
await sql.end();
