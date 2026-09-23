import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';
import { validateBook } from '../src/features/backup/validation';
import { aggregateStatistics } from '../src/features/statistics/model';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
const shared: Book = {
  id: 'a'.repeat(64),
  title: 'Shared',
  author: 'Writer',
  series: 'Shared series',
  volume: 1,
  cover: '',
  addedAt: 1,
  local: false,
  inLibrary: false,
};
it('downloads and reading preserve shared membership; explicit add retains progress and rejects stale sessions and locked books', async () => {
  const s = await import('../src/storage');
  s.useBrowserAccount('shared-membership');
  const account = {
    origin: 'https://quire.test',
    username: 'reader',
    sessionId: 'one',
  };
  await s.syncTransaction((state) => {
    state.enabled = true;
    state.account = account;
    return { result: undefined, books: [shared] };
  });
  await s.putDownloadedFile(shared.id, new Uint8Array([1, 2, 3]), account);
  await s.saveReadingPosition(shared.id, {
    cfi: 'cfi',
    fraction: 0.4,
    section: 'Chapter',
    updatedAt: 42,
  });
  expect((await s.listBooks())[0]).toMatchObject({
    inLibrary: false,
    local: true,
    position: { fraction: 0.4 },
  });
  await expect(
    s.addSharedBooksToLibrary(
      [shared.id],
      { ...account, sessionId: 'old' },
      () => true,
    ),
  ).rejects.toThrow('session changed');
  await expect(
    s.addSharedBooksToLibrary([shared.id], account, () => false),
  ).rejects.toThrow('Unlock');
  await s.addSharedBooksToLibrary([shared.id], account, () => true);
  expect((await s.listBooks())[0]).toMatchObject({
    inLibrary: true,
    local: true,
    position: { fraction: 0.4 },
  });
  expect(
    (await s.loadSync()).pending.find((p) => p.kind === 'book')?.value
      ?.inLibrary,
  ).toBe(true);
  await s.addSharedBooksToLibrary([shared.id], account, () => true, false);
  expect((await s.listBooks())[0]).toMatchObject({
    inLibrary: false,
    position: { fraction: 0.4 },
  });
  expect(Array.from((await s.getFile(shared.id))!)).toEqual([1, 2, 3]);
  await s.putBook(shared, new Uint8Array([1, 2, 3]));
  expect((await s.listBooks())[0]).toMatchObject({
    inLibrary: true,
    position: { fraction: 0.4 },
  });
});
it('validates backup membership and excludes shared-only books from current library counts', () => {
  expect(validateBook(shared).inLibrary).toBe(false);
  expect(() => validateBook({ ...shared, inLibrary: 'false' })).toThrow();
  const stats = aggregateStatistics(
    [shared, { ...shared, id: 'b'.repeat(64), series: '', inLibrary: true }],
    [],
    'all',
  );
  expect(stats.books).toBe(1);
  expect(stats.series).toBe(0);
  expect(stats.unread).toBe(1);
});
