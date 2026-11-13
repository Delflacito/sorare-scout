import Link from 'next/link';
import { getQueries, type ClubMarketView, type MarketPlayerView } from '@/db/queries';
import { POSITION_LABEL_FR, cardLabel } from '@/domain/types';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { valueLabel } from '@/components/MarketCard';
import { ValueChart } from '@/components/ValueChart';
import { valueSeries, type ValueSeries } from '@/domain/market';
import { fmtChange, fmtEur, fmtScore } from '@/lib/format';
import { one, type SearchParams } from '@/lib/params';
import { seasonStart } from '@/ingest/leagues';
import { PSEUDO } from '@/lib/squad';
import { EnsurePseudo } from '@/components/MyCards';
import type { SquadEntry } from '@/components/SquadBuilder';

export const dynamic = 'force-dynamic';

const sum = (xs: (number | null)[]) => xs.reduce<number>((t, x) => t + (x ?? 0), 0);

/** Valeur actuelle (dernières ventes réelles des cartes de la saison) face à la valeur estimée par le modèle. */
function ActualVsFair({ history, fair }: { history: ValueSeries; fair: number }) {
  const actual = history.season.at(-1)?.raw ?? null;
  return (
    <>
      <div className="card"><div className="card-kicker">Valeur actuelle (ventes)</div><strong>{actual === null ? '—' : fmtEur(actual)}</strong>
        <div className="muted small">dernière vente de chaque joueur</div></div>
      <div className="card"><div className="card-kicker">Valeur estimée</div><strong>{fmtEur(fair)}</strong>
        {actual ? (
          <div className={`small ${fair > actual ? 'hot' : fair < actual ? 'cold' : 'muted'}`}>{fmtChange(fair / actual - 1)} par rapport à la valeur actuelle</div>
        ) : null}</div>
    </>
  );
}

function ClubsTable({ clubs, competition, yy, history }: { clubs: ClubMarketView[]; competition?: string; yy: string; history: ValueSeries }) {
  const total = sum(clubs.map((c) => c.totalFloor));
  return (
    <>
      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Clubs</div><strong>{clubs.length}</strong></div>
        <div className="card"><div className="card-kicker">Cartes cotées</div><strong>{sum(clubs.map((c) => c.priced))}</strong></div>
        <div className="card"><div className="card-kicker">Valeur totale (planchers)</div><strong>{fmtEur(total)}</strong></div>
        <ActualVsFair history={history} fair={sum(clubs.map((c) => c.totalFair))} />
      </div>
      <ValueChart series={history} yy={yy} subject="tous les clubs du championnat" />
      <div className="table-wrap">
        <table aria-label="Valeur des cartes par club">
          <thead>
            <tr><th>#</th><th>Club</th><th>Championnat</th><th>Cartes cotées</th><th>Valeur totale</th><th>Joueur le plus cher</th></tr>
          </thead>
          <tbody>
            {clubs.map((c, i) => (
              <tr key={c.slug}>
                <td className="rank">{i + 1}</td>
                <td>
                  <Link href={`/marche?club=${c.slug}${competition ? `&competition=${competition}` : ''}`} className="club-link">
                    <ClubLogo name={c.name} url={c.pictureUrl} />{c.name}
                  </Link>
                </td>
                <td>{c.competition}</td>
                <td className="num">{c.priced} / {c.players}</td>
                <td className="num strong">{fmtEur(c.totalFloor)}</td>
                <td>{c.topPlayer ? <>{c.topPlayer} <span className="muted">· {fmtEur(c.topPrice!)}</span></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Cartes possédées par joueur (Mon effectif) : nombre, total payé, cartes au prix d'achat inconnu. */
type Owned = Map<string, { count: number; paid: number; unknown: number }>;

function ownedBySlug(squad: SquadEntry[] | null): Owned {
  const m: Owned = new Map();
  for (const e of squad ?? []) {
    if (e.status !== 'owned') continue;
    const o = m.get(e.slug) ?? { count: 0, paid: 0, unknown: 0 };
    o.count += 1;
    if (e.purchasePrice === null) o.unknown += 1; else o.paid += e.purchasePrice;
    m.set(e.slug, o);
  }
  return m;
}

/** Ce que j'ai dans le club : total payé face à la valeur actuelle des mêmes cartes (prix de référence, sinon plancher). */
function MyClubCards({ players, owned }: { players: MarketPlayerView[]; owned: Owned }) {
  const mine = players.flatMap((p) => { const o = owned.get(p.slug); return o ? [{ p, o }] : []; });
  if (!mine.length) return <div className="card"><div className="card-kicker">Mes cartes du club</div><strong>0</strong></div>;
  const cards = mine.reduce((t, x) => t + x.o.count, 0);
  const paid = mine.reduce((t, x) => t + x.o.paid, 0);
  const unknown = mine.reduce((t, x) => t + x.o.unknown, 0);
  const value = mine.reduce((t, x) => t + x.o.count * (x.p.price ?? x.p.floorInSeason ?? 0), 0);
  const unpriced = mine.filter((x) => (x.p.price ?? x.p.floorInSeason) === null).reduce((t, x) => t + x.o.count, 0);
  return (
    <>
      <div className="card"><div className="card-kicker">Investi dans le club</div><strong>{fmtEur(paid)}</strong>
        <div className="muted small">{cards} carte{cards > 1 ? 's' : ''} possédée{cards > 1 ? 's' : ''}{unknown ? ` · ${unknown} prix d’achat inconnu${unknown > 1 ? 's' : ''}` : ''}</div></div>
      <div className="card"><div className="card-kicker">Valeur actuelle de mes cartes</div><strong>{fmtEur(value)}</strong>
        {paid > 0 && <div className={`small ${value > paid ? 'hot' : value < paid ? 'cold' : 'muted'}`}>{fmtChange(value / paid - 1)} par rapport à l’investi</div>}
        {unpriced > 0 && <div className="muted small">{unpriced} carte{unpriced > 1 ? 's' : ''} sans prix</div>}</div>
    </>
  );
}

function ClubPlayers({ players, yy, history, owned }: { players: MarketPlayerView[]; yy: string; history: ValueSeries; owned: Owned | null }) {
  const priced = players.filter((p) => p.floorInSeason !== null);
  return (
    <>
      <div className="summary-tiles">
        {owned && <MyClubCards players={players} owned={owned} />}
        <div className="card"><div className="card-kicker">Total planchers {yy}</div><strong>{fmtEur(sum(players.map((p) => p.floorInSeason)))}</strong>
          <div className="muted small">{priced.length} carte{priced.length > 1 ? 's' : ''} en vente sur {players.length} joueur{players.length > 1 ? 's' : ''}</div></div>
        <div className="card"><div className="card-kicker">Total planchers Classic</div><strong>{fmtEur(sum(players.map((p) => p.floorClassic)))}</strong></div>
        <ActualVsFair history={history} fair={sum(players.map((p) => p.fairPrice))} />
      </div>
      <ValueChart series={history} yy={yy} />
      <div className="table-wrap">
        <table aria-label="Prix des cartes du club">
          <thead>
            <tr>
              <th>Joueur</th><th>Carte</th><th>L15</th><th>Plancher {yy}</th><th>Plancher C</th><th>Dernière enchère</th><th>5 dern. ventes</th>
              <th>Valeur estimée</th><th>Écart</th><th>Potentiel GW</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const label = valueLabel(p.valueRatio);
              const mine = owned?.get(p.slug);
              return (
                <tr key={p.slug}>
                  <td>
                    <span className="player-cell">
                      {mine && <span className="owned-mark" title={`${mine.count} carte${mine.count > 1 ? 's' : ''} possédée${mine.count > 1 ? 's' : ''}`}
                        role="img" aria-label="Carte possédée">✓{mine.count > 1 ? `×${mine.count}` : ''}</span>}
                      <PlayerAvatar name={p.name} url={p.pictureUrl} size={32} />
                      <Link href={`/joueurs/${p.slug}?onglet=marche`}>{p.name}</Link>
                    </span>
                  </td>
                  <td>
                    {cardLabel(p.cardPositions)}
                    {p.usualPosition && <span className="muted small"> · {POSITION_LABEL_FR[p.usualPosition]}</span>}
                  </td>
                  <td className="num">{p.l15 === null ? '—' : fmtScore(p.l15)}</td>
                  <td className="num strong">{p.floorInSeason === null ? '—' : fmtEur(p.floorInSeason)}</td>
                  <td className="num">{p.floorClassic === null ? '—' : fmtEur(p.floorClassic)}</td>
                  <td className="num">{p.lastAuction === null ? '—' : fmtEur(p.lastAuction.eur)}</td>
                  <td className="num">{p.recentPrice === null ? '—' : fmtEur(p.recentPrice)}</td>
                  <td className="num">{p.fairPrice === null ? '—' : fmtEur(p.fairPrice)}</td>
                  <td className={`num ${label?.tone ?? ''}`}>{p.valueRatio === null ? '—' : fmtChange(1 - p.valueRatio)}</td>
                  <td className={`num ${p.potentialGain === null ? '' : p.potentialGain > 0 ? 'hot' : p.potentialGain < 0 ? 'cold' : ''}`}>
                    {p.potentialGain === null ? '—' : fmtChange(p.potentialGain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="history-total">
              <td>Total</td><td /><td />
              <td className="num">{fmtEur(sum(players.map((p) => p.floorInSeason)))}</td>
              <td className="num">{fmtEur(sum(players.map((p) => p.floorClassic)))}</td>
              <td /><td /><td className="num">{fmtEur(sum(players.map((p) => p.fairPrice)))}</td><td /><td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export default async function MarchePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const competition = one(p.competition);
  const club = one(p.club);
  const cartesRaw = one(p.cartes)?.toLowerCase();
  const cartes = cartesRaw && PSEUDO.test(cartesRaw) ? cartesRaw : undefined;
  const queries = getQueries();
  const [competitions, teams] = await Promise.all([queries.listCompetitions(), queries.listTeams()]);
  const clubTeam = club ? teams.find((t) => t.slug === club) : undefined;
  const yy = String(new Date(seasonStart()).getUTCFullYear() % 100).padStart(2, '0');
  // Championnat choisi : courbe de la valeur estimée de tous ses clubs (pas de courbe pour « toutes les ligues »).
  const leagueView = async () => {
    const [clubs, prices] = await Promise.all([queries.getClubsMarket(competition), competition ? queries.getDailyPrices({ competition }) : []]);
    return <ClubsTable clubs={clubs} competition={competition} yy={yy} history={valueSeries(prices)} />;
  };
  const clubView = async (team: string) => {
    const [players, prices, squad] = await Promise.all([queries.getMarketPlayers({ team }), queries.getDailyPrices({ team }),
      cartes ? queries.getSquad(cartes) : null]);
    return <ClubPlayers players={players} yy={yy} history={valueSeries(prices)} owned={cartes ? ownedBySlug(squad) : null} />;
  };

  return (
    <main>
      <h1>{clubTeam ? `Marché · ${clubTeam.name}` : 'Marché'}</h1>
      <p className="subtitle">Cartes Limited · plancher = carte la moins chère en vente ({yy} = saison en cours, C = Classic)</p>
      <form className="filters" method="get">
        <select name="competition" defaultValue={competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select name="club" defaultValue={club ?? ''} aria-label="Club">
          <option value="">Tous les clubs</option>
          {teams.filter((t) => !competition || t.competitionSlug === competition).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
        <button type="submit">Appliquer</button>
      </form>
      {clubTeam && <EnsurePseudo href={`/marche?club=${clubTeam.slug}${competition ? `&competition=${competition}` : ''}`} present={!!cartes} quiet />}
      {clubTeam && <p><Link href={competition ? `/marche?competition=${competition}` : '/marche'}>← Tous les clubs</Link></p>}
      {clubTeam
        ? await clubView(clubTeam.slug)
        : await leagueView()}
    </main>
  );
}
