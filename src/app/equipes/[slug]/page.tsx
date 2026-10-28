import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getQueries, type ConcededView } from '@/db/queries';
import type { DetailedPosition } from '@/domain/types';
import { Pitch } from '@/components/Pitch';
import { fmtDate } from '@/lib/format';
import { one, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const WINDOWS = [5, 10];

export default async function EquipePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const requested = Number(one((await searchParams).fenetre));
  const window = WINDOWS.includes(requested) ? requested : 5;
  const queries = getQueries();
  const team = await queries.getTeam(slug);
  if (!team) notFound();
  const [conceded, fixtures] = await Promise.all([queries.getConceded(team.id, window), queries.getTeamFixtures(team.id, window)]);
  const cells: Partial<Record<DetailedPosition, ConcededView>> = Object.fromEntries(conceded.map((c) => [c.position, c]));

  return (
    <main>
      <h1>{team.name}</h1>
      {team.competition && <p className="subtitle">{team.competition}</p>}

      <h2>Score Sorare concédé par poste</h2>
      <form className="window" method="get">
        <label>
          Fenêtre :{' '}
          <select name="fenetre" defaultValue={String(window)}>
            {WINDOWS.map((w) => <option key={w} value={w}>{w} derniers matchs</option>)}
          </select>
        </label>{' '}
        <button type="submit">Afficher</button>
      </form>
      <Pitch cells={cells} />
      <p className="legend">
        <span className="hot">rouge : concède plus que la moyenne</span>
        <span className="cold">vert : concède moins</span>
        <span className="low-sample">grisé : moins de 3 observations</span>
      </p>

      <h2>Matchs pris en compte</h2>
      {fixtures.length ? (
        <div className="table-wrap">
          <table>
            <tbody>
              {fixtures.map((f) => (
                <tr key={f.fixtureId}>
                  <td>{fmtDate(f.date)}</td>
                  <td>{f.isHome ? 'vs' : '@'} <Link href={`/equipes/${f.opponentSlug}`}>{f.opponent}</Link></td>
                  <td className="num">{f.goalsFor ?? '–'} – {f.goalsAgainst ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Aucun match importé pour cette équipe</p>
      )}
    </main>
  );
}
