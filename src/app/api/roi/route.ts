import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { seasonStart } from '@/ingest/leagues';
import { ROI_GROUPS, emptyManual, parseRoi, roiGroupOf, roiTotals, upsertWeek, weekOf, type RoiGroup, type RoiOwned } from '@/lib/roi';
import { PSEUDO } from '@/lib/squad';
import { createSorareClient } from '@/sources/sorare';

export const dynamic = 'force-dynamic';

const pseudoOf = (req: NextRequest) => {
  const p = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  return PSEUDO.test(p) ? p : null;
};

/**
 * Cartes Limited de la saison en cours possédées, par championnat du club actuel : prix d'achat réel (craft = 0, récompense
 * non comptée) et valeur actuelle (prix de référence), plus les saisies enregistrées. Les Classic sont exclues, à la demande.
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
  const mine = cards.flatMap((c) => { const g = c.seasonYear === season ? roiGroupOf(c.leagueSlug) : null; return g ? [{ ...c, group: g }] : []; });
  const queries = getQueries();
  const [market, manual, history] = await Promise.all([
    mine.length ? queries.getMarketPlayers({ slugs: [...new Set(mine.map((c) => c.playerSlug))] }) : [],
    queries.getRoi(pseudo),
    queries.getRoiHistory(pseudo),
  ]);
  const bySlug = new Map(market.map((p) => [p.slug, p]));
  const owned = Object.fromEntries(ROI_GROUPS.map((g) => [g.key, { cards: 0, invested: 0, unknownPurchase: 0, value: 0, unpriced: 0 }])) as Record<RoiGroup, RoiOwned>;
  for (const c of mine) {
    const o = owned[c.group];
    const p = bySlug.get(c.playerSlug);
    const value = p?.price ?? p?.floorInSeason ?? null;
    o.cards += 1;
    o.invested += c.purchaseEur ?? 0;
    if (c.purchaseEur === null) o.unknownPurchase += 1;
    if (value === null) o.unpriced += 1; else o.value += value;
  }
  // Saisies d'un ancien format (ou abîmées) ignorées plutôt que de casser la page.
  const data = (manual && parseRoi(manual)) ?? {};
  // Bilan de la semaine noté à chaque visite : l'historique montre la progression semaine après semaine.
  const totals = ROI_GROUPS.map((g) => roiTotals(g.key, owned[g.key], data[g.key] ?? emptyManual()));
  const sum = (f: (t: (typeof totals)[number]) => number) => Math.round(totals.reduce((n, t) => n + f(t), 0) * 100) / 100;
  const next = upsertWeek(history, { week: weekOf(new Date()), invested: sum((t) => t.invested), gains: sum((t) => t.gains), value: sum((t) => t.value) });
  await queries.saveRoiHistory(pseudo, next);
  return NextResponse.json({ owned, manual: data, history: next });
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
