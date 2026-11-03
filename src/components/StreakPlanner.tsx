'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StreakFixture } from '@/db/queries';
import { GENERIC_LABEL_FR } from '@/domain/types';
import { fmtPct } from '@/lib/format';
import { ScorePill } from './ScorePill';
import type { StreakPlan } from '@/lib/streakPlans';

export interface StreakDay { key: string; label: string; fixtures: (StreakFixture & { time: string })[] }

const KEY = 'sorare-scout:streak-selection';
const pick = (fixtureId: number, slug: string) => `${fixtureId}:${slug}`;

/**
 * Matchs jour par jour (sous-listes repliables par jour et par club) et sélection des joueurs à aligner,
 * mémorisée dans ce navigateur, avec le total potentiel de la sélection par jour.
 */
export function StreakPlanner({ days, pseudo }: { days: StreakDay[]; pseudo?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlySelected, setOnlySelected] = useState(false);
  const [plans, setPlans] = useState<StreakPlan[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  // Enregistrer avant d'avoir lu les sélections existantes les écraserait : on attend la lecture.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { setSelected(new Set(JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as string[])); } catch { /* stockage indisponible */ }
    if (pseudo) {
      fetch(`/api/streak-plans?user=${encodeURIComponent(pseudo)}`).then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((b) => { setPlans(b.plans ?? []); setLoaded(true); })
        .catch(() => setStatus('Sélections enregistrées indisponibles : recharge la page pour en enregistrer'));
    }
  }, [pseudo]);
  const keep = (next: Set<string>) => {
    setSelected(next);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* stockage indisponible */ }
  };
  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    keep(next);
  };
  // Les sélections enregistrées sont envoyées en entier au serveur à chaque changement.
  const savePlans = (next: StreakPlan[], message: string) => {
    setPlans(next);
    if (!pseudo) return;
    fetch(`/api/streak-plans?user=${encodeURIComponent(pseudo)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plans: next }) })
      .then((r) => setStatus(r.ok ? message : 'Échec de l’enregistrement, réessaie'))
      .catch(() => setStatus('Échec de l’enregistrement (réseau)'));
  };
  const saveNew = () => {
    const plan = { id: Date.now().toString(36), name: name.trim(), picks: [...selected] };
    savePlans([...plans, plan], `« ${plan.name} » enregistrée`);
    setEditing(plan.id);
  };
  const saveEdit = () => savePlans(plans.map((p) => (p.id === editing ? { ...p, name: name.trim(), picks: [...selected] } : p)), `« ${name.trim()} » mise à jour`);
  const open = (p: StreakPlan) => { keep(new Set(p.picks)); setEditing(p.id); setName(p.name); setStatus(''); };
  const remove = (p: StreakPlan) => {
    if (!loaded || !window.confirm(`Supprimer la sélection « ${p.name} » ?`)) return;
    savePlans(plans.filter((x) => x.id !== p.id), `« ${p.name} » supprimée`);
    if (editing === p.id) { setEditing(null); setName(''); }
  };
  const fresh = () => { keep(new Set()); setEditing(null); setName(''); setStatus(''); };

  return (
    <>
      <section className="card streak-plans" aria-label="Mes sélections">
        <h2 className="card-title">Mes sélections<span>{plans.length}</span></h2>
        {plans.length > 0 && (
          <ul className="streak-plan-list">
            {plans.map((p) => (
              <li key={p.id} className={editing === p.id ? 'is-open' : ''}>
                <span className="streak-plan-name">{p.name} <span className="muted small">{p.picks.length} joueur{p.picks.length > 1 ? 's' : ''}</span></span>
                <button type="button" className="chip" onClick={() => open(p)} aria-label={`Ouvrir ${p.name}`}>{editing === p.id ? 'Ouverte' : 'Ouvrir'}</button>
                <button type="button" className="link-btn" onClick={() => remove(p)} aria-label={`Supprimer ${p.name}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {pseudo ? (
          <form className="streak-save" onSubmit={(e) => { e.preventDefault(); if (editing) saveEdit(); else saveNew(); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nom de la sélection (ex. GW 12 Eredivisie)"
              aria-label="Nom de la sélection" />
            <button type="submit" disabled={!loaded || !name.trim() || selected.size === 0}>{editing ? 'Enregistrer les modifications' : 'Enregistrer la sélection'}</button>
            {editing && <button type="button" className="secondary" disabled={!loaded || !name.trim() || selected.size === 0} onClick={saveNew}>Enregistrer comme nouvelle</button>}
            {(editing || selected.size > 0) && <button type="button" className="secondary" onClick={fresh}>Nouvelle sélection</button>}
          </form>
        ) : <p className="muted small">Importe ta galerie dans Mon effectif pour enregistrer tes sélections.</p>}
        {status && <p className="small" role="status">{status}</p>}
      </section>
      <div className="streak-tools chip-row">
        <button type="button" className="chip" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>Seulement ma sélection ({selected.size})</button>
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
