/** Carte possédée vue avant la Game Week : statut, titularisations et prochain match du club. */
export interface OwnedStatus {
  slug: string; name: string; team: string; competition: string; competitionName: string;
  playingStatus: string | null; injury: string | null; suspension: string | null; startRate: number | null;
  /** Le club joue-t-il pendant la journée à venir ? */
  playsThisGw: boolean;
}
export type Issue = 'blessé' | 'suspendu' | 'ne joue pas' | 'incertain';

/** Ce qui cloche pour une carte avant la GW ; null si rien à signaler. */
export function issueOf(p: OwnedStatus): Issue | null {
  if (p.injury) return 'blessé';
  if (p.suspension) return 'suspendu';
  if (!p.playsThisGw || p.playingStatus === 'NOT_PLAYING') return 'ne joue pas';
  if (p.playingStatus === 'SUBSTITUTE' || (p.startRate !== null && p.startRate < 0.4)) return 'incertain';
  return null;
}

export interface LeagueCheck {
  competition: string; name: string;
  /** Coup d'envoi du premier match du championnat dans la journée (à composer avant) ; null s'il ne joue pas. */
  firstKickoff: string | null;
  owned: number;
  issues: { slug: string; name: string; team: string; issue: Issue }[];
}

/**
 * Par championnat où l'on a des cartes : premier coup d'envoi de la GW (kickoffs : nom du championnat → date)
 * et cartes à problème, les plus graves d'abord.
 */
export function beforeGw(owned: OwnedStatus[], kickoffs: Map<string, string>): LeagueCheck[] {
  const order: Issue[] = ['blessé', 'suspendu', 'ne joue pas', 'incertain'];
  const byLeague = new Map<string, LeagueCheck>();
  for (const p of owned) {
    const l = byLeague.get(p.competition)
      ?? { competition: p.competition, name: p.competitionName, firstKickoff: kickoffs.get(p.competitionName) ?? null, owned: 0, issues: [] };
    l.owned += 1;
    const issue = l.firstKickoff ? issueOf(p) : null; // championnat au repos : rien à préparer
    if (issue) l.issues.push({ slug: p.slug, name: p.name, team: p.team, issue });
    byLeague.set(p.competition, l);
  }
  for (const l of byLeague.values()) l.issues.sort((a, b) => order.indexOf(a.issue) - order.indexOf(b.issue) || a.name.localeCompare(b.name));
  return [...byLeague.values()].sort((a, b) => (a.firstKickoff ?? '9').localeCompare(b.firstKickoff ?? '9') || b.owned - a.owned);
}
