import type { Queries } from '@/db/queries';
import { beforeGwFor, type LeagueCheck } from '@/lib/beforeGw';

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Texte de l'alerte : championnats qui commencent dans les `hours` heures et où une carte pose problème ; null si rien. */
export function alertText(leagues: LeagueCheck[], now = Date.now(), hours = 36): string | null {
  const due = leagues.filter((l) => l.firstKickoff && Date.parse(l.firstKickoff) - now <= hours * 3_600_000 && l.issues.length);
  if (!due.length) return null;
  return due.map((l) => `${l.name} (${fmt(l.firstKickoff!)})\n${l.issues.map((i) => `- ${i.name}, ${i.team} : ${i.issue}`).join('\n')}`).join('\n\n');
}

/** Notification ntfy des cartes à vérifier avant la Game Week ; sans ALERT_PSEUDO ou NTFY_TOPIC, ne fait rien. */
export async function sendAlert(queries: Queries, env = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!env.ALERT_PSEUDO || !env.NTFY_TOPIC) return false;
  const text = alertText(await beforeGwFor(queries, env.ALERT_PSEUDO.toLowerCase()));
  if (!text) return false;
  // Le secret peut contenir l'adresse entière (https://ntfy.sh/mon-canal) : seul le nom du canal compte.
  const topic = env.NTFY_TOPIC.trim().replace(/\/+$/, '').replace(/^.*\//, '');
  if (!/^[-_A-Za-z0-9]{1,64}$/.test(topic)) throw new Error('NTFY_TOPIC invalide : lettres, chiffres, tirets et tirets bas seulement, 64 caractères au plus');
  const res = await fetchImpl(`https://ntfy.sh/${topic}`, { method: 'POST', headers: { Title: 'Sorare Scout : cartes a verifier' }, body: text });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
  return true;
}
