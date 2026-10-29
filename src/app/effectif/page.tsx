import { getQueries } from '@/db/queries';
import { SquadBuilder } from '@/components/SquadBuilder';

export const dynamic = 'force-dynamic';

export default async function EffectifPage() {
  const queries = getQueries();
  const [competitions, teams] = await Promise.all([queries.listCompetitions(), queries.listTeams()]);
  return (
    <main>
      <h1>Mon effectif</h1>
      <p className="subtitle">Importe ta galerie avec ton pseudo Sorare, ou choisis un club et coche tes joueurs</p>
      <SquadBuilder competitions={competitions} teams={teams} />
    </main>
  );
}
