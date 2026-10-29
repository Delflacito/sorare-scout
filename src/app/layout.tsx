import type { ReactNode } from 'react';
import Link from 'next/link';
import { DataFooter } from '@/components/DataFooter';
import { NavTabs } from '@/components/NavTabs';
import './globals.css';

export const metadata = { title: 'Sorare Scout', description: 'Analyse des joueurs Sorare Football' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a href="#contenu" className="skip-link">Aller au contenu</a>
        <header className="site">
          <Link href="/" className="brand">Sorare Scout</Link>
          <NavTabs />
        </header>
        <div id="contenu" tabIndex={-1}>{children}</div>
        <DataFooter />
      </body>
    </html>
  );
}
