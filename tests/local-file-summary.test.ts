// @vitest-environment node
import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
const { platform, invoke, select } = vi.hoisted(() => ({
  platform: { native: false },
  invoke: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => platform.native,
  invoke,
}));
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: async () => ({ select }) },
}));
it('measures blobs and arrays without reading contents or covers, ignoring missing files', async () => {
  const { openDB } = await import('idb');
  const s = await import('../src/storage');
  s.useBrowserAccount('summary');
  await s.listBooks();
  const db = await openDB('quire-account-summary');
  await db.put('files', new Uint8Array([1, 2, 3]), 'a');
  await db.put('files', new Blob(['four']), 'b');
  const read = vi
    .spyOn(Blob.prototype, 'arrayBuffer')
    .mockRejectedValue(new Error('must not read'));
  expect(await s.localFileSummary()).toEqual({ books: 2, bytes: 7 });
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
  db.close();
});
it('uses native stat and SQL length for old base64 without loading book bytes', async () => {
  platform.native = true;
  select.mockResolvedValue([
    { reference: '@quire-file:' + 'a'.repeat(64), bytes: 0 },
    { reference: null, bytes: 3 },
    { reference: '@quire-file:' + 'b'.repeat(64), bytes: 0 },
  ]);
  invoke.mockImplementation(async (command: string, { id }: any = {}) => {
    if (command === 'prepare_library') return;
    if (command !== 'book_file_size') throw new Error('must not read');
    if (id === 'b'.repeat(64))
      throw new Error('No such file or directory (os error 2)');
    return 9;
  });
  const s = await import('../src/storage');
  expect(await s.localFileSummary()).toEqual({ books: 2, bytes: 12 });
  expect(select.mock.calls.at(-1)?.[0]).not.toContain('SELECT file FROM');
  invoke.mockRejectedValue(new Error('Permission denied (os error 13)'));
  await expect(s.localFileSummary()).rejects.toThrow('Could not measure');
});
