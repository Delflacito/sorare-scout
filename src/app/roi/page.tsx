import { RoiTracker } from '@/components/RoiTracker';

export const dynamic = 'force-dynamic';

export default function RoiPage() {
  return (
    <main>
      <h1>ROI par championnat</h1>
      <p className="subtitle">Cartes et prix d’achat lus dans ta galerie Sorare ; nombre de streaks par palier et cartes revendues à saisir ici</p>
      <RoiTracker />
    </main>
  );
}
