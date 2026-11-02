// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SquadBuilder, STORAGE_KEY, mergeImport, resolveManual, squadTotals, type SquadEntry } from '@/components/SquadBuilder';
import { parseSquad } from '@/lib/squad';
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
  it('coût réel (prix d’achat, à défaut prix actuel), valeur, achats envisagés, potentiel', () => {
    const info = new Map([['a', player('a', 30, 33)], ['b', player('b', 10)], ['c', player('c', 50, 55)]]);
    const entries: SquadEntry[] = [
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 20 },
      { slug: 'b', competition: 'eredivisie', status: 'owned', purchasePrice: null },
      { slug: 'c', competition: 'eredivisie', status: 'target', purchasePrice: 45 },
    ];
    expect(squadTotals(entries, info)).toEqual({
      cost: 20 + 10, value: 40, gain: 10, missingPurchase: 1, targets: 45, costWithTargets: 75, potential: 33 + 10 + 55,
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

describe('effectif enregistré en ligne', () => {
  it('vérifie ce qui est reçu : champs connus seulement, statut et prix valides', () => {
    expect(parseSquad([{ slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 3, fromSorare: true, extra: 'x' }]))
      .toEqual([{ slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 3, fromSorare: true }]);
    expect(parseSquad([{ slug: 'a', competition: 'e', status: 'vendu', purchasePrice: 3 }])).toBeNull();
    expect(parseSquad([{ slug: 'a', competition: 'e', status: 'owned', purchasePrice: -1 }])).toBeNull();
    expect(parseSquad({ slug: 'a' })).toBeNull();
  });

  it('pseudo connu : l’effectif en ligne remplace celui du navigateur, chaque modification y est renvoyée', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('sorare-scout:pseudo', 'delflacito');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ slug: 'vieux', competition: 'eredivisie', status: 'owned', purchasePrice: null }]));
    const saved: unknown[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url), 'http://x');
      if (u.pathname === '/api/effectif/enregistre') {
        if (init?.method === 'PUT') { saved.push(JSON.parse(String(init.body)).entries); return new Response('{"ok":true}'); }
        return new Response(JSON.stringify({ entries: [{ slug: 'xavi', competition: 'eredivisie', status: 'owned', purchasePrice: 20, fromSorare: true }] }));
      }
      return new Response(JSON.stringify(u.searchParams.get('slugs')?.split(',').map((x) => player(x, 30)) ?? []));
    }) as unknown as typeof fetch;
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'xavi' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'vieux' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mettre à jour depuis Sorare' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer xavi' }));
    await waitFor(() => expect(saved.at(-1)).toEqual([]));
  });
});

describe('ajout manuel d’un joueur non suivi', () => {
  const manual: SquadEntry = { slug: 'manuel:resink', name: 'Resink', competition: 'eredivisie', status: 'owned', purchasePrice: 4 };
  it('remplacé par le joueur dès qu’il est suivi (prix gardé), retiré s’il est déjà là, gardé si le nom est ambigu', () => {
    const found = new Map([['Resink', [{ slug: 'stije-resink', name: 'Stije Resink' }, { slug: 'x', name: 'Bob Resinkova' }]]]);
    expect(resolveManual([manual], found)).toEqual([{ slug: 'stije-resink', competition: 'eredivisie', status: 'owned', purchasePrice: 4 }]);
    const already: SquadEntry = { slug: 'stije-resink', competition: 'eredivisie', status: 'owned', purchasePrice: 5, fromSorare: true };
    expect(resolveManual([manual, already], found)).toEqual([already]);
    expect(resolveManual([manual], new Map([['Resink', [{ slug: 'a', name: 'A Resink' }, { slug: 'b', name: 'B Resink' }]]]))).toEqual([manual]);
    expect(resolveManual([manual], new Map())).toEqual([manual]);
  });
  it('enregistrement : le nom est gardé', () => {
    expect(parseSquad([manual])).toEqual([manual]);
    expect(parseSquad([{ ...manual, name: 'x'.repeat(81) }])).toBeNull();
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
    fireEvent.click(within(list).getByRole('button', { name: 'J’ai XAVI' }));
    const input = await screen.findByRole('textbox', { name: 'Prix d’achat de XAVI' });
    fireEvent.change(input, { target: { value: '22,5' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('Coût réel').nextSibling).toHaveTextContent('22,5 €'));
    expect(screen.getByText('Valeur actuelle').nextSibling).toHaveTextContent('30 €');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { slug: 'xavi', competition: 'eredivisie', status: 'owned', purchasePrice: 22.5 },
    ]);
    // retirer depuis la liste du club
    fireEvent.click(within(list).getByRole('button', { name: 'Dans mes cartes ✕' }));
    await waitFor(() => expect(screen.getByText(/Aucune carte dans ce championnat/)).toBeInTheDocument());
  });

  it('effectif de plus de 200 joueurs : infos demandées par paquets, aucun joueur sans nom', async () => {
    const many = Array.from({ length: 320 }, (_, i) => ({ slug: `p${String(i).padStart(3, '0')}`, competition: 'eredivisie', status: 'owned', purchasePrice: 1 }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(many));
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'P319' })).toBeInTheDocument());
    const asked = vi.mocked(global.fetch).mock.calls.map(([u]) => new URL(String(u), 'http://x').searchParams.get('slugs')?.split(',').length ?? 0);
    expect(Math.max(...asked)).toBeLessThanOrEqual(200);
  });

  it('joueur absent de la liste ajouté par son nom, affiché sans lien', async () => {
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom d’un joueur absent de la liste' }), { target: { value: 'Stije Resink' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à mes cartes' }));
    const mine = await screen.findByRole('list', { name: 'Mes cartes' });
    expect(within(mine).getByText('Stije Resink')).toBeInTheDocument();
    expect(within(mine).queryByRole('link')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      { slug: 'manuel:stije-resink', name: 'Stije Resink', competition: 'eredivisie', status: 'owned', purchasePrice: null },
    ]);
  });

  it('cartes par poste (poste vide signalé, un clic pour filtrer) ; carte à acheter passée en « Acheté »', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 0 }, // craftée
      { slug: 'b', competition: 'eredivisie', status: 'target', purchasePrice: 25 },
    ]));
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    const mine = await screen.findByRole('list', { name: 'Mes cartes' });
    await waitFor(() => expect(within(mine).getByText('+30 €')).toBeInTheDocument()); // craftée 0 €, vaut 30 €
    expect(screen.getByRole('button', { name: /Attaquants/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Gardiens/ })).toHaveTextContent('aucun');
    expect(screen.getByRole('button', { name: /Gardiens/ })).toHaveClass('missing');
    fireEvent.click(screen.getByRole('button', { name: /Gardiens/ }));
    expect(screen.getByText('Aucune carte pour ce filtre')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gardiens/ }));
    fireEvent.click(within(screen.getByRole('list', { name: 'À acheter' })).getByRole('button', { name: 'Acheté ✓' }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toContainEqual(
      { slug: 'b', competition: 'eredivisie', status: 'owned', purchasePrice: 25 }));
  });

  it('achat envisagé : coût total avec achats ; un onglet par championnat', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { slug: 'a', competition: 'eredivisie', status: 'owned', purchasePrice: 20 },
      { slug: 'b', competition: 'eredivisie', status: 'target', purchasePrice: null },
    ]));
    render(<SquadBuilder competitions={competitions} teams={teams} />);
    await waitFor(() => expect(screen.getByText('Achats envisagés').parentElement).toHaveTextContent('30 €total avec l’effectif : 50 €'));
    expect(screen.getByRole('button', { name: /Eredivisie/ })).toHaveTextContent('2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ligue 1' })); });
    expect(screen.getByText(/Aucune carte dans ce championnat/)).toBeInTheDocument();
  });
});
