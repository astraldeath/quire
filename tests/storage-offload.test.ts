import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
it('offloading removes only bytes and retains notes, progress, metadata and sync state', async () => {
  const s = await import('../src/storage');
  s.useBrowserAccount('offload-fixture');
  const book = {
    id: 'one',
    title: 'One',
    author: 'Author',
    series: '',
    volume: null,
    cover: 'cover',
    addedAt: 1,
    local: true,
    position: { fraction: 1, cfi: 'x', section: 'end', updatedAt: 1 },
    annotations: [
      {
        id: 'note',
        kind: 'highlight' as const,
        text: 'quote',
        note: 'keep me',
        cfi: 'x',
        section: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  await s.putBook(book, new Uint8Array([1, 2, 3]));
  const sync = await s.loadSync();
  await s.removeFileWhen(book.id, () => false);
  expect(await s.getFile(book.id)).toBeDefined();
  await s.removeFileWhen(book.id, async () => true);
  expect(await s.getFile(book.id)).toBeUndefined();
  expect((await s.listBooks())[0]).toEqual({ ...book, local: false });
  expect(await s.loadSync()).toEqual(sync);
  await s.putBook(book, new Uint8Array([1, 2, 3]));
  await s.syncTransaction((state) => {
    state.account = {
      origin: 'https://example.test',
      username: 'test',
      sessionId: 'one',
    };
    return { result: undefined };
  });
  const failure = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('quota');
    });
  try {
    const { ensureBookFile } = await import('../src/features/sync/library');
    expect(Array.from(await ensureBookFile(book.id))).toEqual([1, 2, 3]);
  } finally {
    failure.mockRestore();
  }
});
