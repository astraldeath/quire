// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';

const { prepareLibrary } = vi.hoisted(() => ({
  prepareLibrary: vi.fn(async () => {}),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: prepareLibrary,
}));
// File IPC is exercised separately; keep SQLite and its actual commit triggers
// real here so rollback/outbox regression coverage remains intact.
vi.mock('../src/native-files', () => {
  const objects = new Map<string, Uint8Array>();
  let next = 0;
  return {
    nativeFileId: (value: string) =>
      value.startsWith('@quire-file:') ? value.slice(12) : undefined,
    writeNativeFile: async (value: Uint8Array | Blob) => {
      const id = (++next).toString(16).padStart(64, '0');
      objects.set(
        id,
        value instanceof Blob
          ? new Uint8Array(await value.arrayBuffer())
          : value.slice(),
      );
      return '@quire-file:' + id;
    },
    readNativeFile: async (id: string) => objects.get(id)?.slice(),
    deleteNativeFile: async (reference: string) => {
      objects.delete(reference.slice(12));
    },
  };
});
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => {
      expect(prepareLibrary).toHaveBeenCalledWith('prepare_library');
      const database = new DatabaseSync(':memory:');
      const migration = readFileSync(
        new URL('../src-tauri/src/migrations.rs', import.meta.url),
        'utf8',
      ).match(/pub const LIBRARY_SQL: &str = "([^"]+)"/)![1];
      database.exec(migration);
      database.exec(
        readFileSync(
          new URL('../src-tauri/src/sync.sql', import.meta.url),
          'utf8',
        ),
      );
      database.exec(
        readFileSync(
          new URL('../src-tauri/src/folder_catalog.sql', import.meta.url),
          'utf8',
        ),
      );
      return {
        execute: async (query: string, bindings: SQLInputValue[] = []) =>
          database
            .prepare(query)
            .run(
              Object.fromEntries(
                bindings.map((value, index) => [`$${index + 1}`, value]),
              ),
            ),
        select: async (query: string, bindings: SQLInputValue[] = []) =>
          database
            .prepare(query)
            .all(
              Object.fromEntries(
                bindings.map((value, index) => [`$${index + 1}`, value]),
              ),
            ),
      };
    },
  },
}));

it('native SQL statements preserve metadata and roundtrip binary bytes', async () => {
  const storage = await import('../src/storage');
  const book: Book = {
    id: 'native',
    title: 'A book',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: true,
  };
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
  await storage.putBook(book, bytes);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const updated: Book = {
    ...book,
    annotations: [
      {
        id: 'highlight-1',
        kind: 'highlight',
        cfi: 'epubcfi(/6/2)',
        text: 'A passage',
        note: 'My note',
        section: 'one',
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    series: 'Manual',
    position: {
      cfi: 'epubcfi(/6/2)',
      fraction: 0.5,
      section: 'one',
      updatedAt: 2,
    },
  };
  await storage.saveBook(updated);
  await storage.removeFile(book.id);
  expect(await storage.getFile(book.id)).toBeUndefined();
  expect(await storage.listBooks()).toEqual([{ ...updated, local: false }]);
  await storage.putBook(book, bytes);
  expect(await storage.listBooks()).toEqual([updated]);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const preferences = await storage.loadPreferences();
  preferences.reader.size = 31;
  await storage.savePreferences(preferences);
  expect((await storage.loadPreferences()).reader.size).toBe(31);
});

it('native progress writes preserve already saved notes', async () => {
  const storage = await import('../src/storage');
  const book: Book = {
    id: 'note-progress',
    title: 'Book',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: true,
  };
  await storage.putBook(book, new Uint8Array([1]));
  const notes: NonNullable<Book['annotations']> = [
    {
      id: 'note',
      kind: 'highlight',
      cfi: 'epubcfi(/6/2)',
      text: 'Word',
      note: 'Saved note',
      section: 'one',
      createdAt: 0,
      updatedAt: 0,
    },
  ];
  await storage.saveBookAnnotations(book.id, notes);
  await storage.saveReadingPosition(book.id, {
    cfi: 'epubcfi(/6/4)',
    fraction: 0.4,
    section: 'two',
    updatedAt: 1,
  });
  expect(
    (await storage.listBooks()).find((b) => b.id === book.id)?.annotations,
  ).toEqual(notes);
  await storage.removeFile(book.id);
  await storage.putBook(book, new Uint8Array([1]));
  expect(
    (await storage.listBooks()).find((b) => b.id === book.id)?.annotations,
  ).toEqual(notes);
});

it('restores a batch with one SQLite statement and preserves missing file bytes', async () => {
  const s = await import('../src/storage');
  const book: Book = {
    id: 'restore-existing',
    title: 'Before',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: true,
  };
  await s.putBook(book, new Uint8Array([4]));
  await s.restoreBooks([
    { book: { ...book, title: 'After' } },
    { book: { ...book, id: 'restore-new' }, file: new Uint8Array([5]) },
  ]);
  expect(await s.getFile(book.id)).toEqual(new Uint8Array([4]));
  expect((await s.listBooks()).find((b) => b.id === book.id)?.title).toBe(
    'After',
  );
  expect(await s.getFile('restore-new')).toEqual(new Uint8Array([5]));
});

it('rolls back an entire native restore batch if a record cannot be stored', async () => {
  const s = await import('../src/storage');
  const book: Book = {
    id: 'rollback-existing',
    title: 'Before',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: false,
  };
  await s.saveBook(book);
  await expect(
    s.restoreBooks([
      { book: { ...book, title: 'After' } },
      { book: { ...book, id: null as unknown as string } },
    ]),
  ).rejects.toThrow();
  expect((await s.listBooks()).find((b) => b.id === book.id)?.title).toBe(
    'Before',
  );
});

it('deletes selected native book records and bytes only', async () => {
  const s = await import('../src/storage');
  const b: Book = {
    id: 'delete-me',
    title: 'Delete',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: true,
  };
  await s.putBook(b, new Uint8Array([1]));
  await s.putBook({ ...b, id: 'keep-me' }, new Uint8Array([2]));
  await s.deleteBooks([b.id]);
  expect((await s.listBooks()).some((x) => x.id === b.id)).toBe(false);
  expect(await s.getFile(b.id)).toBeUndefined();
  expect(await s.getFile('keep-me')).toEqual(new Uint8Array([2]));
});
it('native transactions co-commit local edits, outbox and remote cursor', async () => {
  const s = await import('../src/storage');
  const { prepareBatch, acceptResponse, applyRecords } =
    await import('../src/features/sync/model');
  const book: Book = {
    id: 'f'.repeat(64),
    title: 'Atomic',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: false,
  };
  await s.syncTransaction((state) => {
    state.account = {
      origin: 'https://test.example',
      username: 'test',
      sessionId: 'session',
    };
    return { result: undefined };
  });
  await s.saveBook(book);
  let state = await s.loadSync();
  expect(state.pending.some((p) => p.bookId === book.id)).toBe(true);
  const before = structuredClone(state);
  await expect(
    s.restoreBooks([
      { book: { ...book, title: 'Should roll back' } },
      { book: { ...book, id: null as unknown as string } },
    ]),
  ).rejects.toThrow();
  expect(await s.loadSync()).toEqual(before);
  expect((await s.listBooks()).find((b) => b.id === book.id)?.title).toBe(
    'Atomic',
  );
  const batch = await s.syncTransaction((state) => ({
    result: prepareBatch(state),
  }));
  const own = batch.operations.find((p) => p.bookId === book.id)!;
  await s.syncTransaction((state, books) => {
    acceptResponse(state, {
      results: [{ id: own.id, revision: 1, conflict: false }],
      changes: [
        {
          bookId: book.id,
          kind: 'book',
          recordId: 'default',
          revision: 1,
          cursor: 1,
          candidates: [
            {
              operationId: own.id,
              deleted: false,
              value: {
                title: 'From server',
                author: '',
                series: '',
                volume: null,
              },
              createdAt: 1,
            },
          ],
        },
      ],
      cursor: 1,
      hasMore: false,
    });
    return { result: undefined, books: applyRecords(state, books) };
  });
  expect((await s.loadSync()).cursor).toBe(1);
  expect((await s.listBooks()).find((b) => b.id === book.id)?.title).toBe(
    'From server',
  );
});

it('native statistics batch and cursor are atomic and survive book removal', async () => {
  const s = await import('../src/storage');
  const a = {
    id: crypto.randomUUID(),
    bookId: 'b'.repeat(64),
    startedAt: 1000,
    endedAt: 61000,
    activeMs: 50000,
    sampledMs: 40000,
    words: 100,
    chapters: [1],
    volume: 1,
    finished: false,
  };
  await s.saveReadingActivity([a, a]);
  await s.deleteBooks([a.bookId]);
  expect(await s.listReadingActivity()).toEqual([a]);
  const b = { ...a, id: crypto.randomUUID() };
  await expect(
    s.commitReadingActivitySync([b, { ...a, words: 102 }], {
      account: 'native',
      cursor: 5,
      acknowledged: [a.id],
    }),
  ).rejects.toThrow();
  expect(await s.listReadingActivity()).toEqual([a]);
  expect((await s.readReadingActivitySync('native')).cursor).toBe(0);
  await s.commitReadingActivitySync([b], {
    account: 'native',
    cursor: 5,
    acknowledged: [a.id],
  });
  expect(await s.readReadingActivitySync('native')).toEqual({
    cursor: 5,
    pending: [],
  });
  expect((await s.readReadingActivitySync('another')).pending).toHaveLength(2);
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

it('commits folder catalog and book membership together and rolls both back on invalid writes', async () => {
  const s = await import('../src/storage');
  await s.editFolderCatalog((c) => {
    c.value.library = ['Before'];
  });
  const book: Book = {
    id: 'catalog-book',
    title: 'Book',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: false,
    folders: ['Before'],
  };
  await s.saveBook(book);
  await s.editFolderCatalog(
    (c) => {
      c.value.library = ['After'];
    },
    (books) =>
      books
        .filter((b) => b.id === book.id)
        .map((b) => ({ ...b, folders: ['After'] })),
  );
  expect((await s.loadFolderCatalog()).value.library).toEqual(['After']);
  expect((await s.listBooks()).find((b) => b.id === book.id)?.folders).toEqual([
    'After',
  ]);
  await expect(
    s.editFolderCatalog(
      (c) => {
        c.value.library = ['Broken'];
      },
      () => [
        { ...book, id: undefined as unknown as string, folders: ['Broken'] },
      ],
    ),
  ).rejects.toThrow();
  expect((await s.loadFolderCatalog()).value.library).toEqual(['After']);
  expect((await s.listBooks()).find((b) => b.id === book.id)?.folders).toEqual([
    'After',
  ]);
});
