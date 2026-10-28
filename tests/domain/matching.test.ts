import { normalizeName, matchPlayer, matchClub, matchFixture } from '@/domain/matching';

describe('normalizeName', () => {
  it('accents, ponctuation, espaces', () => {
    expect(normalizeName('Éder Militão')).toBe('eder militao');
    expect(normalizeName("N'Golo  Kanté")).toBe('n golo kante');
    expect(normalizeName('J.-C. Tuta')).toBe('j c tuta');
  });
});

describe('matchPlayer', () => {
  it('initiale + nom de famille', () => {
    expect(matchPlayer('K. Mbappé', [{ id: '1', name: 'Kylian Mbappé' }, { id: '2', name: 'Ethan Mbappé' }])).toBe('1');
  });
  it('homonymes → null', () => {
    expect(matchPlayer('Hernández', [{ id: '1', name: 'Theo Hernández' }, { id: '2', name: 'Lucas Hernández' }])).toBeNull();
  });
  it('nom identique aux accents près', () => {
    expect(matchPlayer('Vinicius Junior', [{ id: '9', name: 'Vinícius Júnior' }])).toBe('9');
  });
  it('tokens inclus', () => {
    expect(matchPlayer('Marquinhos', [{ id: '5', name: 'Marcos Aoás Corrêa Marquinhos' }, { id: '6', name: 'Vitinha' }])).toBe('5');
  });
  it('aucun candidat → null', () => {
    expect(matchPlayer('Inconnu', [{ id: '1', name: 'Kylian Mbappé' }])).toBeNull();
  });
});

describe('matchClub', () => {
  it('tirets et mots génériques', () => {
    expect(matchClub('Paris Saint Germain', [{ id: 'psg', name: 'Paris Saint-Germain' }])).toBe('psg');
    expect(matchClub('Olympique Marseille', [{ id: 'om', name: 'Olympique de Marseille' }])).toBe('om');
    expect(matchClub('AC Milan', [{ id: 'acm', name: 'Milan' }, { id: 'int', name: 'Inter' }])).toBe('acm');
  });
});

describe('matchFixture', () => {
  const candidates = [{ id: 'f', date: '2026-10-26T00:30:00Z', homeTeamId: 'a', awayTeamId: 'b' }];
  it('mêmes équipes, écart ≤ 1 jour', () => {
    expect(matchFixture({ date: '2026-10-25T19:00:00Z', homeTeamId: 'a', awayTeamId: 'b' }, candidates)).toBe('f');
  });
  it('équipes inversées → null', () => {
    expect(matchFixture({ date: '2026-10-25T19:00:00Z', homeTeamId: 'b', awayTeamId: 'a' }, candidates)).toBeNull();
  });
  it('écart de 2 jours → null', () => {
    expect(matchFixture({ date: '2026-10-24T00:00:00Z', homeTeamId: 'a', awayTeamId: 'b' }, candidates)).toBeNull();
  });
});
