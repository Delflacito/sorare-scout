import Link from 'next/link';
import { getQueries, type TradingRow, type TradingView } from '@/db/queries';
import { GENERIC_LABEL_FR, POSITION_LABEL_FR, cardLabel, type GenericPosition } from '@/domain/types';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { Venue } from '@/components/Venue';
import { ScorePill } from '@/components/ScorePill';
import { fmtChange, fmtDate, fmtEur, fmtScore, roundLabel } from '@/lib/format';
import { one, oneOf, type SearchParams } from '@/lib/params';

export const dynamic = 'force-dynamic';

const VIEWS: [TradingView, string][] = [['sous', 'Sous-évalués'], ['sur', 'Surévalués'], ['gw', 'Hausse avant la GW']];
const GENERIC = Object.keys(GENERIC_LABEL_FR) as GenericPosition[];
const LIMIT = 50;

/** Forme : L5 nettement au-dessus (↗) ou en dessous (↘) du L15. */
function Form({ r }: { r: TradingRow }) {
  const d = r.l5 - r.l15;
  const arrow = d >= 5 ? '↗' : d <= -5 ? '↘' : '→';
  return (
    <td className={`num ${d >= 5 ? 'hot' : d <= -5 ? 'cold' : ''}`} title={`L5 ${fmtScore(r.l5)} · L15 ${fmtScore(r.l15)}`}>
      {arrow} {Math.round(r.l5)}
    </td>
  );
}

const Change = ({ value }: { value: number | null }) => (
  <span className={value === null ? '' : value > 0 ? 'hot' : value < 0 ? 'cold' : ''}>{value === null ? '—' : fmtChange(value)}</span>
);

function PlayerCell({ r }: { r: TradingRow }) {
  return (
    <span className="player-cell">
      <PlayerAvatar name={r.name} url={r.pictureUrl} size={32} />
      <Link href={`/joueurs/${r.slug}?onglet=marche`}>{r.name}</Link>
      {r.team && <ClubLogo name={r.team} url={r.teamPictureUrl} size={16} />}
    </span>
  );
}

function NextMatch({ r }: { r: TradingRow }) {
  if (!r.nextOpponent) return <>—</>;
  return (
    <>
      <span className="club-link">
        {r.nextIsHome !== null && <Venue isHome={r.nextIsHome} />}
        <ClubLogo name={r.nextOpponent} url={r.nextOpponentPictureUrl} />{r.nextOpponent}
      </span>
      {r.nextDate && <div className="muted small">{fmtDate(r.nextDate)}</div>}
    </>
  );
}

function ValueTable({ rows, view }: { rows: TradingRow[]; view: 'sous' | 'sur' }) {
  return (
    <div className="table-wrap">
      <table aria-label={view === 'sous' ? 'Joueurs sous-évalués' : 'Joueurs surévalués'}>
        <thead>
          <tr>
            <th>#</th><th>Joueur</th><th>Carte</th><th>Prix</th><th>Valeur estimée</th><th><abbr title="Écart entre le prix et la valeur estimée (positif = carte moins chère que sa valeur)">Écart</abbr></th>
            <th><abbr title="L5 comparé au L15 : ↗ en forme, ↘ en baisse">Forme</abbr></th><th><abbr title="Évolution du prix des ventes sur 7 jours">Prix 7 j</abbr></th><th>Prochain match</th><th>Potentiel GW</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.slug}>
              <td className="rank">{i + 1}</td>
              <td><PlayerCell r={r} /></td>
              <td>
                {cardLabel(r.cardPositions)}
                {r.usualPosition && <span className="muted small"> · {POSITION_LABEL_FR[r.usualPosition]}</span>}
              </td>
              <td className="num strong">{fmtEur(r.price)}</td>
              <td className="num">{r.fairPrice === null ? '—' : fmtEur(r.fairPrice)}</td>
              <td className="num"><Change value={r.valueRatio === null ? null : -(r.valueRatio - 1)} /></td>
              <Form r={r} />
              <td className="num"><Change value={r.priceTrend7} /></td>
              <td><NextMatch r={r} /></td>
              <td className="num"><Change value={r.potentialGain} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GwTable({ rows }: { rows: TradingRow[] }) {
  return (
    <div className="table-wrap">
      <table aria-label="Hausse attendue avant la Game Week">
        <thead>
          <tr>
            <th>#</th><th>Joueur</th><th>Match</th><th>Score potentiel</th><th>L15</th>
            <th>Prix actuel</th><th>Prix potentiel</th><th>Plus-value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.slug}>
              <td className="rank">{i + 1}</td>
              <td><PlayerCell r={r} /></td>
              <td><NextMatch r={r} /></td>
              <td><ScorePill score={r.nextProjected} /></td>
              <td className="num">{fmtScore(r.l15)}</td>
              <td className="num">{fmtEur(r.price)}</td>
              <td className="num strong">{r.potentialPrice === null ? '—' : fmtEur(r.potentialPrice)}</td>
              <td className="num">
                <Change value={r.potentialGain} />
                {r.potentialPrice !== null && (
                  <div className="muted small">{r.potentialPrice >= r.price ? '+' : '−'}{fmtEur(Math.abs(r.potentialPrice - r.price))}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TradingPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams;
  const view = oneOf(one(p.vue), VIEWS.map((v) => v[0])) ?? 'sous';
  const competition = one(p.competition);
  const position = oneOf(one(p.position), GENERIC);
  const maxPrice = Number(one(p.prixMax)) || undefined;
  const queries = getQueries();
  const [competitions, fixtures] = await Promise.all([queries.listCompetitions(), view === 'gw' ? queries.getGameWeekFixtures(competition) : []]);
  const rows = await queries.getTrading({ view, competition, position, maxPrice, fixtureIds: fixtures.map((f) => f.id), limit: LIMIT });
  const href = (vue: TradingView) => {
    const qs = new URLSearchParams(Object.entries({ vue: vue === 'sous' ? undefined : vue, competition, position, prixMax: maxPrice ? String(maxPrice) : undefined })
      .filter(([, v]) => v) as [string, string][]);
    return `/trading${qs.size ? `?${qs}` : ''}`;
  };

  return (
    <main>
      <h1>Trading</h1>
      <p className="subtitle">Cartes Limited de la saison en cours · prix en euros</p>
      <nav className="tabs" aria-label="Analyse">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={href(v)} aria-current={view === v ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      <form className="filters" method="get">
        {view !== 'sous' && <input type="hidden" name="vue" value={view} />}
        <select name="competition" defaultValue={competition ?? ''} aria-label="Compétition">
          <option value="">Toutes les ligues</option>
          {competitions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select name="position" defaultValue={position ?? ''} aria-label="Poste (carte)">
          <option value="">Tous les postes (carte)</option>
          {GENERIC.map((g) => <option key={g} value={g}>{GENERIC_LABEL_FR[g]}</option>)}
        </select>
        <input name="prixMax" type="number" min="1" step="1" placeholder="Prix max (€)" defaultValue={maxPrice} aria-label="Prix maximum" />
        <button type="submit">Appliquer</button>
      </form>
      <p className="note">
        {view === 'gw' ? (
          <>
            Prochaine journée {fixtures.length ? `(${roundLabel(fixtures).toLowerCase()})` : ''} : joueurs disponibles, titulaires réguliers,
            classés par plus-value attendue si leur score suit le score potentiel. Le marché anticipe souvent les bons matchs :
            l’écart se joue avant le début de la GW.
          </>
        ) : (
          <>
            Écart entre le prix (carte de la saison la moins chère en vente) et la valeur estimée d’après le profil du joueur (L15, forme,
            All-Around, temps de jeu, statut Sorare, buts et passes de la saison passée, sélection, âge, poste, championnat, force et
            cote de son club), calculée sur tout le marché. Forme ↗ : L5 au-dessus du L15 ; Prix 7 j : évolution
            des ventes sur une semaine. Une carte sous-évaluée en forme et dont le prix commence à monter est la piste la plus solide.
          </>
        )}
        {' '}Estimations indicatives.
      </p>
      {rows.length === 0 ? (
        <p className="empty">Aucun joueur pour ces filtres. Essaie un prix max plus élevé ou une autre ligue (les prix sont mis à jour à chaque import).</p>
      ) : view === 'gw' ? <GwTable rows={rows} /> : <ValueTable rows={rows} view={view} />}
    </main>
  );
}
