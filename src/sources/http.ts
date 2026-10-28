export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch avec nouvelles tentatives sur 429 et 5xx (attente baseDelayMs * 2^tentative, ou Retry-After). */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const { retries = 4, baseDelayMs = 2000, fetchImpl = fetch } = opts;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, init);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** attempt);
  }
}
