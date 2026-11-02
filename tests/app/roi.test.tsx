// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RoiTracker } from '@/components/RoiTracker';

const g = (invested: number, value: number) => ({ cards: 2, invested, unknownPurchase: 0, value, unpriced: 0 });

describe('page ROI', () => {
  it('championnats triés par ROI, détail au toucher, streaks au bouton +, enregistrés', async () => {
    window.localStorage.setItem('sorare-scout:pseudo', 'delflacito');
    const puts: unknown[] = [];
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return new Response('{"ok":true}'); }
      return new Response(JSON.stringify({
        owned: { eredivisie: g(100, 60), primeira: g(100, 90), ligue1: g(0, 0), jupiler: g(100, 10), contender: g(50, 50) },
        manual: {},
      }));
    }) as unknown as typeof fetch;
    render(<RoiTracker />);
    const list = await screen.findByRole('list', { name: 'Championnats' });
    const names = () => within(list).getAllByRole('button', { expanded: false }).map((b) => b.textContent ?? '');
    expect(names()[0]).toMatch(/^Contender/); // ROI avec cartes 0 %, puis Primeira −10 %
    expect(names()[1]).toMatch(/^Primeira/);
    fireEvent.click(screen.getByRole('button', { name: 'Investi' }));
    expect(names().at(-1)).toMatch(/^Ligue 1/);
    fireEvent.click(screen.getByRole('button', { name: 'ROI avec cartes' }));

    fireEvent.click(within(list).getByRole('button', { name: /^Eredivisie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Streaks à 410 points : un de plus' })); // 25 € chacun
    fireEvent.click(screen.getByRole('button', { name: 'Streaks à 410 points : un de plus' }));
    const ere = within(list).getByRole('button', { name: /^Eredivisie/ });
    await waitFor(() => expect(ere).toHaveTextContent('+10 %')); // ROI avec cartes : (50 + 60 − 100) / 100
    expect(screen.getByText('ROI brut', { selector: '.roi-badge span' }).parentElement).toHaveTextContent('−50 %');
    expect(screen.getByText('ROI avec la valeur des cartes').nextSibling).toHaveTextContent('−26 %'); // (50 + 210 − 350) / 350
    await waitFor(() => expect(puts.at(-1)).toEqual({ eredivisie: { streaks: { 410: 2 }, sold: [] } }));

    // leaderboard : chaque gain s'ajoute au total
    const lbEur = screen.getByRole('textbox', { name: 'Euros à ajouter' });
    fireEvent.change(lbEur, { target: { value: '7,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au total euros' }));
    fireEvent.change(lbEur, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au total euros' }));
    expect(screen.getByLabelText('Euros total')).toHaveTextContent('10 €');
    expect(lbEur).toHaveValue('');
    await waitFor(() => expect(puts.at(-1)).toMatchObject({ eredivisie: { leaderboard: { eur: 10, essence: 0 } } }));

    // carte revendue : saisie dépliée, puis repliée en une ligne après « OK »
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter une carte revendue' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Joueur' }), { target: { value: 'Pepi' } });
    const bought = screen.getByRole('textbox', { name: 'Prix d’achat Pepi' });
    fireEvent.change(bought, { target: { value: '12' } });
    fireEvent.blur(bought);
    const sold = screen.getByRole('textbox', { name: 'Prix de revente Pepi' });
    fireEvent.change(sold, { target: { value: '20' } });
    fireEvent.blur(sold);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    const resold = screen.getByRole('list', { name: 'Cartes revendues' });
    expect(within(resold).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(resold).getByRole('listitem')).toHaveTextContent('Pepi12 € → 20 € (+8,00 €)');
    fireEvent.click(within(resold).getByRole('button', { name: 'Modifier Pepi' }));
    expect(within(resold).getByRole('textbox', { name: 'Joueur' })).toHaveValue('Pepi');
  });
});
