import { beforeGw, issueOf, type OwnedStatus } from '@/lib/beforeGw';

const p = (slug: string, o: Partial<OwnedStatus> = {}): OwnedStatus => ({
  slug, name: slug, team: 'AZ', competition: 'eredivisie', competitionName: 'Eredivisie', playingStatus: 'STARTER',
  injury: null, suspension: null, startRate: 0.8, playsThisGw: true, ...o,
});

describe('à faire avant la GW', () => {
  it('blessé, suspendu, ne joue pas, incertain, ou rien', () => {
    expect(issueOf(p('a', { injury: 'Genou' }))).toBe('blessé');
    expect(issueOf(p('a', { suspension: 'Rouge' }))).toBe('suspendu');
    expect(issueOf(p('a', { playsThisGw: false }))).toBe('ne joue pas');
    expect(issueOf(p('a', { playingStatus: 'NOT_PLAYING' }))).toBe('ne joue pas');
    expect(issueOf(p('a', { startRate: 0.2 }))).toBe('incertain');
    expect(issueOf(p('a'))).toBeNull();
  });

  it('par championnat : premier coup d’envoi, problèmes les plus graves d’abord ; championnat au repos sans alerte', () => {
    const res = beforeGw([
      p('z', { startRate: 0.2 }), p('y', { injury: 'Genou' }), p('ok'),
      p('mls1', { competition: 'mlspa', competitionName: 'MLS', playsThisGw: false }),
    ], new Map([['Eredivisie', '2026-11-07T15:30:00.000Z']]));
    expect(res.map((l) => [l.name, l.firstKickoff, l.owned, l.issues.map((i) => `${i.name}:${i.issue}`)])).toEqual([
      ['Eredivisie', '2026-11-07T15:30:00.000Z', 3, ['y:blessé', 'z:incertain']],
      ['MLS', null, 1, []],
    ]);
  });
});
