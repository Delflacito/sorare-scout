import { getQueries } from '@/db/queries';
import { STAR_COLLECTIONS, matchCard } from '@/lib/star';
import { StarTracker, type StarView } from '@/components/StarTracker';

export const dynamic = 'force-dynamic';

export default async function StarPage() {
  const players = await getQueries().listPlayersIn(STAR_COLLECTIONS.map((c) => c.competition));
  const collections: StarView[] = STAR_COLLECTIONS.map((c) => {
    const inLeague = players.filter((p) => p.competition === c.competition);
    return {
      competition: c.competition, name: c.name,
      // Repli sur tous les championnats : un joueur peut avoir changé de club depuis la sortie de la collection.
      cards: c.cards.map((card) => ({ ...card, player: matchCard(card, inLeague) ?? matchCard(card, players) })),
    };
  });
  return (
    <main>
      <h1>Collections Star</h1>
      <p className="subtitle">Les cartes Limited de la saison à collectionner, championnat par championnat : une carte gagnée aux enchères, achetée à Sorare ou craftée est validée</p>
      <StarTracker collections={collections} />
    </main>
  );
}
