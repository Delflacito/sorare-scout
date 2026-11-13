'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SECTIONS = [
  { href: '/', label: 'Accueil' },
  { href: '/game-week', label: 'Ma Game Week' },
  { href: '/journee', label: 'Journée' },
  { href: '/joueurs', label: 'Joueurs' },
  { href: '/profils', label: 'Profils' },
  { href: '/trading', label: 'Trading' },
  { href: '/marche', label: 'Marché' },
  { href: '/effectif', label: 'Mon effectif' },
  { href: '/star', label: 'Star' },
  { href: '/otw', label: 'OTW' },
  { href: '/roi', label: 'ROI' },
  { href: '/streak', label: 'Streak' },
] as const;

/** Onglets principaux du site ; l'onglet de la page courante est mis en avant. */
export function NavTabs() {
  const path = usePathname() ?? '/';
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="site-tabs" aria-label="Sections">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={active(s.href) ? 'page' : undefined}>{s.label}</Link>
      ))}
    </nav>
  );
}
