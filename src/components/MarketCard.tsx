import Link from 'next/link';
import type { PlayerMarketView } from '@/db/queries';
import { fmtChange, fmtEur } from '@/lib/format';

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

/** Lecture de l'écart prix / valeur estimée : sous 0,8 la carte est bon marché pour ses performances, au-dessus de 1,25 chère. */
export function valueLabel(ratio: number | null): { text: string; tone: 'hot' | 'cold' | 'neutral' } | null {
  if (ratio === null) return null;
  if (ratio < 0.8) return { text: `Sous-évalué ${fmtChange(ratio - 1)}`, tone: 'hot' };
  if (ratio > 1.25) return { text: `Surévalué ${fmtChange(ratio - 1)}`, tone: 'cold' };
  return { text: `Prix juste ${fmtChange(ratio - 1)}`, tone: 'neutral' };
}

/** Prix Limited : planchers (saison en cours et Classic), valeur estimée d'après les performances et potentiel avant le prochain match. */
export function MarketCard({ market, season, href }: { market: PlayerMarketView | null; season: number; href?: string }) {
  const label = valueLabel(market?.valueRatio ?? null);
  const yy = String(season % 100).padStart(2, '0');
  return (
    <section className="card" aria-label="Marché Limited">
      <h2 className="card-title">Marché <span>Limited</span></h2>
      {!market ? <p className="empty">Prix pas encore importés</p> : (
        <>
          <dl className="market-floors">
            <div><dt><span className="season-chip">{yy}</span> Plancher</dt><dd>{market.floorInSeason === null ? '—' : fmtEur(market.floorInSeason)}</dd></div>
            <div><dt><span className="season-chip classic">C</span> Plancher</dt><dd>{market.floorClassic === null ? '—' : fmtEur(market.floorClassic)}</dd></div>
            <div>
              <dt>5 dernières ventes {yy}</dt>
              <dd>
                {market.recentPrice === null ? '—' : fmtEur(market.recentPrice)}
                {market.priceTrend7 !== null && (
                  <small className={market.priceTrend7 > 0 ? 'hot' : market.priceTrend7 < 0 ? 'cold' : ''} title="Évolution sur 7 jours"> {fmtChange(market.priceTrend7)} 7 j</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Dernière enchère {yy}</dt>
              <dd>
                {market.lastAuction === null ? '—' : fmtEur(market.lastAuction.eur)}
                {market.lastAuction && <small className="muted"> {fmtDay(market.lastAuction.date)}</small>}
              </dd>
            </div>
          </dl>
          <div className="market-estimates">
            <div>
              <div className="card-kicker">Valeur estimée</div>
              <strong>{market.fairPrice === null ? '—' : fmtEur(market.fairPrice)}</strong>
              {label && <span className={`badge-pill ${label.tone === 'hot' ? 'good' : label.tone === 'cold' ? 'critical' : 'neutral'}`}>{label.text}</span>}
            </div>
            <div>
              <div className="card-kicker">Prix potentiel avant la GW</div>
              <strong>{market.potentialPrice === null ? '—' : fmtEur(market.potentialPrice)}</strong>
              {market.potentialGain !== null && (
                <span className={market.potentialGain > 0 ? 'hot' : market.potentialGain < 0 ? 'cold' : ''}> {fmtChange(market.potentialGain)}</span>
              )}
            </div>
          </div>
          {href && <Link href={href} className="card-link">Voir les ventes →</Link>}
        </>
      )}
    </section>
  );
}
