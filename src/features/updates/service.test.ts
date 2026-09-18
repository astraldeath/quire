import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  invoke: vi.fn(),
  load: vi.fn(),
  flush: vi.fn(),
  server: vi.fn(),
  check: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.native,
  invoke: mocks.invoke,
}));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('../../storage', () => ({
  loadSync: mocks.load,
  flushStorage: mocks.flush,
}));
vi.mock('../sync/transport', () => ({ serverUpdatesCall: mocks.server }));
const account = {
  origin: 'https://quire.example',
  username: 'reader',
  sessionId: 'first',
};
const response = {
  current: {
    version: 'main.old',
    revision: 'a'.repeat(40),
    readerRevision: 'b'.repeat(40),
  },
  latest: {
    version: 'main.new',
    revision: 'c'.repeat(40),
    publishedAt: '2026-09-17T12:00:00Z',
    notes: '<script>text only</script>',
    notesUrl:
      'https://github.com/astraldeath/quire-server/blob/main/CHANGELOG.md',
  },
  available: true,
  checkedAt: '2026-09-17T12:01:00Z',
  canManage: false,
};
const handle = () => ({
  version: '0.3.0',
  body: '- Updated reader',
  close: vi.fn().mockResolvedValue(undefined),
  downloadAndInstall: vi.fn().mockResolvedValue(undefined),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.invoke.mockResolvedValue({ version: '0.2.0', supported: true });
  mocks.load.mockResolvedValue({ account: undefined });
  mocks.check.mockResolvedValue(null);
  mocks.flush.mockResolvedValue(undefined);
  mocks.server.mockResolvedValue(response);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('validates bounded server metadata and treats notes as plain text', async () => {
  const { parseServerUpdates } = await import('./service');
  expect(parseServerUpdates(response)).toEqual(response);
  expect(
    parseServerUpdates({
      ...response,
      latest: null,
      available: false,
      checkedAt: '',
      error: 'Feed unavailable.',
    }).error,
  ).toBe('Feed unavailable.');
  for (const latest of [
    undefined,
    { ...response.latest, notes: 'x'.repeat(32001) },
    { ...response.latest, notesUrl: 'javascript:alert(1)' },
    { ...response.latest, notesUrl: 'https://evil.example/notes' },
    { ...response.latest, revision: 'unknown' },
    { ...response.latest, publishedAt: 'today' },
  ]) {
    expect(() => parseServerUpdates({ ...response, latest })).toThrow();
  }
  expect(() => parseServerUpdates({ ...response, latest: null })).toThrow();
  expect(() =>
    parseServerUpdates({ ...response, canManage: 'true' }),
  ).toThrow();
});
it('never calls native APIs in browsers or hosted builds, but still checks connected servers', async () => {
  const service = await import('./service');
  mocks.native.mockReturnValue(false);
  mocks.load.mockResolvedValue({ account });
  await service.checkUpdates();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(service.getUpdatesSnapshot().server.data).toEqual(response);
  mocks.native.mockReturnValue(true);
  vi.stubEnv('VITE_HOSTED', 'true');
  await service.checkUpdates();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
});
it('uses native support information to exclude mobile updater calls', async () => {
  mocks.invoke.mockResolvedValue({ version: '0.2.0', supported: false });
  const service = await import('./service');
  await service.checkUpdates();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(service.getUpdatesSnapshot().reader.supported).toBe(false);
});
it('caches automatic checks six hours and allows explicit refresh without installing', async () => {
  vi.useFakeTimers();
  const service = await import('./service');
  const update = handle();
  mocks.check.mockResolvedValue(update);
  mocks.load.mockResolvedValue({ account });
  await service.checkUpdates(false);
  await service.checkUpdates(false);
  expect(mocks.check).toHaveBeenCalledTimes(1);
  expect(mocks.server).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);
  mocks.check.mockResolvedValue(null);
  await service.checkUpdates(false);
  expect(mocks.check).toHaveBeenCalledTimes(2);
  expect(update.close).toHaveBeenCalledTimes(1);
  await service.checkUpdates();
  expect(mocks.check).toHaveBeenCalledTimes(3);
  expect(update.downloadAndInstall).not.toHaveBeenCalled();
});
it('flushes library writes before explicit installation and reports download progress', async () => {
  const service = await import('./service'),
    update = handle(),
    flush = deferred<void>();
  mocks.check.mockResolvedValue(update);
  await service.checkUpdates();
  mocks.flush.mockReturnValue(flush.promise);
  const operation = service.installReaderUpdate();
  expect(update.downloadAndInstall).not.toHaveBeenCalled();
  update.downloadAndInstall.mockImplementation(
    async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      expect(service.getUpdatesSnapshot().reader.progress).toBe(50);
      onEvent({ event: 'Finished' });
    },
  );
  flush.resolve();
  await operation;
  expect(update.downloadAndInstall).toHaveBeenCalledWith(expect.any(Function), {
    restartAfterInstall: true,
  });
  expect(service.getUpdatesSnapshot().reader).toMatchObject({
    installing: true,
    progress: 100,
    error: undefined,
  });
});
it('does not install when storage flush fails, and recovers from signature/download failure', async () => {
  const service = await import('./service'),
    update = handle();
  mocks.check.mockResolvedValue(update);
  await service.checkUpdates();
  mocks.flush.mockRejectedValueOnce(new Error('storage unavailable'));
  await service.installReaderUpdate();
  expect(update.downloadAndInstall).not.toHaveBeenCalled();
  expect(service.getUpdatesSnapshot().reader.installing).toBe(false);
  update.downloadAndInstall.mockRejectedValueOnce(
    new Error('signature verification failed'),
  );
  await service.installReaderUpdate();
  expect(service.getUpdatesSnapshot().reader.error).toContain(
    'Could not install',
  );
  expect(service.getUpdatesSnapshot().reader.installing).toBe(false);
});
it('waits for queued reading changes before flushing storage and installing', async () => {
  const service = await import('./service'),
    update = handle(),
    queued = deferred<void>();
  mocks.check.mockResolvedValue(update);
  await service.checkUpdates();
  const operation = service.installReaderUpdate(() => queued.promise);
  expect(service.getUpdatesSnapshot().reader.installing).toBe(true);
  expect(mocks.flush).not.toHaveBeenCalled();
  expect(update.downloadAndInstall).not.toHaveBeenCalled();
  queued.resolve();
  await operation;
  expect(mocks.flush).toHaveBeenCalledOnce();
  expect(update.downloadAndInstall).toHaveBeenCalledOnce();
});
it('closes a rejected updater handle and retains a quiet check error', async () => {
  const service = await import('./service'),
    update = handle();
  update.body = 'x'.repeat(32001);
  mocks.check.mockResolvedValue(update);
  await service.checkUpdates();
  expect(update.close).toHaveBeenCalledOnce();
  expect(service.getUpdatesSnapshot().reader.available).toBeUndefined();
  expect(service.getUpdatesSnapshot().reader.error).toBeDefined();
});
it('discards a previous account response after logout even without a storage event', async () => {
  const service = await import('./service'),
    pending = deferred<unknown>();
  mocks.load.mockResolvedValue({ account });
  mocks.server.mockReturnValue(pending.promise);
  const checking = service.checkUpdates();
  await vi.waitFor(() => expect(mocks.server).toHaveBeenCalledOnce());
  mocks.load.mockResolvedValue({ account: undefined });
  pending.resolve(response);
  await checking;
  expect(service.getUpdatesSnapshot().server).toEqual({ checking: false });
});
it('checks a new account immediately and ignores an older in-flight response', async () => {
  const service = await import('./service'),
    pending = deferred<unknown>();
  mocks.load.mockResolvedValue({ account });
  mocks.server.mockReturnValueOnce(pending.promise);
  const oldCheck = service.checkUpdates(false);
  await vi.waitFor(() => expect(mocks.server).toHaveBeenCalledOnce());
  const nextAccount = { ...account, sessionId: 'next-session' };
  mocks.load.mockResolvedValue({ account: nextAccount });
  const nextResponse = { ...response, canManage: true };
  mocks.server.mockResolvedValue(nextResponse);
  await service.checkUpdates(false);
  expect(mocks.server).toHaveBeenLastCalledWith(nextAccount);
  pending.resolve(response);
  await oldCheck;
  expect(service.getUpdatesSnapshot().server.data).toEqual(nextResponse);
});
it('reacts to account storage events and removes listeners on cleanup', async () => {
  const service = await import('./service');
  const cleanup = service.initializeUpdates();
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalled());
  mocks.load.mockResolvedValue({ account });
  window.dispatchEvent(new Event('quire-storage'));
  await vi.waitFor(() =>
    expect(service.getUpdatesSnapshot().server.data).toEqual(response),
  );
  mocks.load.mockResolvedValue({ account: undefined });
  window.dispatchEvent(new Event('quire-synced'));
  await vi.waitFor(() =>
    expect(service.getUpdatesSnapshot().server.data).toBeUndefined(),
  );
  cleanup();
  const count = mocks.load.mock.calls.length;
  window.dispatchEvent(new Event('quire-storage'));
  expect(mocks.load).toHaveBeenCalledTimes(count);
});
