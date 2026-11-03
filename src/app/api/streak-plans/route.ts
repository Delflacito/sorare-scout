import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { PSEUDO } from '@/lib/squad';
import { parsePlans } from '@/lib/streakPlans';

export const dynamic = 'force-dynamic';

const pseudoOf = (req: NextRequest) => {
  const p = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  return PSEUDO.test(p) ? p : null;
};

/** Sélections enregistrées de ce pseudo. */
export async function GET(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  return NextResponse.json({ plans: await getQueries().getStreakPlans(pseudo) });
}

/** Remplace les sélections enregistrées de ce pseudo. */
export async function PUT(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const plans = parsePlans(await req.json().then((b) => b?.plans, () => undefined));
  if (!plans) return NextResponse.json({ error: 'Sélections mal formées' }, { status: 400 });
  await getQueries().saveStreakPlans(pseudo, plans);
  return NextResponse.json({ ok: true });
}
