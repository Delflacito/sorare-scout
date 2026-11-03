import Link from 'next/link';
import { getQueries, type StreakFixture } from '@/db/queries';
import { EnsurePseudo } from '@/components/MyCards';
import { StreakPlanner } from '@/components/StreakPlanner';
import { one, type SearchParams } from '@/lib/params';
import { PSEUDO } from '@/lib/squad';

export const dynamic = 'force-dynamic';

const DAYS = 14;
const fmtDay = (iso: string) => {
  const d = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return d.charAt(0).toUpperCase() + d.slice(1);
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

/** Matchs regroupés par jour (heure de Paris), dans l'ordre. */
function byDay(fixtures: StreakFixture[]): [string, StreakFixture[]][] {
  const days = new Map<string, StreakFixture[]>();
  for (const f of fixtures) days.set(dayKey(f.date), [...(days.get(dayKey(f.date)) ?? []), f]);
  return [...days.entries()];
}

export default async function StreakPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const queries = getQueries();
  const competitions = await queries.listCompetitions();
  const competition = competitions.find((c) => c.slug === one(p.competition))?.slug ?? competitions.find((c) => c.slug === 'eredivisie')?.slug ?? competitions[0]?.slug;
  const raw = one(p.cartes)?.toLowerCase();
  const cartes = raw && PSEUDO.test(raw) ? raw : undefined;
  const href = (c: string) => `/streak?competition=${c}${cartes ? `&cartes=${cartes}` : ''}`;
  const squad = cartes ? await queries.getSquad(cartes) : null;
  const owned = [...new Set((squad ?? []).filter((e) => e.status === 'owned').map((e) => e.slug))];
  const plan = competition ? await queries.getStreakPlan(competition, owned, DAYS) : [];
  const days = byDay(plan);

  return (
    <main>
      <h1>Préparer ma streak</h1>
      <p className="subtitle">Les matchs des {DAYS} prochains jours et tes cartes concernées, jour par jour, pour composer à l’avance</p>
      <EnsurePseudo href={competition ? `/streak?competition=${competition}` : '/streak'} present={!!cartes} />
      <nav className="chip-row" aria-label="Championnat">
        {competitions.map((c) => <Link key={c.slug} href={href(c.slug)} aria-current={c.slug === competition ? 'page' : undefined}>{c.name}</Link>)}
      </nav>
      {cartes && competition && (
        <p className="note">
          <Link href={`/game-week?competition=${competition}&cartes=${cartes}&titu=0`}>Composer la prochaine journée avec mes cartes →</Link>
        </p>
      )}
      {days.length === 0 ? <p className="empty">Aucun match programmé dans les {DAYS} prochains jours.</p>
        : <StreakPlanner pseudo={cartes} days={days.map(([key, fixtures]) => ({ key, label: fmtDay(fixtures[0].date), fixtures: fixtures.map((f) => ({ ...f, time: fmtTime(f.date) })) }))} />}
      <p className="note">Score potentiel affiché pour le prochain match de chaque joueur seulement ; les suivants dépendront de sa forme d’ici là.</p>
    </main>
  );
}
