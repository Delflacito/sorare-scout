'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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

/** Onglets principaux ; un groupe (Ma Game Week, Delflacito) ouvre sa liste de sous-onglets au survol ou au clic. */
export function NavTabs() {
  const path = usePathname() ?? '/';
  const cur = current(path);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.tab-group')) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <nav className="site-tabs" aria-label="Sections">
      {SECTIONS.map((s) => {
        if (!s.sub) return <Link key={s.href} href={s.href} aria-current={s === cur ? 'page' : undefined}>{s.label}</Link>;
        const isOpen = open === s.label;
        return (
          <span key={s.label} className={`tab-group${isOpen ? ' open' : ''}`}>
            <button type="button" aria-expanded={isOpen} aria-current={s === cur ? 'page' : undefined}
              onClick={() => setOpen(isOpen ? null : s.label)}>{s.label} ▾</button>
            <span className="tab-menu">
              {s.sub.map((t) => <Link key={t.href} href={t.href} aria-current={isAt(path, t.href) ? 'page' : undefined}>{t.label}</Link>)}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
