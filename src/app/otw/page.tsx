import { OtwList } from '@/components/Otw';

export default function OtwPage() {
  return (
    <main>
      <h1>OTW</h1>
      <p className="subtitle">Joueurs à acheter, ajoutés avec le « + » · prix actuel = plancher de la saison en cours (sinon prix de référence)</p>
      <OtwList />
    </main>
  );
}
