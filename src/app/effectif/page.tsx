import { getQueries } from '@/db/queries';
import { SquadBuilder } from '@/components/SquadBuilder';

export const dynamic = 'force-dynamic';

export default async function EffectifPage() {
  const competitions = await getQueries().listCompetitions();
  return (
    <main>
      <h1>Mon effectif</h1>
      <p className="subtitle">Par championnat : prix d’achat, valeur actuelle des cartes et coût d’un achat envisagé</p>
      <SquadBuilder competitions={competitions} />
    </main>
  );
}
