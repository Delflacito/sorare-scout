import { NextResponse, type NextRequest } from 'next/server';
import { seasonStart } from '@/ingest/leagues';
import { PSEUDO } from '@/lib/squad';
import { createSorareClient } from '@/sources/sorare';

export const dynamic = 'force-dynamic';

/** Cartes Limited de la saison d'un utilisateur Sorare, avec leur mode d'acquisition (pour les collections Star). */
export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!PSEUDO.test(user)) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const sorare = createSorareClient(process.env.SORARE_API_KEY);
  let cards;
  try {
    cards = await sorare.userCards(user, await sorare.exchangeRates());
  } catch (e) {
    console.error('galerie Sorare (Star)', user, e);
    return NextResponse.json({ error: 'Sorare ne répond pas, réessaie dans un instant' }, { status: 502 });
  }
  if (!cards) return NextResponse.json({ error: `Aucun manager Sorare « ${user} »` }, { status: 404 });
  const season = new Date(seasonStart()).getUTCFullYear();
  return NextResponse.json({
    cards: cards.filter((c) => c.seasonYear === season)
      .map((c) => ({ slug: c.playerSlug, name: c.playerName, transferType: c.transferType })),
  });
}
