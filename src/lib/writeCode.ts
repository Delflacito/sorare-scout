import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Enregistrements réservés à qui connaît le code (variable WRITE_CODE, envoyé dans l'en-tête x-code) : sans cela,
 * n'importe qui pouvait écraser les saisies d'un pseudo. Variable absente (développement local) : tout est accepté.
 */
export function checkCode(req: Request): boolean {
  const expected = process.env.WRITE_CODE;
  if (!expected) return true;
  return timingSafeEqual(digest(req.headers.get('x-code') ?? ''), digest(expected));
}
