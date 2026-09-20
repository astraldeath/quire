import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/sync/transport', () => ({
  serverLimits: vi.fn().mockResolvedValue({ maxDownloadBytes: 8589934592 }),
  download: vi.fn(),
  files: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock('../src/epub', () => ({ importEpub: vi.fn() }));
import {
  getFile,
  listBooks,
  saveBook,
  syncTransaction,
  deleteBooks,
} from '../src/storage';
import * as storage from '../src/storage';
import { ensureBookFile, fetchCovers } from '../src/features/sync/library';
import { download, files, metadata } from '../src/features/sync/transport';
import { importEpub } from '../src/epub';
import { layoutViewport } from '../src/viewport';
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'session',
};
const book = {
  id: createHash('sha256')
    .update(new Uint8Array([1, 2, 3]))
    .digest('hex'),
  title: 'My title',
  author: 'Author',
  series: '',
  volume: null,
  cover: '',
  local: false,
  addedAt: 1,
  annotations: [
    {
      id: 'note',
      kind: 'highlight' as const,
      cfi: 'cfi',
      text: 'word',
      note: 'Keep me',
      section: 'one',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};
beforeEach(async () => {
  vi.clearAllMocks();
  await deleteBooks((await listBooks()).map((b) => b.id));
  await syncTransaction((s) => {
    s.account = account;
    s.enabled = true;
    s.covers = [];
    return { result: undefined };
  });
});
it('fetches and caches cover previews without fetching EPUB bytes', async () => {
  await saveBook(book);
  await syncTransaction((s) => {
    s.enabled = true;
    s.account = account;
    return { result: undefined };
  });
  vi.mocked(files).mockResolvedValue([
    { bookId: book.id, size: 12, uploaded: false, watched: true },
  ]);
  vi.mocked(metadata).mockResolvedValue({
    cover: 'data:image/jpeg;base64,YQ==',
  });
  await fetchCovers(account);
  await fetchCovers(account);
  expect(metadata).toHaveBeenCalledTimes(1);
  expect(download).not.toHaveBeenCalled();
  expect(await getFile(book.id)).toBeUndefined();
  expect((await listBooks())[0].annotations).toEqual(book.annotations);
});
it('downloads once on opening and preserves saved notes and custom metadata', async () => {
  await saveBook(book);
  const bytes = new Uint8Array([1, 2, 3]);
  vi.mocked(download).mockResolvedValue(bytes);
  vi.mocked(importEpub).mockResolvedValue({
    book: { ...book, title: 'Publisher title', annotations: [] },
    bytes,
  } as any);
  const [a, b] = await Promise.all([
    ensureBookFile(book.id),
    ensureBookFile(book.id),
  ]);
  expect(a).toEqual(bytes);
  expect(b).toEqual(bytes);
  await ensureBookFile(book.id);
  expect(download).toHaveBeenCalledTimes(1);
  expect(importEpub).not.toHaveBeenCalled();
  expect((await listBooks())[0]).toMatchObject({
    title: 'My title',
    annotations: book.annotations,
    local: true,
  });
});
it('rejects an EPUB with a different identity before saving', async () => {
  const id = 'c'.repeat(64);
  vi.mocked(download).mockResolvedValue(new Uint8Array([4]));
  vi.mocked(importEpub).mockResolvedValue({
    book,
    bytes: new Uint8Array([4]),
  } as any);
  await expect(ensureBookFile(id)).rejects.toThrow('does not match');
  expect(await getFile(id)).toBeUndefined();
});
it('preserves metadata and progress edited while a download is in flight', async () => {
  await saveBook(book);
  const position = {
    fraction: 0.5,
    cfi: 'new',
    section: 'Middle',
    updatedAt: 2,
  };
  vi.mocked(download).mockImplementation(async () => {
    await saveBook({ ...book, title: 'Edited during download', position });
    return new Uint8Array([1, 2, 3]);
  });
  await ensureBookFile(book.id);
  expect((await listBooks())[0]).toMatchObject({
    title: 'Edited during download',
    position,
    annotations: book.annotations,
    local: true,
  });
});
it('does not share an in-flight download with a new session', async () => {
  await saveBook(book);
  let finish!: (bytes: Uint8Array) => void;
  let started!: () => void;
  const downloading = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(download)
    .mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValue(new Uint8Array([1, 2, 3]));
  const first = ensureBookFile(book.id).then(
    () => 'saved',
    () => 'rejected',
  );
  await downloading;
  await syncTransaction((s) => {
    s.account = { ...account, sessionId: 'new' };
    return { result: undefined };
  });
  const second = ensureBookFile(book.id);
  finish(new Uint8Array([1, 2, 3]));
  expect(await first).toBe('rejected');
  expect(await second).toEqual(new Uint8Array([1, 2, 3]));
  expect(download).toHaveBeenCalledTimes(2);
});
it('guards the serialized file commit after an account change queued ahead of it', async () => {
  await saveBook(book);
  const change = syncTransaction((s) => {
    s.account = { ...account, sessionId: 'new' };
    return { result: undefined };
  });
  const result = storage.putDownloadedFile(
    book.id,
    new Uint8Array([1, 2, 3]),
    account,
  );
  await change;
  await expect(result).rejects.toThrow(/account|session/i);
  expect(await getFile(book.id)).toBeUndefined();
});
it('keeps page height steady during keyboard resizing but accepts rotation', () => {
  const initial = { width: 390, height: 844 };
  expect(layoutViewport(initial, { width: 390, height: 810 }, true)).toEqual(
    initial,
  );
  expect(layoutViewport(initial, { width: 390, height: 400 }, true)).toEqual(
    initial,
  );
  expect(layoutViewport(initial, { width: 844, height: 390 }, true)).toEqual({
    width: 844,
    height: 390,
  });
  expect(
    layoutViewport(initial, { width: 390, height: 600 }, false).height,
  ).toBe(600);
});
