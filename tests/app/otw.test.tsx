// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { OtwButton, OtwList } from '@/components/Otw';
import { PSEUDO_KEY } from '@/components/SquadBuilder';

describe('OTW', () => {
  it('le « + » ajoute le joueur ; la liste montre prix actuel et total', async () => {
    localStorage.clear();
    render(<OtwButton slug="a" name="A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter A à la liste OTW' }));
    expect(JSON.parse(localStorage.getItem('sorare-scout:otw')!)).toEqual(['a']);
    localStorage.setItem('sorare-scout:otw', JSON.stringify(['a', 'b', 'achete']));
    localStorage.setItem(PSEUDO_KEY, 'moi');
    const p = (slug: string, floorInSeason: number | null, price: number | null) => ({ slug, name: slug.toUpperCase(), pictureUrl: null, team: slug === 'a' ? 'PSV' : 'Ajax', competition: slug === 'a' ? 'Ligue 2' : '2. Bundesliga', competitionSlug: slug === 'a' ? 'ligue-2-fr' : '2-bundesliga', floorInSeason, price });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => (url.startsWith('/api/effectif')
      ? { entries: [{ slug: 'achete', status: 'owned' }] } : [p('a', 10, 12), p('b', null, 5)]) })));
    render(<OtwList />);
    expect(await screen.findByRole('table', { name: 'Liste OTW' })).toHaveTextContent('Total15 €');
    expect(screen.getByRole('link', { name: 'Voir A sur Sorare (nouvel onglet)' })).toHaveAttribute('href', 'https://sorare.com/football/players/a');
    expect(JSON.parse(localStorage.getItem('sorare-scout:otw')!)).toEqual(['a', 'b']); // carte achetée retirée
    expect(screen.getByRole('combobox', { name: 'Compétition' })).toHaveTextContent('Toutes les liguesContender');
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Ajax' } });
    expect(screen.getByRole('table', { name: 'Liste OTW' })).toHaveTextContent('Total5,00 €');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer B' }));
    expect(JSON.parse(localStorage.getItem('sorare-scout:otw')!)).toEqual(['a']);
    vi.unstubAllGlobals();
  });
});
