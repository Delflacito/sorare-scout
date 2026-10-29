import { NextResponse, type NextRequest } from 'next/server';
import { getQueries } from '@/db/queries';
import { PSEUDO, parseSquad } from '@/lib/squad';

export const dynamic = 'force-dynamic';

const pseudoOf = (req: NextRequest) => {
  const p = req.nextUrl.searchParams.get('user')?.trim().toLowerCase() ?? '';
  return PSEUDO.test(p) ? p : null;
};

/** Effectif enregistré pour ce pseudo (null s'il n'y en a pas encore). */
export async function GET(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  return NextResponse.json({ entries: await getQueries().getSquad(pseudo) });
}

/** Enregistre l'effectif de ce pseudo (remplace le précédent). */
export async function PUT(req: NextRequest) {
  const pseudo = pseudoOf(req);
  if (!pseudo) return NextResponse.json({ error: 'Pseudo Sorare invalide' }, { status: 400 });
  const entries = parseSquad(await req.json().then((b) => b?.entries, () => undefined));
  if (!entries) return NextResponse.json({ error: 'Effectif mal formé' }, { status: 400 });
  await getQueries().saveSquad(pseudo, entries);
  return NextResponse.json({ ok: true });
}
