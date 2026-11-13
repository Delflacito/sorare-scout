'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; sub?: readonly { href: string; label: string }[] };

export const SECTIONS: readonly Tab[] = [
  { href: '/game-week', label: 'Ma Game Week', sub: [
    { href: '/game-week', label: 'Performance' },
    { href: '/journee', label: 'Journée' },
    { href: '/streak', label: 'Streak' },
  ] },
  { href: '/joueurs', label: 'Joueurs' },
  { href: '/profils', label: 'Profils' },
  { href: '/trading', label: 'Trading' },
  { href: '/marche', label: 'Marché' },
  { href: '/star', label: 'Star' },
  { href: '/effectif', label: 'Delflacito', sub: [
    { href: '/effectif', label: 'Mon effectif' },
    { href: '/otw', label: 'OTW' },
    { href: '/roi', label: 'ROI' },
  ] },
];

const isAt = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
const current = (path: string) => SECTIONS.find((s) => (s.sub ?? [s]).some((t) => isAt(path, t.href)));

/** Onglets principaux du site ; l'onglet de la page courante est mis en avant. */
export function NavTabs() {
  const path = usePathname() ?? '/';
  const cur = current(path);
  return (
    <nav className="site-tabs" aria-label="Sections">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={s === cur ? 'page' : undefined}>{s.label}</Link>
      ))}
    </nav>
  );
}

/** Sous-onglets du groupe courant (Ma Game Week, Delflacito). */
export function SubTabs() {
  const path = usePathname() ?? '/';
  const sub = current(path)?.sub;
  if (!sub) return null;
  return (
    <nav className="tabs sub-tabs" aria-label="Sous-sections">
      {sub.map((t) => <Link key={t.href} href={t.href} aria-current={isAt(path, t.href) ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
