import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { seasonStart } from '@/ingest/leagues';
import { PSEUDO } from '@/lib/squad';
import { competitionGroup } from '@/lib/competitions';
import { createSorareClient } from '@/sources/sorare';

export const dynamic = 'force-dynamic';

/** Cartes Limited de la saison d'un utilisateur Sorare (galerie publique), en lignes d'effectif des joueurs suivis. */
export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!PSEUDO.test(user)) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const sorare = createSorareClient(process.env.SORARE_API_KEY);
  let cards;
  try {
    cards = await sorare.userCards(user, await sorare.exchangeRates());
  } catch (e) {
    console.error('import galerie Sorare', user, e);
    return NextResponse.json({ error: 'Sorare ne répond pas, réessaie dans un instant' }, { status: 502 });
  }
  if (!cards) return NextResponse.json({ error: `Aucun manager Sorare « ${user} »` }, { status: 404 });
  const season = new Date(seasonStart()).getUTCFullYear();
  // shortcut: une ligne par joueur (prix d'achat de la carte la plus récente) ; à revoir si l'effectif doit compter les doublons.
  const byPlayer = new Map<string, number | null>();
  for (const c of cards) if (c.seasonYear === season && !byPlayer.has(c.playerSlug)) byPlayer.set(c.playerSlug, c.purchaseEur);
  const known = byPlayer.size ? await getQueries().getMarketPlayers({ slugs: [...byPlayer.keys()] }) : [];
  const entries = known.filter((p) => p.competitionSlug)
    .map((p) => ({ slug: p.slug, competition: competitionGroup(p.competitionSlug!), purchasePrice: byPlayer.get(p.slug) ?? null }));
  return NextResponse.json({ entries, cards: cards.length, classic: cards.filter((c) => c.seasonYear !== season).length,
    classicSlugs: [...new Set(cards.filter((c) => c.seasonYear !== season).map((c) => c.playerSlug))], untracked: byPlayer.size - entries.length });
}
