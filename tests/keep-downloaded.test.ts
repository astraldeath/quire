import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/sync/transport', () => ({ download: vi.fn() }));
import { download } from '../src/features/sync/transport';
import { keepDownloaded } from '../src/features/storage/keepDownloaded';
import { readPolicy, writePolicy } from '../src/features/storage/policy';
import {
  deleteBooks,
  getFile,
  listBooks,
  putBook,
  saveBook,
  syncTransaction,
} from '../src/storage';

const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'one',
};
const bytes = new Uint8Array([8, 9]);
const book = {
  id: createHash('sha256').update(bytes).digest('hex'),
  title: 'One',
  author: '',
  series: '',
  volume: null,
  cover: '',
  local: false,
  addedAt: 1,
};
const other = {
  ...book,
  id: createHash('sha256')
    .update(new Uint8Array([7]))
    .digest('hex'),
};
beforeEach(async () => {
  vi.resetAllMocks();
  localStorage.clear();
  await deleteBooks((await listBooks()).map((b) => b.id));
  await syncTransaction((s) => {
    s.account = account;
    s.enabled = true;
    return { result: undefined };
  });
  await saveBook(book);
  await saveBook(other);
});
it('pins an already local book without a network request', async () => {
  await putBook(book, bytes);
  const result = await keepDownloaded([book.id], account);
  expect(result).toEqual({ kept: [book.id], failed: [] });
  expect(readPolicy(account).pinned).toEqual([book.id]);
  expect(download).not.toHaveBeenCalled();
});
it('downloads before pinning a cloud book', async () => {
  vi.mocked(download).mockImplementation(async () => {
    expect(readPolicy(account).pinned).toEqual([]);
    return bytes;
  });
  expect(await keepDownloaded([book.id], account)).toEqual({
    kept: [book.id],
    failed: [],
  });
  expect(Array.from((await getFile(book.id))!)).toEqual([8, 9]);
  expect(readPolicy(account).pinned).toEqual([book.id]);
});
it('returns per-book failures and retry never unpins an earlier success', async () => {
  vi.mocked(download).mockImplementation(async (_account, id) => {
    if (id === book.id) return bytes;
    throw new Error('Server unavailable');
  });
  expect(await keepDownloaded([book.id, other.id], account)).toEqual({
    kept: [book.id],
    failed: [{ id: other.id, message: 'Server unavailable' }],
  });
  expect(await getFile(other.id)).toBeUndefined();
  await keepDownloaded([other.id], account);
  expect(readPolicy(account).pinned).toEqual([book.id]);
});
it.each([
  { ...account, sessionId: 'two' },
  { ...account, username: 'bob' },
  { ...account, origin: 'https://other.example' },
])(
  'rejects an account/session change after download without saving or pinning: %j',
  async (next) => {
    writePolicy(next, { pinned: ['existing'] });
    vi.mocked(download).mockImplementation(async () => {
      await syncTransaction((s) => {
        s.account = next;
        return { result: undefined };
      });
      return bytes;
    });
    const result = await keepDownloaded([book.id], account);
    expect(result.kept).toEqual([]);
    expect(result.failed[0].message).toMatch(/account|session/i);
    expect(await getFile(book.id)).toBeUndefined();
    expect(readPolicy(next).pinned).toEqual(['existing']);
  },
);
it('refuses to pin local files when the expected session is stale', async () => {
  await putBook(book, bytes);
  const result = await keepDownloaded([book.id], {
    ...account,
    sessionId: 'stale',
  });
  expect(result.kept).toEqual([]);
  expect(result.failed).toHaveLength(1);
  expect(readPolicy(account).pinned).toEqual([]);
});
