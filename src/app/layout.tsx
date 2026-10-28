import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Sorare Scout', description: 'Analyse des joueurs Sorare Football' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
