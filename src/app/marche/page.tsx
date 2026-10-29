import Link from 'next/link';
import { getQueries, type ClubMarketView, type MarketPlayerView } from '@/db/queries';
import { POSITION_LABEL_FR, cardLabel } from '@/domain/types';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { valueLabel } from '@/components/MarketCard';
import { fmtChange, fmtEur, fmtScore } from '@/lib/format';
import { one, type SearchParams } from '@/lib/params';
import { seasonStart } from '@/ingest/leagues';

export const dynamic = 'force-dynamic';

const sum = (xs: (number | null)[]) => xs.reduce<number>((t, x) => t + (x ?? 0), 0);

function ClubsTable({ clubs, competition }: { clubs: ClubMarketView[]; competition?: string }) {
  const total = sum(clubs.map((c) => c.totalFloor));
  return (
    <>
      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Clubs</div><strong>{clubs.length}</strong></div>
        <div className="card"><div className="card-kicker">Cartes cotées</div><strong>{sum(clubs.map((c) => c.priced))}</strong></div>
        <div className="card"><div className="card-kicker">Valeur totale (planchers)</div><strong>{fmtEur(total)}</strong></div>
      </div>
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

function ClubPlayers({ players, yy }: { players: MarketPlayerView[]; yy: string }) {
  const priced = players.filter((p) => p.floorInSeason !== null);
  return (
    <>
      <div className="summary-tiles">
        <div className="card"><div className="card-kicker">Total planchers {yy}</div><strong>{fmtEur(sum(players.map((p) => p.floorInSeason)))}</strong>
          <div className="muted small">{priced.length} carte{priced.length > 1 ? 's' : ''} en vente sur {players.length} joueur{players.length > 1 ? 's' : ''}</div></div>
        <div className="card"><div className="card-kicker">Total planchers Classic</div><strong>{fmtEur(sum(players.map((p) => p.floorClassic)))}</strong></div>
        <div className="card"><div className="card-kicker">Total valeur estimée</div><strong>{fmtEur(sum(players.map((p) => p.fairPrice)))}</strong></div>
      </div>
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
              return (
                <tr key={p.slug}>
                  <td>
                    <span className="player-cell">
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
  const queries = getQueries();
  const [competitions, teams] = await Promise.all([queries.listCompetitions(), queries.listTeams()]);
  const clubTeam = club ? teams.find((t) => t.slug === club) : undefined;
  const yy = String(new Date(seasonStart()).getUTCFullYear() % 100).padStart(2, '0');

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
      {clubTeam && <p><Link href={competition ? `/marche?competition=${competition}` : '/marche'}>← Tous les clubs</Link></p>}
      {clubTeam
        ? <ClubPlayers players={await queries.getMarketPlayers({ team: clubTeam.slug })} yy={yy} />
        : <ClubsTable clubs={await queries.getClubsMarket(competition)} competition={competition} />}
    </main>
  );
}
