import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/roi/route';
import { checkCode } from '@/lib/writeCode';
import { alertText } from '@/ingest/alert';
import type { LeagueCheck } from '@/lib/beforeGw';

const req = (code?: string) => new NextRequest('http://x/api/roi?user=delflacito', { method: 'PUT', body: 'pas du json', headers: code ? { 'x-code': code } : {} });

describe('code d’enregistrement', () => {
  afterEach(() => { delete process.env.WRITE_CODE; });

  it('sans variable WRITE_CODE : tout est accepté', () => {
    expect(checkCode(req())).toBe(true);
  });

  it('avec la variable : seul le bon code passe', async () => {
    process.env.WRITE_CODE = 'secret-1';
    expect(checkCode(req())).toBe(false);
    expect(checkCode(req('secret-2'))).toBe(false);
    expect(checkCode(req('secret-1'))).toBe(true);
    expect((await PUT(req())).status).toBe(401); // refusé avant toute écriture
    expect((await PUT(req('secret-1'))).status).toBe(400); // code bon : on arrive à la vérification des saisies
  });
});

describe('alerte avant la Game Week', () => {
  const now = Date.parse('2026-11-13T06:00:00Z');
  const league = (name: string, firstKickoff: string | null, issues: LeagueCheck['issues']): LeagueCheck => ({ competition: name, name, firstKickoff, owned: 3, issues });
  const hurt = [{ slug: 'a', name: 'Greenwood', team: 'OM', issue: 'blessé' as const }];

  it('championnat qui commence dans les 36 h avec une carte à problème', () => {
    const text = alertText([league('Ligue 1', '2026-11-13T19:45:00Z', hurt), league('Eredivisie', '2026-11-16T19:00:00Z', hurt), league('Jupiler', '2026-11-13T19:00:00Z', [])], now);
    expect(text).toBe('Ligue 1 (ven. 20:45)\n- Greenwood, OM : blessé');
  });

  it('rien à signaler : pas d’alerte', () => {
    expect(alertText([league('Ligue 1', '2026-11-13T19:45:00Z', []), league('Liga 2', null, hurt)], now)).toBeNull();
  });
});
