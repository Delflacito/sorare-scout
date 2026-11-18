// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlayerSearch } from '@/components/PlayerSearch';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('PlayerSearch', () => {
  it('suggestions cliquables qui ouvrent la fiche', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [{ slug: 'massire-sylla', name: 'Massiré Sylla', team: 'Union SG' }] }));
    render(<PlayerSearch />);
    fireEvent.change(screen.getByLabelText('Rechercher un joueur'), { target: { value: 'syl' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.click(screen.getByRole('button', { name: /Massiré Sylla/ }));
    expect(push).toHaveBeenCalledWith('/joueurs/massire-sylla');
    vi.useRealTimers();
  });
});
