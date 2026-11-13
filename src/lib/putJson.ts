const CODE_KEY = 'sorare-scout:code';

/** Enregistre sur le serveur avec le code de cet appareil ; s'il est refusé, le demande une fois et réessaie. */
export async function putJson(url: string, body: unknown): Promise<Response> {
  const send = (code: string) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-code': code }, body: JSON.stringify(body) });
  let code = '';
  try { code = window.localStorage.getItem(CODE_KEY) ?? ''; } catch { /* stockage indisponible */ }
  const first = await send(code);
  if (first.status !== 401) return first;
  // Lettres, chiffres et tirets seulement : un en-tête HTTP n'accepte pas tous les caractères.
  const typed = window.prompt('Code d’enregistrement (demandé une seule fois sur cet appareil)')?.trim().replace(/[^\w-]/g, '');
  if (!typed) return first;
  const second = await send(typed);
  if (second.ok) try { window.localStorage.setItem(CODE_KEY, typed); } catch { /* stockage indisponible */ }
  return second;
}
