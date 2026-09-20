import { afterEach, expect, it, vi } from 'vitest';
import { trackingRequest } from '../src/features/tracking/client';
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
vi.mock('../src/storage', () => ({ loadSync: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('combines cancellation with the timeout and preserves hosted origin, redirect and session binding', async () => {
  vi.stubEnv('VITE_HOSTED', 'true');
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  let options!: RequestInit;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => {
      options = init;
      return new Response(JSON.stringify({ matches: [] }));
    }),
  );
  await trackingRequest(
    {
      kind: 'hosted',
      account: {
        origin: location.origin,
        username: 'reader',
        sessionId: 'session',
      },
    },
    '/v1/tracking/search?q=Novel',
    undefined,
    undefined,
    { signal: controller.signal },
  );
  expect(fetch).toHaveBeenCalledWith(
    location.origin + '/v1/tracking/search?q=Novel',
    expect.objectContaining({
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'X-Quire-Session': 'session' },
    }),
  );
  expect(timeout).toHaveBeenCalledWith(30000);
  expect(options.signal?.aborted).toBe(false);
  controller.abort();
  expect(options.signal?.aborted).toBe(true);
});
