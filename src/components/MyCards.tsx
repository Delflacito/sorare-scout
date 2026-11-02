'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PSEUDO_KEY } from './SquadBuilder';

const readPseudo = () => { try { return window.localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { return ''; } };
const withParam = (href: string, pseudo: string) => `${href}${href.includes('?') ? '&' : '?'}cartes=${encodeURIComponent(pseudo)}`;

/**
 * Bascule « Tous les joueurs / Mes cartes » : le pseudo Sorare enregistré dans Mon effectif passe dans l'URL (paramètre cartes),
 * pour que la page serveur ne garde que les cartes possédées. href : la page courante sans ce paramètre.
 */
export function MyCardsToggle({ href, active }: { href: string; active: boolean }) {
  const [pseudo, setPseudo] = useState<string | null>(null);
  useEffect(() => setPseudo(readPseudo()), []);
  if (pseudo === '') return <span className="muted small">Importe ta galerie dans <Link href="/effectif">Mon effectif</Link> pour filtrer sur tes cartes</span>;
  return (
    <nav className="segmented" aria-label="Joueurs">
      <Link href={href} aria-current={active ? undefined : 'page'}>Tous les joueurs</Link>
      <Link href={pseudo ? withParam(href, pseudo) : href} aria-current={active ? 'page' : undefined}>Mes cartes</Link>
    </nav>
  );
}

/** Ajoute le pseudo Sorare enregistré à l'URL s'il manque (pages consacrées à tes cartes) ; rien sinon. */
export function EnsurePseudo({ href, present }: { href: string; present: boolean }) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (present) return;
    const p = readPseudo();
    if (p) router.replace(withParam(href, p)); else setMissing(true);
  }, [href, present, router]);
  return missing ? <p className="empty">Importe d’abord ta galerie dans <Link href="/effectif">Mon effectif</Link> : cette page s’appuie sur tes cartes.</p> : null;
}
