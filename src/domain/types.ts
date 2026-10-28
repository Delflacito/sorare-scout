export const DETAILED_POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'] as const;
export type DetailedPosition = (typeof DETAILED_POSITIONS)[number];
export type GenericPosition = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward';

export const POSITION_LABEL_FR: Record<DetailedPosition, string> = {
  GK: 'G', LB: 'DG', CB: 'DC', RB: 'DD', LWB: 'PG', RWB: 'PD',
  DM: 'MDC', CM: 'MC', AM: 'MOC', LW: 'AG', RW: 'AD', ST: 'BU',
};

/** Nom complet du poste précis. */
export const POSITION_NAME_FR: Record<DetailedPosition, string> = {
  GK: 'Gardien', LB: 'Latéral gauche', CB: 'Défenseur central', RB: 'Latéral droit', LWB: 'Piston gauche', RWB: 'Piston droit',
  DM: 'Milieu défensif', CM: 'Milieu central', AM: 'Milieu offensif', LW: 'Ailier gauche', RW: 'Ailier droit', ST: 'Avant-centre',
};

export const GENERIC_OF: Record<DetailedPosition, GenericPosition> = {
  GK: 'Goalkeeper',
  LB: 'Defender', CB: 'Defender', RB: 'Defender', LWB: 'Defender', RWB: 'Defender',
  DM: 'Midfielder', CM: 'Midfielder', AM: 'Midfielder',
  LW: 'Forward', RW: 'Forward', ST: 'Forward',
};

export const GENERIC_LABEL_FR: Record<GenericPosition, string> = {
  Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Forward: 'Attaquant',
};
