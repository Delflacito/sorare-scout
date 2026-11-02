import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { beforeGw } from '@/lib/beforeGw';
import { PSEUDO } from '@/lib/squad';

export const dynamic = 'force-dynamic';

/** À faire avant la Game Week, pour les cartes possédées de ce pseudo (effectif enregistré). */
export async function GET(req: NextRequest) {
  const pseudo = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!PSEUDO.test(pseudo)) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const queries = getQueries();
  const [squad, fixtures] = await Promise.all([queries.getSquad(pseudo), queries.getGameWeekFixtures()]);
  const slugs = [...new Set((squad ?? []).filter((e) => e.status === 'owned').map((e) => e.slug))];
  const owned = await queries.getOwnedStatus(slugs, fixtures.map((f) => f.id));
  const kickoffs = new Map<string, string>();
  for (const f of fixtures) if (!kickoffs.has(f.competition)) kickoffs.set(f.competition, f.date); // matchs triés par date
  return NextResponse.json({ leagues: beforeGw(owned, kickoffs) });
}
