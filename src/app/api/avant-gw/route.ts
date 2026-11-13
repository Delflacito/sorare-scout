import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { beforeGwFor } from '@/lib/beforeGw';
import { PSEUDO } from '@/lib/squad';

export const dynamic = 'force-dynamic';

/** À faire avant la Game Week, pour les cartes possédées de ce pseudo (effectif enregistré). */
export async function GET(req: NextRequest) {
  const pseudo = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!PSEUDO.test(pseudo)) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  return NextResponse.json({ leagues: await beforeGwFor(getQueries(), pseudo) });
}
