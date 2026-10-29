// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SquadBuilder, STORAGE_KEY, mergeImport, squadTotals, type SquadEntry } from '@/components/SquadBuilder';
import type { MarketPlayerView } from '@/db/queries';

const player = (slug: string, price: number | null, potentialPrice: number | null = null): MarketPlayerView => ({
  slug, name: slug.toUpperCase(), pictureUrl: null, team: 'PSV', teamSlug: 'psv', teamPictureUrl: null, competition: 'Eredivisie',
  competitionSlug: 'eredivisie', cardPositions: ['Forward'], usualPosition: 'ST', l15: 55, floorInSeason: price, floorClassic: null,
  recentPrice: price, price, fairPrice: null, valueRatio: null, potentialPrice, potentialGain: potentialPrice && price ? potentialPrice / price - 1 : null,
  priceTrend7: null, lastAuction: price ? { eur: price - 2, date: '2026-10-28T10:00:00.000Z' } : null,
});
const competitions = [{ slug: 'eredivisie', name: 'Eredivisie' }, { slug: 'ligue-1-fr', name: 'Ligue 1' }];
const teams = [{ slug: 'psv', name: 'PSV', competitionSlug: 'eredivisie' }, { slug: 'psg', name: 'PSG', competitionSlug: 'ligue-1-fr' }];

describe('totaux de l’effectif', () => {
  it('coût réel, valeur, achats envisagés, potentiel', () => {
    const info = new Map([['a', player('a', 30, 33)], ['b', player('b', 10)], ['c', player('c', 50, 55)]]);
    const entries: SquadEntry[] = [
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 20 },
      { slug: 'b', competition: 'eredivisie', status: 'owned', purchasePrice: null },
      { slug: 'c', competition: 'eredivisie', status: 'target', purchasePrice: 45 },
    ];
    expect(squadTotals(entries, info)).toEqual({
      cost: 20, value: 40, gain: 20, missingPurchase: 1, targets: 45, costWithTargets: 65, potential: 33 + 10 + 55,
    });
  });
});

describe('import depuis Sorare', () => {
  it('cartes de la galerie possédées ; prix saisi à la main gardé ; cartes vendues retirées ; ajouts manuels intacts', () => {
    const before: SquadEntry[] = [
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 9 }, // saisi à la main, encore possédé
      { slug: 'b', competition: 'eredivisie', status: 'owned', purchasePrice: 3, fromSorare: true }, // vendu depuis
      { slug: 'c', competition: 'eredivisie', status: 'owned', purchasePrice: 4 }, // ajout manuel (Classic…)
      { slug: 'd', competition: 'eredivisie', status: 'target', purchasePrice: 10 }, // envisagé puis acheté
      { slug: 'e', competition: 'eredivisie', status: 'target', purchasePrice: null }, // toujours envisagé
    ];
    const after = mergeImport(before, [
      { slug: 'a', competition: 'eredivisie', purchasePrice: 7 },
      { slug: 'd', competition: 'eredivisie', purchasePrice: 12 },
      { slug: 'f', competition: 'eredivisie', purchasePrice: null },
    ]);
    expect(after).toEqual([
      { slug: 'c', competition: 'eredivisie', status: 'owned', purchasePrice: 4 },
      { slug: 'e', competition: 'eredivisie', status: 'target', purchasePrice: null },
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 9, fromSorare: true },
      { slug: 'd', competition: 'eredivisie', status: 'owned', purchasePrice: 12, fromSorare: true },
      { slug: 'f', competition: 'eredivisie', status: 'owned', purchasePrice: null, fromSorare: true },
    ]);
  });
});

describe('Mon effectif', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url), 'http://x');
      const body = u.searchParams.has('slugs')
        ? u.searchParams.get('slugs')!.split(',').map((s) => player(s, 30, 33))
        : u.searchParams.get('team') === 'psv' ? [player('xavi', 30, 33), player('luuk', 12)] : [];
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
  });

  it('club puis joueurs cochés, prix d’achat, totaux, enregistrement dans le navigateur', async () => {
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    expect(screen.getByRole('combobox', { name: 'Club' })).not.toHaveTextContent('PSG'); // clubs du championnat affiché
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'psv' } });
    const list = await screen.findByRole('list', { name: 'Joueurs du club' });
    fireEvent.click(within(list).getByRole('checkbox', { name: /XAVI/ }));
    const input = await screen.findByRole('textbox', { name: 'Prix d’achat de XAVI' });
    fireEvent.change(input, { target: { value: '22,5' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Coût réel').nextSibling).toHaveTextContent('22,5 €'));
    expect(screen.getByText('Valeur actuelle').nextSibling).toHaveTextContent('30 €');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { slug: 'xavi', competition: 'eredivisie', status: 'owned', purchasePrice: 22.5 },
    ]);
    // décocher retire la carte
    fireEvent.click(within(list).getByRole('checkbox', { name: /XAVI/ }));
    await waitFor(() => expect(screen.getByText(/Aucune carte dans ce championnat/)).toBeInTheDocument());
  });

  it('achat envisagé : coût total avec achats ; un onglet par championnat', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 20 },
      { slug: 'b', competition: 'eredivisie', status: 'target', purchasePrice: null },
    ]));
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    await waitFor(() => expect(screen.getByText('Avec les achats envisagés').nextSibling).toHaveTextContent('50 €'));
    expect(screen.getByRole('button', { name: /Eredivisie/ })).toHaveTextContent('2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ligue 1' })); });
    expect(screen.getByText(/Aucune carte dans ce championnat/)).toBeInTheDocument();
  });
});
