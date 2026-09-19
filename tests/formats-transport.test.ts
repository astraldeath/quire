import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} from '@zip.js/zip.js';
import { defaults, type Book } from '../src/domain/models';
import { createBackup, readBackup } from '../src/features/backup/archive';
import { validateBook } from '../src/features/backup/validation';
import { mergeBook } from '../src/features/backup/merge';
import {
  acceptResponse,
  applyRecords,
  emptySync,
  prepareBatch,
  queueChanges,
  type SyncResponse,
  type SyncState,
} from '../src/features/sync/model';
import { validateResponse } from '../src/features/sync/validation';
import { validFolder } from '../src/features/library/folders';

const formats = ['epub', 'cbz', 'fb2', 'fbz', 'mobi', 'azw3'] as const;
const baseBook: Book = {
  id: 'a'.repeat(64),
  title: 'Example',
  author: 'Author',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: true,
};

function response(value: Record<string, unknown>): SyncResponse {
  return {
    results: [],
    changes: [
      {
        bookId: baseBook.id,
        kind: 'book',
        recordId: 'default',
        revision: 1,
        cursor: 1,
        candidates: [
          { operationId: 'remote', deleted: false, createdAt: 1, value },
        ],
      },
    ],
    cursor: 1,
    hasMore: false,
  };
}

function state(): SyncState {
  return {
    ...emptySync(),
    account: {
      origin: 'https://books.example',
      username: 'alice',
      sessionId: 'session',
    },
  };
}

describe('format and folder backup transport', () => {
  it('restores the format onto legacy placeholders while preserving local organization', () => {
    const local: Book = { ...baseBook, local: false, folder: 'My shelves' };
    const incoming: Book = {
      ...baseBook,
      format: 'cbz',
      folder: 'Backup shelves',
    };
    expect(mergeBook(local, incoming)).toMatchObject({
      format: 'cbz',
      folder: 'My shelves',
      local: true,
    });
  });

  it('roundtrips every format with original bytes, extensions, and nested folders', async () => {
    // Backup transport treats files as opaque, hash-checked originals.
    const records = formats.map((format, index) => {
      const file = new Uint8Array([index, 8, 21, 34]);
      const id = createHash('sha256').update(file).digest('hex');
      return {
        book: { ...baseBook, id, format, folder: `Library/${format}` },
        file,
      };
    });
    const bytes = await createBackup(records, defaults, 'full');
    const reader = new ZipReader(new Uint8ArrayReader(bytes), {
      useWebWorkers: false,
    });
    try {
      const names = (await reader.getEntries()).map((entry) => entry.filename);
      expect(names).toEqual([
        'manifest.json',
        ...records.map(({ book }) => `books/${book.id}.${book.format}`),
      ]);
    } finally {
      await reader.close();
    }
    const restored = await readBackup(bytes);
    expect(restored.records).toEqual(
      records.map(({ book, file }) => ({
        book: { ...book, folders: [book.folder] },
        file,
      })),
    );
    const dataOnly = await readBackup(
      await createBackup(records, defaults, 'data'),
    );
    expect(dataOnly.records).toEqual(
      records.map(({ book }) => ({
        book: { ...book, folders: [book.folder], local: false },
        file: undefined,
      })),
    );
  });

  it('keeps legacy EPUB backups readable when format and folder are absent', async () => {
    const file = new Uint8Array([1, 2, 3]);
    const book = {
      ...baseBook,
      id: createHash('sha256').update(file).digest('hex'),
    };
    const restored = await readBackup(
      await createBackup([{ book, file }], defaults, 'full'),
    );
    expect(restored.records).toEqual([{ book, file }]);
    expect(restored.records[0].book).not.toHaveProperty('format');
    expect(restored.records[0].book).not.toHaveProperty('folder');
  });

  it('rejects a file extension that disagrees with the manifest format', async () => {
    const file = new Uint8Array([1, 2, 3]);
    const book = {
      ...baseBook,
      id: createHash('sha256').update(file).digest('hex'),
      format: 'cbz' as const,
    };
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
            kind: 'full',
            preferences: defaults,
            books: [book],
            files: [book.id],
          }),
        ),
      ),
    );
    await writer.add(`books/${book.id}.epub`, new Uint8ArrayReader(file));
    await expect(readBackup(await writer.close())).rejects.toThrow('missing');
  });
});

describe('format and folder sync transport', () => {
  it.each(formats)(
    'queues and applies %s metadata without changing local reading data',
    (format) => {
      const book: Book = {
        ...baseBook,
        format,
        folder: 'Fiction/Classics',
        position: {
          cfi: 'chapter',
          fraction: 0.2,
          section: 'One',
          updatedAt: 5,
        },
      };
      const s = state();
      queueChanges(s, undefined, book);
      const metadata = prepareBatch(s).operations.find(
        (op) => op.kind === 'book',
      )!;
      expect(metadata.value).toMatchObject({
        format,
        folder: 'Fiction/Classics',
        folders: ['Fiction/Classics'],
      });
      const received = emptySync();
      acceptResponse(
        received,
        validateResponse(response(metadata.value!), 0, []),
      );
      const [local] = applyRecords(received, [
        { ...book, folder: 'Old', title: 'Old title' },
      ]);
      expect(local).toEqual({ ...book, folders: ['Fiction/Classics'] });
      const [remote] = applyRecords(received, []);
      expect(remote).toMatchObject({
        format,
        folder: 'Fiction/Classics',
        folders: ['Fiction/Classics'],
        local: false,
      });
    },
  );

  it('preserves local optional fields when older servers omit them', () => {
    const s = emptySync();
    acceptResponse(s, validateResponse(response({ title: 'Renamed' }), 0, []));
    const [book] = applyRecords(s, [
      { ...baseBook, format: 'cbz', folder: 'Comics/Series' },
    ]);
    expect(book).toMatchObject({
      title: 'Renamed',
      format: 'cbz',
      folder: 'Comics/Series',
    });
  });

  it('sends an explicit empty folder and applies it when moving to the root', () => {
    const book: Book = {
      ...baseBook,
      format: 'fbz',
      folder: 'Fiction/Classics',
    };
    const s = state();
    queueChanges(s, book, { ...book, folder: '' });
    const value = prepareBatch(s).operations[0].value!;
    expect(value).toHaveProperty('folder', '');
    const received = emptySync();
    acceptResponse(received, validateResponse(response(value), 0, []));
    expect(applyRecords(received, [book])[0]).toMatchObject({
      format: 'fbz',
      folder: '',
    });
  });
});

describe('reader/server metadata validation parity', () => {
  it.each(['pdf', 'CBZ', '', null, 1, ['cbz'], { format: 'cbz' }])(
    'rejects invalid format %j',
    (format) => {
      expect(() => validateBook({ ...baseBook, format })).toThrow();
      expect(() =>
        validateResponse(response({ title: 'Book', format }), 0, []),
      ).toThrow();
    },
  );

  it.each([
    '../escape',
    '/absolute',
    'a/../b',
    'a\\b',
    'a//b',
    'a/',
    ' a',
    'a\0b',
    'a\u0085b',
    'a'.repeat(256),
    '界'.repeat(86),
    Array(9).fill('界'.repeat(40)).join('/'),
  ])('rejects invalid folder %j', (folder) => {
    expect(validFolder(folder)).toBe(false);
    expect(() => validateBook({ ...baseBook, folder })).toThrow();
    expect(() =>
      validateResponse(response({ title: 'Book', folder }), 0, []),
    ).toThrow();
  });

  it.each(['', 'Fiction/Classics', 'a'.repeat(255), '界'.repeat(85)])(
    'accepts server-compatible folder %j',
    (folder) => {
      expect(validFolder(folder)).toBe(true);
      expect(validateBook({ ...baseBook, folder }).folder).toBe(folder);
      expect(
        validateResponse(response({ title: 'Book', folder }), 0, []).changes[0]
          .candidates[0].value,
      ).toHaveProperty('folder', folder);
    },
  );
});
