import type { ReactNode } from 'react';
import Link from 'next/link';
import { DataFooter } from '@/components/DataFooter';
import { NavTabs } from '@/components/NavTabs';
import { PopDismiss } from '@/components/PopDismiss';
import { PlayerSearch } from '@/components/PlayerSearch';
import { TableSort } from '@/components/TableSort';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata = { title: 'Sorare Scout', description: 'Analyse des joueurs Sorare Football' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Thème choisi appliqué avant l'affichage (pas de flash du thème sombre). */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('sorare-scout:theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} />
      </head>
      <body>
        <a href="#contenu" className="skip-link">Aller au contenu</a>
        <header className="site">
          <Link href="/" className="brand">Sorare Scout</Link>
          <NavTabs />
          <PlayerSearch />
          <ThemeToggle />
        </header>
        <div id="contenu" tabIndex={-1}>{children}</div>
        <DataFooter />
        <TableSort />
        <PopDismiss />
      </body>
    </html>
  );
}
