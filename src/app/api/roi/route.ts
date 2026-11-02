import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { seasonStart } from '@/ingest/leagues';
import { ROI_GROUPS, parseRoi, roiGroupOf, type RoiGroup, type RoiOwned } from '@/lib/roi';
import { PSEUDO } from '@/lib/squad';
import { createSorareClient } from '@/sources/sorare';

export const dynamic = 'force-dynamic';

const pseudoOf = (req: NextRequest) => {
  const p = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  return PSEUDO.test(p) ? p : null;
};

/**
 * Cartes Limited possédées (toutes saisons) par championnat du club actuel : prix d'achat réel (craft = 0) et valeur
 * actuelle (prix de référence pour la saison en cours, plancher Classic sinon), plus les saisies enregistrées.
 */
export async function GET(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const sorare = createSorareClient(process.env.SORARE_API_KEY);
  let cards;
  try {
    cards = await sorare.userCards(pseudo, await sorare.exchangeRates());
  } catch (e) {
    console.error('galerie Sorare (ROI)', pseudo, e);
    return NextResponse.json({ error: 'Sorare ne répond pas, réessaie dans un instant' }, { status: 502 });
  }
  if (!cards) return NextResponse.json({ error: `Aucun manager Sorare « ${pseudo} »` }, { status: 404 });
  const season = new Date(seasonStart()).getUTCFullYear();
  const mine = cards.flatMap((c) => { const g = roiGroupOf(c.leagueSlug); return g ? [{ ...c, group: g }] : []; });
  const queries = getQueries();
  const [market, manual] = await Promise.all([
    mine.length ? queries.getMarketPlayers({ slugs: [...new Set(mine.map((c) => c.playerSlug))] }) : [],
    queries.getRoi(pseudo),
  ]);
  const bySlug = new Map(market.map((p) => [p.slug, p]));
  const owned = Object.fromEntries(ROI_GROUPS.map((g) => [g.key, { cards: 0, invested: 0, unknownPurchase: 0, value: 0, unpriced: 0 }])) as Record<RoiGroup, RoiOwned>;
  for (const c of mine) {
    const o = owned[c.group];
    const p = bySlug.get(c.playerSlug);
    // shortcut: une carte Classic n'est valorisée que si son plancher est connu (le marché suivi est surtout celui de la saison).
    const value = c.seasonYear === season ? (p?.price ?? p?.floorInSeason ?? null) : (p?.floorClassic ?? null);
    o.cards += 1;
    o.invested += c.purchaseEur ?? 0;
    if (c.purchaseEur === null) o.unknownPurchase += 1;
    if (value === null) o.unpriced += 1; else o.value += value;
  }
  // Saisies d'un ancien format (ou abîmées) ignorées plutôt que de casser la page.
  return NextResponse.json({ owned, manual: (manual && parseRoi(manual)) ?? {} });
}

/** Enregistre les saisies (streaks par palier, cartes revendues) de ce pseudo. */
export async function PUT(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const data = parseRoi(await req.json().catch(() => undefined));
  if (!data) return NextResponse.json({ error: 'Saisies mal formées' }, { status: 400 });
  await getQueries().saveRoi(pseudo, data);
  return NextResponse.json({ ok: true });
}
