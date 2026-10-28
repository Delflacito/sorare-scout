import { DETAILED_POSITIONS, POSITION_LABEL_FR, GENERIC_OF } from '@/domain/types';

describe('types', () => {
  it('libellés FR des 12 postes', () => {
    expect(POSITION_LABEL_FR).toEqual({
      GK: 'G', LB: 'DG', CB: 'DC', RB: 'DD', LWB: 'PG', RWB: 'PD',
      DM: 'MDC', CM: 'MC', AM: 'MOC', LW: 'AG', RW: 'AD', ST: 'BU',
    });
    expect(DETAILED_POSITIONS).toHaveLength(12);
  });
  it('poste générique', () => {
    expect(GENERIC_OF.LWB).toBe('Defender');
    expect(GENERIC_OF.AM).toBe('Midfielder');
    expect(GENERIC_OF.LW).toBe('Forward');
    expect(GENERIC_OF.GK).toBe('Goalkeeper');
  });
});
