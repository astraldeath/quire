import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubEnv('VITE_HOSTED', 'true');
});
it('restores the account from the server without storing a JavaScript token', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ session: { id: 'session' } })),
      ),
  );
  const first = await import('../src/features/sync/transport');
  await first.login(location.origin, 'alice', 'password');
  expect(sessionStorage.length).toBe(0);
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(
    location.origin + '/v1/browser/session',
  );
  vi.resetModules();
  const restored = await import('../src/features/sync/transport');
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ username: 'alice', sessionId: 'session' })),
  );
  const account = await restored.restoreBrowserAccount();
  expect(account).toEqual({
    origin: location.origin,
    username: 'alice',
    sessionId: 'session',
  });
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ id: 'alice-id' })),
  );
  await restored.accountRequest(account!, '/v1/me');
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    credentials: 'same-origin',
    headers: { 'X-Quire-Session': 'session' },
  });
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  await restored.logout(account!);
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    method: 'DELETE',
    credentials: 'same-origin',
  });
});
it('handles expired sessions without trusting old browser storage', async () => {
  sessionStorage.setItem('quire-hosted-session', 'old-token');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  const transport = await import('../src/features/sync/transport');
  expect(await transport.restoreBrowserAccount()).toBeUndefined();
  expect(sessionStorage.length).toBe(0);
});
it('keeps bearer authentication for standalone browser clients', async () => {
  vi.stubEnv('VITE_HOSTED', 'false');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ token: 'secret', session: { id: 'session' } }),
        ),
      ),
  );
  const transport = await import('../src/features/sync/transport');
  await transport.login(location.origin, 'alice', 'password');
  vi.mocked(fetch).mockResolvedValue(new Response('{}'));
  await transport.accountRequest(
    { origin: location.origin, username: 'alice', sessionId: 'session' },
    '/v1/me',
  );
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    credentials: 'omit',
    headers: { Authorization: 'Bearer secret' },
  });
});
it('authenticates backup downloads and refuses oversized browser downloads', async () => {
  const transport = await import('../src/features/sync/transport');
  const account = {
    origin: location.origin,
    username: 'alice',
    sessionId: 'session',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Length': '3' },
      }),
    ),
  );
  const progress = vi.fn();
  expect((await transport.downloadServerBackup(account, progress)).size).toBe(
    3,
  );
  expect(progress).toHaveBeenLastCalledWith(3, 3);
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    credentials: 'same-origin',
    headers: { 'X-Quire-Session': 'session' },
  });
  vi.mocked(fetch).mockResolvedValue(
    new Response(new Uint8Array([1]), {
      headers: { 'Content-Length': String(513 * 1024 * 1024) },
    }),
  );
  await expect(
    transport.downloadServerBackup(account, progress),
  ).rejects.toThrow('512 MB');
});
it('binds shared POST uploads to the current HttpOnly browser session', async () => {
  const transport = await import('../src/features/sync/transport');
  const account = {
    origin: location.origin,
    username: 'alice',
    sessionId: 'session',
  };
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            apiVersion: '1',
            apiUrl: location.origin + '/v1',
            name: 'Quire',
            capabilities: ['server-assigned-upload'],
            limits: {
              maxUploadBytes: 2147483648,
              maxDownloadBytes: 8589934592,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bookId: 'a'.repeat(64), size: 4 }), {
          status: 201,
        }),
      ),
  );
  await transport.uploadSharedFile(
    account,
    'shared',
    new File(['book'], 'book.cbz'),
    new AbortController().signal,
  );
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    method: 'POST',
    redirect: 'error',
    credentials: 'same-origin',
    headers: {
      'X-Quire-Session': 'session',
      'Content-Type': 'application/octet-stream',
    },
  });
  expect(sessionStorage.length).toBe(0);
});
