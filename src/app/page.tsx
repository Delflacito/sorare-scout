import Link from 'next/link';
import { getQueries, type GameWeekPlayer, type TradingRow } from '@/db/queries';
import { ClubLogo, PlayerAvatar } from '@/components/Media';
import { ScorePill } from '@/components/ScorePill';
import { Venue } from '@/components/Venue';
import { BeforeGw } from '@/components/BeforeGw';
import { fmtChange, fmtEur, roundLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SHORTCUTS = [
  { href: '/game-week', icon: '📋', title: 'Ma Game Week', text: 'Meilleurs scores potentiels de la prochaine journée, poste par poste' },
  { href: '/journee', icon: '🗓️', title: 'Journée', text: 'Ce que chaque adversaire concède, poste par poste' },
  { href: '/joueurs', icon: '🔎', title: 'Joueurs', text: 'Explorer et trier tous les joueurs suivis' },
  { href: '/trading', icon: '📈', title: 'Trading', text: 'Cartes sous-évaluées et hausses attendues avant la GW' },
  { href: '/marche', icon: '💶', title: 'Marché', text: 'Prix des cartes de chaque club et valeur totale' },
  { href: '/effectif', icon: '🧩', title: 'Mon effectif', text: 'Prix d’achat, valeur actuelle et achats envisagés' },
] as const;

function PlayerLine({ slug, name, pictureUrl, team, teamPictureUrl, children }: {
  slug: string; name: string; pictureUrl: string | null; team: string | null; teamPictureUrl: string | null; children: React.ReactNode;
}) {
  return (
    <li className="home-line">
      <span className="player-cell">
        <PlayerAvatar name={name} url={pictureUrl} size={30} />
        <Link href={`/joueurs/${slug}`}>{name}</Link>
        {team && <ClubLogo name={team} url={teamPictureUrl} size={16} />}
      </span>
      <span className="home-line-value">{children}</span>
    </li>
  );
}

function Panel({ title, href, empty, children }: { title: string; href: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="card home-panel" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      {empty ? <p className="empty">Pas encore de données : elles apparaîtront après le prochain import.</p> : <ol className="home-list">{children}</ol>}
      <Link href={href} className="card-link">Tout voir →</Link>
    </section>
  );
}

export default async function Home() {
  const queries = getQueries();
  const fixtures = await queries.getGameWeekFixtures();
  const ids = fixtures.map((f) => f.id);
  const [gwPlayers, cheap, rising] = await Promise.all([
    queries.getGameWeekPlayers(ids, { minStartRate: 0.6, limit: 5 }),
    queries.getTrading({ view: 'sous', limit: 5 }),
    queries.getTrading({ view: 'gw', fixtureIds: ids, limit: 5 }),
  ]);
  // Une ligne par joueur (une carte à deux postes apparaît dans deux sections), les 5 meilleurs scores.
  const top: GameWeekPlayer[] = [...new Map(gwPlayers.map((p) => [p.slug, p])).values()].sort((a, b) => b.projected - a.projected).slice(0, 5);
  const line = (r: TradingRow) => ({ slug: r.slug, name: r.name, pictureUrl: r.pictureUrl, team: r.team, teamPictureUrl: r.teamPictureUrl });

  return (
    <main>
      <section className="home-hero">
        <h1>Sorare Scout</h1>
        <p>
          {fixtures.length ? <>Prochaine journée : <strong>{roundLabel(fixtures)}</strong></> : 'Aucune journée programmée pour le moment'}
        </p>
      </section>

      <BeforeGw />

      <div className="home-shortcuts">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="card home-shortcut">
            <span className="home-icon" aria-hidden="true">{s.icon}</span>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </Link>
        ))}
      </div>

      <div className="cards home-panels">
        <Panel title="Top scores potentiels de la journée" href="/game-week" empty={!top.length}>
          {top.map((p) => (
            <PlayerLine key={p.slug} slug={p.slug} name={p.name} pictureUrl={p.pictureUrl} team={p.team} teamPictureUrl={p.teamPictureUrl}>
              <Venue isHome={p.isHome} /> <span className="muted small">{p.opponent}</span> <ScorePill score={p.projected} size="sm" />
            </PlayerLine>
          ))}
        </Panel>
        <Panel title="Cartes sous-évaluées" href="/trading" empty={!cheap.length}>
          {cheap.map((r) => (
            <PlayerLine key={r.slug} {...line(r)}>
              {fmtEur(r.price)} <span className="hot small">{r.valueRatio === null ? '' : fmtChange(1 - r.valueRatio)}</span>
            </PlayerLine>
          ))}
        </Panel>
        <Panel title="Hausses attendues avant la GW" href="/trading?vue=gw" empty={!rising.length}>
          {rising.map((r) => (
            <PlayerLine key={r.slug} {...line(r)}>
              {fmtEur(r.price)} → {r.potentialPrice === null ? '—' : fmtEur(r.potentialPrice)}
              <span className="hot small"> {r.potentialGain === null ? '' : fmtChange(r.potentialGain)}</span>
            </PlayerLine>
          ))}
        </Panel>
      </div>
    </main>
  );
}
