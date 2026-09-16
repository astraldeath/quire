import 'fake-indexeddb/auto';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  saveReadingActivity,
  listReadingActivity,
  readReadingActivitySync,
  commitReadingActivitySync,
  deleteBooks,
  syncTransaction,
} from '../src/storage';
import { syncReadingActivity } from '../src/features/statistics/sync';
import { createBackup, readBackup } from '../src/features/backup/archive';
import { defaults } from '../src/domain/models';
import type { ReadingActivity } from '../src/features/statistics/model';
import { statsCall } from '../src/features/sync/transport';
vi.mock('../src/features/sync/transport', () => ({ statsCall: vi.fn() }));
const account = {
  origin: 'https://quire.example',
  username: 'reader',
  sessionId: 'session',
};
const accountKey = JSON.stringify([account.origin, account.username]);
const activity = (): ReadingActivity => ({
  id: crypto.randomUUID(),
  bookId: 'a'.repeat(64),
  startedAt: 1000,
  endedAt: 61000,
  activeMs: 50000,
  sampledMs: 40000,
  words: 100,
  chapters: [1],
  volume: 1,
  finished: false,
});
beforeEach(() => {
  vi.mocked(statsCall).mockReset();
});
it('keeps immutable activity once and preserves deleted book history', async () => {
  const a = activity();
  await saveReadingActivity([a, a]);
  await saveReadingActivity([a]);
  await deleteBooks([a.bookId]);
  expect((await listReadingActivity()).filter((x) => x.id === a.id)).toEqual([
    a,
  ]);
  const next = activity();
  await expect(
    saveReadingActivity([next, { ...a, words: 101 }]),
  ).rejects.toThrow('identity');
  expect(
    (await listReadingActivity()).find((x) => x.id === next.id),
  ).toBeUndefined();
});
it('commits received history, acknowledgement, and cursor atomically', async () => {
  const a = activity();
  await saveReadingActivity([a]);
  const key = 'atomic-account';
  const b = activity();
  await expect(
    commitReadingActivitySync([b, { ...a, words: 102 }], {
      account: key,
      cursor: 9,
      acknowledged: [a.id],
    }),
  ).rejects.toThrow();
  expect((await readReadingActivitySync(key)).cursor).toBe(0);
  expect((await listReadingActivity()).some((x) => x.id === b.id)).toBe(false);
  await commitReadingActivitySync([b], {
    account: key,
    cursor: 9,
    acknowledged: [a.id],
  });
  const state = await readReadingActivitySync(key);
  expect(state.cursor).toBe(9);
  expect(state.pending.some((x) => x.id === a.id || x.id === b.id)).toBe(false);
});
it('backs up orphan history and merges identical records; old archives default to empty', async () => {
  const a = activity();
  const backup = await readBackup(
    await createBackup([], defaults, 'data', [a, a]),
  );
  expect(backup.activities).toEqual([a]);
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    level: 0,
  });
  await writer.add(
    'manifest.json',
    new Uint8ArrayReader(
      new TextEncoder().encode(
        JSON.stringify({
          format: 'quire-backup',
          version: 1,
          createdAt: 1,
          kind: 'data',
          preferences: defaults,
          books: [],
          files: [],
        }),
      ),
    ),
  );
  expect((await readBackup(await writer.close())).activities).toEqual([]);
  await expect(
    createBackup([], defaults, 'data', [a, { ...a, words: 101 }]),
  ).rejects.toThrow('identity');
});
it('retries failed batches, pages remote history, and never echoes received records', async () => {
  await syncTransaction((s) => {
    s.account = account;
    s.enabled = true;
    return { result: undefined };
  });
  const local = activity(),
    remote = activity();
  await saveReadingActivity([local]);
  vi.mocked(statsCall).mockRejectedValueOnce(new Error('offline'));
  await expect(syncReadingActivity()).rejects.toThrow('offline');
  expect(
    (await readReadingActivitySync(accountKey)).pending.some(
      (a) => a.id === local.id,
    ),
  ).toBe(true);
  vi.mocked(statsCall)
    .mockResolvedValueOnce({ cursor: 1, activities: [remote], hasMore: true })
    .mockResolvedValue({ cursor: 2, activities: [], hasMore: false });
  await syncReadingActivity();
  const requests = vi.mocked(statsCall).mock.calls;
  expect(
    (requests[1][1] as any).activities.some(
      (a: ReadingActivity) => a.id === local.id,
    ),
  ).toBe(true);
  expect((requests[2][1] as any).activities).toEqual([]);
  expect((await readReadingActivitySync(accountKey)).pending).toEqual([]);
  await syncReadingActivity();
  expect((vi.mocked(statsCall).mock.lastCall![1] as any).activities).toEqual(
    [],
  );
});
it('does not transmit without an enabled account and discards an old session response', async () => {
  await syncTransaction((s) => {
    s.enabled = false;
    return { result: undefined };
  });
  await syncReadingActivity();
  expect(statsCall).not.toHaveBeenCalled();
  await syncTransaction((s) => {
    s.enabled = true;
    return { result: undefined };
  });
  const remote = activity();
  vi.mocked(statsCall).mockImplementationOnce(async () => {
    await syncTransaction((s) => {
      s.account = { ...account, sessionId: 'replacement' };
      return { result: undefined };
    });
    return { cursor: 20, activities: [remote], hasMore: false };
  });
  await syncReadingActivity();
  expect((await listReadingActivity()).some((a) => a.id === remote.id)).toBe(
    false,
  );
});
it('bounds outgoing batches and preserves pending records on invalid remote data', async () => {
  const batchAccount = { ...account, username: 'batch-reader' };
  const key = JSON.stringify([batchAccount.origin, batchAccount.username]);
  await syncTransaction((s) => {
    s.account = batchAccount;
    s.enabled = true;
    return { result: undefined };
  });
  const items = Array.from({ length: 205 }, activity);
  await saveReadingActivity(items);
  vi.mocked(statsCall).mockResolvedValueOnce({
    cursor: 1,
    activities: [{ ...activity(), activeMs: 999999 }],
    hasMore: false,
  });
  await expect(syncReadingActivity()).rejects.toThrow();
  expect((await readReadingActivitySync(key)).cursor).toBe(0);
  vi.mocked(statsCall).mockImplementation(async (_account, request) => ({
    cursor: (request as { cursor: number }).cursor + 1,
    activities: [],
    hasMore: false,
  }));
  await syncReadingActivity();
  expect((await readReadingActivitySync(key)).pending).toEqual([]);
  expect(
    vi
      .mocked(statsCall)
      .mock.calls.every(
        ([, body]) =>
          (body as { activities: ReadingActivity[] }).activities.length <= 100,
      ),
  ).toBe(true);
  expect(vi.mocked(statsCall).mock.calls.length).toBeGreaterThanOrEqual(4);
});

it('manual completion survives unread and deletion without invented time', async () => {
  const s = await import('../src/storage');
  const book = {
    id: 'd'.repeat(64),
    title: 'Manual completion',
    author: '',
    series: '',
    volume: 2,
    cover: '',
    addedAt: 1,
    local: false,
  };
  await s.saveBook(book);
  const before = Date.now();
  await s.markBooksRead([book.id], true);
  expect(
    (await s.listBooks()).find((b) => b.id === book.id)?.position?.fraction,
  ).toBe(1);
  await s.markBooksRead([book.id], false);
  await s.deleteBooks([book.id]);
  const records = (await s.listReadingActivity()).filter(
    (a) => a.bookId === book.id,
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    finished: true,
    volume: 2,
    activeMs: 0,
    words: 0,
    sampledMs: 0,
    chapters: [],
  });
  expect(records[0].startedAt).toBeGreaterThanOrEqual(before);
  expect(records[0].endedAt).toBe(records[0].startedAt);
});
it('backup activity conflict rolls back restored metadata and files', async () => {
  const s = await import('../src/storage');
  const book = {
    id: 'e'.repeat(64),
    title: 'Existing',
    author: '',
    series: '',
    volume: 2,
    cover: '',
    addedAt: 1,
    local: false,
  };
  const a = {
    id: crypto.randomUUID(),
    bookId: book.id,
    startedAt: 1,
    endedAt: 1,
    activeMs: 0,
    words: 0,
    sampledMs: 0,
    chapters: [],
    volume: 2,
    finished: true,
  };
  await s.saveBook(book);
  await s.saveReadingActivity([a]);
  await expect(
    s.restoreBooks(
      [{ book: { ...book, title: 'Restored' }, file: new Uint8Array([9]) }],
      [{ ...a, finished: false }],
    ),
  ).rejects.toThrow();
  expect((await s.listBooks()).find((b) => b.id === book.id)?.title).toBe(
    'Existing',
  );
  expect(await s.getFile(book.id)).toBeUndefined();
  expect(
    (await s.listReadingActivity()).find((r) => r.id === a.id)?.finished,
  ).toBe(true);
});
