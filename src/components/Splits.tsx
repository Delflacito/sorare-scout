import { ScorePill } from '@/components/ScorePill';
import { MIN_GAMES, contextLabel, nextCell, tierCode, tierName, type PlayerSplits, type SplitCell } from '@/domain/splits';
import { fmtScore } from '@/lib/format';

/** Ton de la pastille : favorable / défavorable au prochain match, sinon neutre. */
function hintTone(s: PlayerSplits): 'good' | 'bad' | '' {
  const good = s.notes.some((n) => n.next === 'good');
  const bad = s.notes.some((n) => n.next === 'bad');
  return good && !bad ? 'good' : bad && !good ? 'bad' : '';
}

/** Étiquettes courtes (« AA D·T3 +14 ») : vert au-dessus de sa moyenne, rouge en dessous ; cerclées si elles concernent le prochain match. */
export function NoteTags({ s }: { s: PlayerSplits }) {
  return (
    <ul className="split-tags">
      {s.notes.map((n) => (
        <li key={n.tag} className={`${n.tone} ${n.next ? 'is-next' : ''}`}
          title={`${n.text}${n.next ? ` · ${n.next === 'good' ? 'favorable' : 'défavorable'} au prochain match` : ''}`}>
          {n.tag}
        </li>
      ))}
    </ul>
  );
}

/** « D domicile · E extérieur · T1 1-6 · T2 7-12 · T3 13-18 ». */
export const legend = (s: PlayerSplits) =>
  `D dom. · E ext. · ${s.tiers.map((t, i) => `${tierCode(s.tiers, i)} ${t.from}-${t.to}`).join(' · ')} · écart à sa moyenne`;

/**
 * Pastille qui ouvre, au survol ou au toucher, les traits marquants du joueur (lieu, niveau de l'adversaire, AA, décisif).
 * Rien n'est affiché quand le profil est lisse.
 */
export function SplitHint({ s }: { s: PlayerSplits | undefined }) {
  if (!s || !s.notes.length) return null;
  const tone = hintTone(s);
  const ctx = contextLabel(s);
  const c = nextCell(s);
  return (
    <span className={`split-hint ${tone}`} tabIndex={0} aria-label={`Profil : ${s.notes.map((n) => n.text).join(' ; ')}`}>
      {tone === 'good' ? '▲' : tone === 'bad' ? '▼' : '◆'}
      <span className="split-pop" role="tooltip">
        <NoteTags s={s} />
        {ctx && <span className="split-ctx">Prochain <strong>{ctx}</strong>{c ? ` · moy. ${fmtScore(c.score)} (${c.games} m.)` : ' · pas encore joué'}</span>}
        <span className="split-legend">{legend(s)}</span>
      </span>
    </span>
  );
}

function Cell({ c, next }: { c: SplitCell | null; next?: boolean }) {
  return (
    <td className={`split-cell ${!c || c.games < MIN_GAMES ? 'thin' : ''} ${next ? 'is-next' : ''}`}>
      {c ? (
        <>
          <ScorePill score={c.score} size="sm" />
          <span className="split-sub">AA {fmtScore(c.allAround)} · Déc {fmtScore(c.decisive)}</span>
          <span className="split-sub">{c.games} m.</span>
        </>
      ) : '—'}
    </td>
  );
}

/** Grille de la fiche joueur : tranche de l'adversaire au classement actuel × lieu, avec les commentaires. */
export function SplitsCard({ s }: { s: PlayerSplits | undefined }) {
  if (!s) return null;
  return (
    <section className="card splits-card" aria-labelledby="splits-title">
      <h2 className="card-title" id="splits-title">Lieu et adversaire <span>Championnat, saison en cours · classement actuel</span></h2>
      {s.notes.length ? <NoteTags s={s} /> : <p className="card-kicker">Profil régulier : pas d’écart marquant selon le lieu ou l’adversaire.</p>}
      <div className="table-wrap">
        <table aria-label="Moyennes selon le lieu et l’adversaire">
          <thead>
            <tr><th>Adversaire</th><th>Domicile</th><th>Extérieur</th><th>Tous</th></tr>
          </thead>
          <tbody>
            {s.tiers.map((t, i) => (
              <tr key={i}>
                <th scope="row" title={`Contre le ${tierName(s.tiers, i)}`}>{tierCode(s.tiers, i)} <small>{t.from}-{t.to}</small></th>
                <Cell c={s.cells[i].home} next={s.next?.tier === i && s.next.venue === 'home'} />
                <Cell c={s.cells[i].away} next={s.next?.tier === i && s.next.venue === 'away'} />
                <Cell c={s.byTier[i]} />
              </tr>
            ))}
            <tr>
              <th scope="row">Tous</th>
              <Cell c={s.venue.home} />
              <Cell c={s.venue.away} />
              <Cell c={s.overall} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="card-kicker">{legend(s)}. Encadré : prochain match. Grisé : moins de {MIN_GAMES} matchs.</p>
    </section>
  );
}
