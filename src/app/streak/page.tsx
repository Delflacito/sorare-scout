import Link from 'next/link';
import { getQueries, type StreakFixture } from '@/db/queries';
import { GENERIC_LABEL_FR } from '@/domain/types';
import { EnsurePseudo } from '@/components/MyCards';
import { ScorePill } from '@/components/ScorePill';
import { fmtPct } from '@/lib/format';
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
      {days.length === 0 ? <p className="empty">Aucun match programmé dans les {DAYS} prochains jours.</p> : (
        <div className="streak-days">
          {days.map(([key, fixtures]) => {
            const mine = fixtures.reduce((n, f) => n + f.mine.length, 0);
            return (
              <section key={key} className="card streak-day" aria-label={fmtDay(fixtures[0].date)}>
                <h2 className="card-title">{fmtDay(fixtures[0].date)}<span>{mine} de tes joueurs · {fixtures.length} match{fixtures.length > 1 ? 's' : ''}</span></h2>
                <ul className="streak-fixtures">
                  {fixtures.map((f) => (
                    <li key={f.id}>
                      <div className="streak-match"><span className="muted">{fmtTime(f.date)}</span> <strong>{f.home}</strong> – <strong>{f.away}</strong></div>
                      {f.mine.length > 0 && (
                        <ul className="streak-mine" aria-label={`Tes joueurs, ${f.home} – ${f.away}`}>
                          {f.mine.map((m) => (
                            <li key={m.slug}>
                              <Link href={`/joueurs/${m.slug}`}>{m.name}</Link>
                              <span className="muted small">{m.positions.map((x) => GENERIC_LABEL_FR[x][0]).join('/')} · {m.team} · titu {m.startRate === null ? '—' : fmtPct(m.startRate)}</span>
                              {m.projected !== null && <ScorePill score={m.projected} size="sm" title="Score potentiel" />}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="note">Score potentiel affiché pour le prochain match de chaque joueur seulement ; les suivants dépendront de sa forme d’ici là.</p>
    </main>
  );
}
