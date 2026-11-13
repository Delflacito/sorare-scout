import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';

export const dynamic = 'force-dynamic';

/** Joueurs cotés pour l'effectif : joueurs d'un club (`team`), recherche (`q`, `competition`) ou liste de slugs (`slugs=a,b`). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const slugs = p.get('slugs');
  const q = p.get('q')?.trim();
  const queries = getQueries();
  if (slugs !== null) {
    const list = slugs.split(',').filter(Boolean).slice(0, 200);
    const [rows, splits] = await Promise.all([queries.getMarketPlayers({ slugs: list }), queries.getSplits({ slugs: list })]);
    const bySlug = new Map(splits.map((r) => [r.slug, r.splits]));
    return NextResponse.json(rows.map((r) => ({ ...r, splits: bySlug.get(r.slug) })));
  }
  const team = p.get('team');
  if (team) return NextResponse.json(await queries.getMarketPlayers({ team }));
  if (!q || q.length < 2) return NextResponse.json([]);
  return NextResponse.json(await queries.getMarketPlayers({ q, competition: p.get('competition') || undefined, limit: 12 }));
}
