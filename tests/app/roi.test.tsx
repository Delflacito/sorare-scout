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

    fireEvent.click(within(list).getByRole('button', { name: /^Eredivisie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Streaks à 410 points : un de plus' })); // 25 € chacun
    fireEvent.click(screen.getByRole('button', { name: 'Streaks à 410 points : un de plus' }));
    const ere = within(list).getByRole('button', { name: /^Eredivisie/ });
    await waitFor(() => expect(ere).toHaveTextContent('Brut −50 %'));
    expect(ere).toHaveTextContent('Avec cartes +10 %');
    await waitFor(() => expect(puts.at(-1)).toEqual({ eredivisie: { streaks: { 410: 2 }, sold: [] } }));
  });
});
