'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StreakFixture } from '@/db/queries';
import { GENERIC_LABEL_FR } from '@/domain/types';
import { fmtPct } from '@/lib/format';
import { ScorePill } from './ScorePill';

export interface StreakDay { key: string; label: string; fixtures: (StreakFixture & { time: string })[] }

const KEY = 'sorare-scout:streak-selection';
const pick = (fixtureId: number, slug: string) => `${fixtureId}:${slug}`;

/**
 * Matchs jour par jour (sous-listes repliables par jour et par club) et sélection des joueurs à aligner,
 * mémorisée dans ce navigateur, avec le total potentiel de la sélection par jour.
 */
export function StreakPlanner({ days }: { days: StreakDay[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlySelected, setOnlySelected] = useState(false);
  useEffect(() => {
    try { setSelected(new Set(JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as string[])); } catch { /* stockage indisponible */ }
  }, []);
  const toggle = (k: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(k)) next.delete(k); else next.add(k);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* stockage indisponible */ }
    return next;
  });
  const clear = () => { setSelected(new Set()); try { window.localStorage.removeItem(KEY); } catch { /* stockage indisponible */ } };

  return (
    <>
      <div className="streak-tools chip-row">
        <button type="button" className="chip" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>Seulement ma sélection</button>
        {selected.size > 0 && <button type="button" className="chip" onClick={clear}>Vider la sélection ({selected.size})</button>}
      </div>
      <div className="streak-days">
        {days.map((d) => {
          const all = d.fixtures.flatMap((f) => f.mine.map((m) => ({ f, m })));
          const sel = all.filter(({ f, m }) => selected.has(pick(f.id, m.slug)));
          const total = sel.reduce((t, { m }) => t + (m.projected ?? 0), 0);
          return (
            <details key={d.key} className="card streak-day" open={all.length > 0}>
              <summary>
                <span className="streak-day-title">{d.label}</span>
                <span className="muted small">
                  {all.length} de tes joueurs · {d.fixtures.length} match{d.fixtures.length > 1 ? 's' : ''}
                  {sel.length > 0 && <> · <strong className="streak-sel">{sel.length} sélectionné{sel.length > 1 ? 's' : ''}, {Math.round(total)} pts potentiels</strong></>}
                </span>
              </summary>
              <ul className="streak-fixtures">
                {d.fixtures.map((f) => {
                  const mine = onlySelected ? f.mine.filter((m) => selected.has(pick(f.id, m.slug))) : f.mine;
                  if (onlySelected && !mine.length) return null;
                  const clubs = [f.home, f.away].map((club) => ({ club, players: mine.filter((m) => m.team === club) })).filter((c) => c.players.length);
                  return (
                    <li key={f.id}>
                      <div className="streak-match"><span className="muted">{f.time}</span> <strong>{f.home}</strong> – <strong>{f.away}</strong></div>
                      {clubs.map(({ club, players }) => (
                        <details key={club} className="streak-club" open>
                          <summary>{club} <span className="muted small">{players.length}</span></summary>
                          <ul className="streak-mine" aria-label={`Tes joueurs, ${club}`}>
                            {players.map((m) => {
                              const k = pick(f.id, m.slug);
                              return (
                                <li key={m.slug} className={selected.has(k) ? 'is-selected' : ''}>
                                  <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} aria-label={`Sélectionner ${m.name}`} />
                                  <span className="streak-pos">{m.positions.map((x) => GENERIC_LABEL_FR[x][0]).join('/')}</span>
                                  <Link href={`/joueurs/${m.slug}`}>{m.name}</Link>
                                  <span className="muted small">titu {m.startRate === null ? '—' : fmtPct(m.startRate)}</span>
                                  {m.projected !== null && <ScorePill score={m.projected} size="sm" title="Score potentiel" />}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </>
  );
}
