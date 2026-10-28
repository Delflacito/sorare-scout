/* eslint-disable @next/next/no-img-element -- images Sorare servies telles quelles (pas d'optimisation Next nécessaire) */

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Photo du joueur (carrée, arrondie) ; initiales si Sorare n'en fournit pas. */
export function PlayerAvatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  if (!url) return <span className="avatar avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
  return <img className="avatar" src={url} alt={name} width={size} height={size} loading="lazy" />;
}

/** Logo du club ; rien si Sorare n'en fournit pas (le nom est toujours écrit à côté). */
export function ClubLogo({ name, url, size = 20 }: { name: string; url: string | null; size?: number }) {
  if (!url) return null;
  return <img className="club-logo" src={url} alt={name} width={size} height={size} loading="lazy" />;
}
