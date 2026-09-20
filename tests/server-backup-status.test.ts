import { afterEach, expect, it, vi } from 'vitest';
import { login, serverBackupStatus } from '../src/features/sync/transport';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
afterEach(() => {
  vi.unstubAllGlobals();
});
it('distinguishes a legacy 404 from unauthorized, invalid and uncertain responses', async () => {
  const a = { origin: 'https://backup.test', username: 'a', sessionId: 's' };
  let response = new Response('{}', { status: 404 });
  const fetch = vi.fn(async (url: string) =>
    url.endsWith('/v1/sessions')
      ? Response.json({ session: { id: 's' }, token: 'test-token' })
      : response,
  );
  vi.stubGlobal('fetch', fetch);
  await login(a.origin, a.username, 'mock');
  expect(await serverBackupStatus(a)).toBeNull();
  expect(fetch.mock.calls.at(-1)?.[0]).toBe(
    a.origin + '/v1/admin/backup/status',
  );
  response = Response.json({
    inputBytes: 900 * 1048576,
    browserLimitBytes: 512 * 1048576,
    fitsBrowser: null,
  });
  expect((await serverBackupStatus(a))?.fitsBrowser).toBeNull();
  response = Response.json({
    inputBytes: 1,
    browserLimitBytes: 512 * 1048576,
    fitsBrowser: 'yes',
  });
  await expect(serverBackupStatus(a)).rejects.toThrow('Invalid backup status');
  response = new Response('{}', { status: 401 });
  await expect(serverBackupStatus(a)).rejects.toThrow('Sign in again');
});
