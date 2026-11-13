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

/**
 * Ajoute le pseudo Sorare enregistré à l'URL s'il manque (pages qui s'appuient sur tes cartes) ; sans pseudo, un message,
 * sauf en mode quiet (pages où tes cartes ne sont qu'un complément).
 */
export function EnsurePseudo({ href, present, quiet }: { href: string; present: boolean; quiet?: boolean }) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (present) return;
    const p = readPseudo();
    if (p) router.replace(withParam(href, p)); else setMissing(true);
  }, [href, present, router]);
  return missing && !quiet ? <p className="empty">Importe d’abord ta galerie dans <Link href="/effectif">Mon effectif</Link> : cette page s’appuie sur tes cartes.</p> : null;
}

// Une seule lecture de l'effectif par page, partagée par toutes les coches.
let ownedLoad: Promise<Map<string, number>> | null = null;
export function loadOwned(): Promise<Map<string, number>> {
  const p = readPseudo();
  if (!p) return Promise.resolve(new Map());
  ownedLoad ??= fetch(`/api/effectif/enregistre?user=${encodeURIComponent(p)}`).then((r) => (r.ok ? r.json() : { entries: null }))
    .then((b: { entries: { slug: string; status: string }[] | null }) => {
      const m = new Map<string, number>();
      for (const e of b.entries ?? []) if (e.status === 'owned') m.set(e.slug, (m.get(e.slug) ?? 0) + 1);
      return m;
    }).catch(() => new Map());
  return ownedLoad;
}

/** Coche verte devant un joueur dont j'ai la carte (effectif du pseudo enregistré). */
export function OwnedMark({ slug }: { slug: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => { loadOwned().then((m) => setCount(m.get(slug) ?? 0)); }, [slug]);
  if (!count) return null;
  return <span className="owned-mark" title={`${count} carte${count > 1 ? 's' : ''} possédée${count > 1 ? 's' : ''}`}
    role="img" aria-label="Carte possédée">✓{count > 1 ? `×${count}` : ''}</span>;
}

/** Filtre « Cartes que je n'ai pas » : ajoute le pseudo (paramètre sans) pour écarter les joueurs de mon effectif. */
export function NotOwnedToggle({ href, active }: { href: string; active: boolean }) {
  const [pseudo, setPseudo] = useState<string | null>(null);
  useEffect(() => setPseudo(readPseudo()), []);
  if (!pseudo && !active) return null;
  const on = pseudo ? `${href}${href.includes('?') ? '&' : '?'}sans=${encodeURIComponent(pseudo)}` : href;
  return <Link href={active ? href : on} className="chip" aria-pressed={active}>Cartes que je n’ai pas</Link>;
}
