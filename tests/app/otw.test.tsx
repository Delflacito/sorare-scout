// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { OtwButton, OtwList } from '@/components/Otw';

describe('OTW', () => {
  it('le « + » ajoute le joueur ; la liste montre prix actuel et total', async () => {
    localStorage.clear();
    render(<OtwButton slug="a" name="A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter A à la liste OTW' }));
    expect(JSON.parse(localStorage.getItem('sorare-scout:otw')!)).toEqual(['a']);
    localStorage.setItem('sorare-scout:otw', JSON.stringify(['a', 'b']));
    const p = (slug: string, floorInSeason: number | null, price: number | null) => ({ slug, name: slug.toUpperCase(), pictureUrl: null, team: slug === 'a' ? 'PSV' : 'Ajax', competition: 'Eredivisie', floorInSeason, price });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [p('a', 10, 12), p('b', null, 5)] })));
    render(<OtwList />);
    expect(await screen.findByRole('table', { name: 'Liste OTW' })).toHaveTextContent('Total15 €');
    expect(screen.getByRole('link', { name: 'Voir A sur Sorare (nouvel onglet)' })).toHaveAttribute('href', 'https://sorare.com/football/players/a');
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Ajax' } });
    expect(screen.getByRole('table', { name: 'Liste OTW' })).toHaveTextContent('Total5,00 €');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer B' }));
    expect(JSON.parse(localStorage.getItem('sorare-scout:otw')!)).toEqual(['a']);
    vi.unstubAllGlobals();
  });
});
