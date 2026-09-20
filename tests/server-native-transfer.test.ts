import { beforeEach, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }));
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'session',
};
const reference = '@quire-file:' + 'a'.repeat(64);
beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
});
function discovery() {
  return {
    apiVersion: '1',
    apiUrl: account.origin + '/v1',
    name: 'Quire',
    limits: { maxUploadBytes: 2147483648, maxDownloadBytes: 8589934592 },
  };
}
it('uploads an existing native file reference without raw IPC bytes', async () => {
  invoke.mockImplementation(async (command) =>
    command === 'sync_discover' ? discovery() : undefined,
  );
  await (
    await import('../src/features/sync/transport')
  ).upload(account, 'b'.repeat(64), reference);
  expect(invoke.mock.calls).toEqual([
    ['sync_discover', { server: account.origin }],
    [
      'sync_upload_file',
      {
        server: account.origin,
        username: 'alice',
        book: 'b'.repeat(64),
        reference,
      },
    ],
  ]);
});
it('cleans native downloaded objects when a bounded read rejects their size', async () => {
  invoke.mockImplementation(async (command) =>
    command === 'sync_discover'
      ? discovery()
      : command === 'sync_download_file'
        ? reference
        : command === 'book_file_size'
          ? 8589934593
          : undefined,
  );
  await expect(
    (await import('../src/features/sync/transport')).download(
      account,
      'b'.repeat(64),
    ),
  ).rejects.toThrow('size');
  expect(invoke).toHaveBeenLastCalledWith('book_file_remove', {
    id: 'a'.repeat(64),
  });
  expect(invoke.mock.calls.some((c) => c[0] === 'book_file_read')).toBe(false);
});
