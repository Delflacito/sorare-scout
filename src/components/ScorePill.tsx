import { scoreTier } from '@/lib/format';

/** Score Sorare dans une pastille colorée selon son niveau (rouge → turquoise). */
export function ScorePill({ score, title, size = 'md' }: { score: number | null; title?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (score === null) return <span className={`score-pill empty ${size}`} title={title}>—</span>;
  return <span className={`score-pill ${scoreTier(score)} ${size}`} title={title}>{Math.round(score)}</span>;
}
