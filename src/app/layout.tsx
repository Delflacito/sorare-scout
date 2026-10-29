import type { ReactNode } from 'react';
import Link from 'next/link';
import { DataFooter } from '@/components/DataFooter';
import './globals.css';

export const metadata = { title: 'Sorare Scout', description: 'Analyse des joueurs Sorare Football' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="site">
          <Link href="/joueurs" className="brand">Sorare Scout</Link>
          <nav>
            <Link href="/game-week">Ma Game Week</Link>{' · '}
            <Link href="/journee">Journée</Link>{' · '}
            <Link href="/joueurs">Joueurs</Link>{' · '}
            <Link href="/trading">Trading</Link>{' · '}
            <Link href="/admin/imports">Imports</Link>
          </nav>
        </header>
        {children}
        <DataFooter />
      </body>
    </html>
  );
}
