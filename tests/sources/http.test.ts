import { fetchWithRetry } from '@/sources/http';

const resp = (status: number, headers: Record<string, string> = {}) => new Response('{}', { status, headers });

describe('fetchWithRetry', () => {
  it('réessaie sur 503 puis renvoie le 200', async () => {
    const calls: number[] = [];
    const statuses = [503, 503, 200];
    const fetchImpl = async () => { calls.push(1); return resp(statuses[calls.length - 1]); };
    const r = await fetchWithRetry('http://x', {}, { baseDelayMs: 1, fetchImpl });
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(3);
  });
  it('abandonne après 4 nouvelles tentatives', async () => {
    let n = 0;
    const r = await fetchWithRetry('http://x', {}, { baseDelayMs: 1, fetchImpl: async () => { n++; return resp(429); } });
    expect(r.status).toBe(429);
    expect(n).toBe(5);
  });
  it('ne réessaie pas sur 400', async () => {
    let n = 0;
    await fetchWithRetry('http://x', {}, { baseDelayMs: 1, fetchImpl: async () => { n++; return resp(400); } });
    expect(n).toBe(1);
  });
});
