const PLAYING_STATUS: Record<string, { label: string; tone: string }> = {
  STARTER: { label: 'Titulaire', tone: 'good' },
  REGULAR: { label: 'Régulier', tone: 'good' },
  SUPER_SUBSTITUTE: { label: 'Joker', tone: 'neutral' },
  SUBSTITUTE: { label: 'Remplaçant', tone: 'warning' },
  NOT_PLAYING: { label: 'Ne joue pas', tone: 'critical' },
};

const fmtDay = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : null);

export interface StatusProps {
  playingStatus: string | null;
  injury: { kind: string | null; end: string | null } | null;
  suspension: { reason: string | null; end: string | null } | null;
  /** Version compacte (explorateur) : icônes seules, détail au survol. */
  compact?: boolean;
}

/** Statut de jeu, blessure et suspension : toujours une icône + un libellé, jamais la couleur seule. */
export function StatusBadges({ playingStatus, injury, suspension, compact = false }: StatusProps) {
  const status = playingStatus ? PLAYING_STATUS[playingStatus] : undefined;
  const injuryText = injury ? ['Blessé', injury.kind, injury.end && `retour prévu le ${fmtDay(injury.end)}`].filter(Boolean).join(' · ') : null;
  const suspensionText = suspension
    ? ['Suspendu', suspension.reason, suspension.end && `jusqu’au ${fmtDay(suspension.end)}`].filter(Boolean).join(' · ')
    : null;
  if (compact) {
    return (
      <span className="status-icons">
        {injuryText && <span className="status-icon critical" title={injuryText} aria-label={injuryText}>✚</span>}
        {suspensionText && <span className="status-icon critical" title={suspensionText} aria-label={suspensionText}>■</span>}
      </span>
    );
  }
  return (
    <span className="badges">
      {status && <span className={`badge-pill ${status.tone}`}><span className="dot" aria-hidden="true" />{status.label}</span>}
      {injuryText && <span className="badge-pill critical"><span aria-hidden="true">✚</span> {injuryText}</span>}
      {suspensionText && <span className="badge-pill critical"><span aria-hidden="true">■</span> {suspensionText}</span>}
    </span>
  );
}
