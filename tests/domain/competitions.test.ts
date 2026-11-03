import { competitionGroup, groupCompetitions, slugsOf } from '@/lib/competitions';

describe('championnats Contender', () => {
  it('réunis sous « Contender » : liste, rattachement, slugs couverts', () => {
    expect(groupCompetitions([
      { slug: 'ligue-2-fr', name: 'Ligue 2' }, { slug: 'eredivisie', name: 'Eredivisie' }, { slug: '1-hnl', name: 'HNL (Croatie)' },
    ])).toEqual([{ slug: 'contender', name: 'Contender' }, { slug: 'eredivisie', name: 'Eredivisie' }]);
    expect(groupCompetitions([{ slug: 'eredivisie', name: 'Eredivisie' }])).toEqual([{ slug: 'eredivisie', name: 'Eredivisie' }]);
    expect(competitionGroup('segunda-division-es')).toBe('contender');
    expect(competitionGroup('ligue-1-fr')).toBe('ligue-1-fr');
    expect(slugsOf('contender')).toHaveLength(5);
    expect(slugsOf('eredivisie')).toEqual(['eredivisie']);
  });
});
