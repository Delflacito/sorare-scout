import { fmtScore, scoreTier } from '@/lib/format';

/** Score Sorare dans une pastille colorée selon son niveau (rouge → turquoise) ; precise : une décimale. */
export function ScorePill({ score, title, size = 'md', precise = false }: {
  score: number | null; title?: string; size?: 'sm' | 'md' | 'lg'; precise?: boolean;
}) {
  if (score === null) return <span className={`score-pill empty ${size}`} title={title}>—</span>;
  return <span className={`score-pill ${scoreTier(score)} ${size}`} title={title}>{precise ? fmtScore(score) : Math.round(score)}</span>;
}
