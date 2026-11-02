// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StarTracker, type StarView } from '@/components/StarTracker';

const player = (slug: string, name: string, floor: number | null) => ({ slug, name, position: null, pictureUrl: null, team: 'AZ', competition: 'eredivisie', floor });
const collections: StarView[] = [{
  competition: 'eredivisie', name: 'Eredivisie', cards: [
    { name: 'Owned One', pos: 'GK', player: player('owned', 'Owned One', 5) },
    { name: 'Cher', pos: 'FW', player: player('cher', 'Cher', 30) },
    { name: 'Pas Cher', pos: 'MD', player: player('pascher', 'Pas Cher', 4) },
    { name: 'Sans Prix', pos: 'DF', player: player('sansprix', 'Sans Prix', null) },
  ],
}];

describe('collections Star', () => {
  it('coût pour compléter, manquantes de la moins chère à la plus chère, lien d’achat Sorare', async () => {
    window.localStorage.setItem('sorare-scout:pseudo', 'delflacito');
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ cards: [{ slug: 'owned', name: 'Owned One', transferType: 'ENGLISH_AUCTION' }] }))) as unknown as typeof fetch;
    render(<StarTracker collections={collections} />);
    expect(await screen.findByText(/Coût pour compléter/)).toHaveTextContent('Coût pour compléter : 34 € + 1 carte sans prix en vente');
    fireEvent.click(screen.getByRole('button', { name: 'Seulement les manquantes' }));
    const rows = within(screen.getByRole('list', { name: 'Eredivisie' })).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link', { name: /^(Pas Cher|Cher|Sans Prix)$/ }).textContent)).toEqual(['Pas Cher', 'Cher', 'Sans Prix']);
    expect(within(rows[0]).getByRole('link', { name: /Acheter Pas Cher/ })).toHaveAttribute('href', 'https://sorare.com/football/players/pascher');
  });
});
