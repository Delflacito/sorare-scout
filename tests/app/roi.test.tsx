// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RoiTracker } from '@/components/RoiTracker';

const none = { cards: 0, invested: 0, unknownPurchase: 0, value: 0, unpriced: 0 };

describe('page ROI', () => {
  it('investi et valeur lus dans la galerie ; palier de streak saisi, ROI recalculé et enregistré', async () => {
    window.localStorage.setItem('sorare-scout:pseudo', 'delflacito');
    const puts: unknown[] = [];
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return new Response('{"ok":true}'); }
      return new Response(JSON.stringify({
        owned: { eredivisie: { cards: 2, invested: 100, unknownPurchase: 1, value: 60, unpriced: 0 }, primeira: none, ligue1: none, jupiler: none, contender: none },
        manual: {},
      }));
    }) as unknown as typeof fetch;
    render(<RoiTracker />);
    const ere = await screen.findByRole('region', { name: 'Eredivisie' });
    expect(within(ere).getByText('ROI avec valeur des cartes').nextSibling).toHaveTextContent('−40 %');
    expect(within(ere).getByText(/1 carte sans prix d’achat connu/)).toBeInTheDocument();
    fireEvent.click(within(ere).getByRole('button', { name: '+ Ajouter un palier' }));
    const gain = within(ere).getByRole('textbox', { name: 'Gain total Palier 1' });
    fireEvent.change(gain, { target: { value: '50' } });
    fireEvent.blur(gain);
    await waitFor(() => expect(within(ere).getByText('ROI brut').nextSibling).toHaveTextContent('−50 %'));
    expect(within(ere).getByText('ROI avec valeur des cartes').nextSibling).toHaveTextContent('+10 %');
    await waitFor(() => expect(puts.at(-1)).toEqual({ eredivisie: { streaks: [{ level: 'Palier 1', count: 0, eur: 50 }], essence: 0, sold: [] } }));
  });
});
