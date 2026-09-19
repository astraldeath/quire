import { expect, it } from 'vitest';
import {
  createBackup,
  createBackupBlob,
  readBackup,
} from '../src/features/backup/archive';
import { mergeBook } from '../src/features/backup/merge';
import { defaults, type Book } from '../src/domain/models';
import { validateBook } from '../src/features/backup/validation';
const bytes = new Uint8Array([1, 2, 3]);
const book: Book = {
  id: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  title: 'Book',
  author: 'Author',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: true,
};
it('migrates legacy folder metadata and roundtrips all memberships, including explicit clearing', async () => {
  expect(validateBook({ ...book, folder: 'A' })).toMatchObject({
    folders: ['A'],
    folder: 'A',
  });
  expect(validateBook({ ...book, folder: 'A', folders: [] })).toMatchObject({
    folders: [],
    folder: '',
  });
  const organized = { ...book, folders: ['A', 'B/C'], folder: 'stale' };
  const backup = await readBackup(
    await createBackup([{ book: organized }], defaults, 'data'),
  );
  expect(backup.records[0].book).toMatchObject({
    folders: ['A', 'B/C'],
    folder: 'A',
  });
  expect(
    mergeBook({ ...book, folders: ['Local', 'Other'] }, backup.records[0].book)
      .folders,
  ).toEqual(['Local', 'Other']);
  for (const folders of [
    [''],
    ['A', 'A'],
    ['../A'],
    Array.from({ length: 33 }, (_, i) => String(i)),
  ])
    expect(() => validateBook({ ...book, folders })).toThrow();
});
it('roundtrips private library restrictions without device authentication or sync metadata', async () => {
  const privacy = {
    credential: { salt: 'a'.repeat(32), hash: 'b'.repeat(64) },
    books: { [book.id]: 'hidden' as const },
  };
  const backup = await readBackup(
    await createBackup([{ book }], defaults, 'data', [], privacy),
  );
  expect(backup.privacy).toEqual(privacy);
  await expect(
    createBackup([{ book }], defaults, 'data', [], {
      credential: null,
      books: privacy.books,
    }),
  ).rejects.toThrow('private library');
});
it('roundtrips full backup bytes and data-only metadata', async () => {
  const full = await readBackup(
    await createBackup([{ book, file: bytes }], defaults, 'full'),
  );
  expect(full.records[0].file).toEqual(bytes);
  expect(full.records[0].book.title).toBe('Book');
  const data = await readBackup(
    await createBackup([{ book, file: bytes }], defaults, 'data'),
  );
  expect(data.records[0].file).toBeUndefined();
  expect(data.records[0].book.local).toBe(false);
});
it('preserves detected chapter progress in backups and rejects invalid chapter values', async () => {
  const chapterBook = {
    ...book,
    position: {
      cfi: 'epubcfi(/6/2)',
      fraction: 0.5,
      section: 'Chapter 5',
      updatedAt: 1,
      completedChapter: 4,
      currentChapter: 5,
    },
  };
  const data = await readBackup(
    await createBackup([{ book: chapterBook }], defaults, 'data'),
  );
  expect(data.records[0].book.position?.completedChapter).toBe(4);
  expect(data.records[0].book.position?.currentChapter).toBe(5);
  for (const currentChapter of [0, -1, 1.5, 100001])
    expect(() =>
      validateBook({
        ...chapterBook,
        position: { ...chapterBook.position, currentChapter },
      }),
    ).toThrow();
  for (const completedChapter of [-1, 1.5, 100001])
    expect(() =>
      validateBook({
        ...chapterBook,
        position: { ...chapterBook.position, completedChapter },
      }),
    ).toThrow();
});
it('rejects bytes that do not match the book identity', async () => {
  await expect(
    createBackup([{ book, file: new Uint8Array([9]) }], defaults, 'full'),
  ).rejects.toThrow('identity');
});
it('merges newest progress and preserves conflicting notes without duplicates on repeat restore', () => {
  const note = {
    id: 'note',
    kind: 'highlight' as const,
    cfi: 'epubcfi(/6/2)',
    text: 'Word',
    note: 'Local note',
    section: 'One',
    createdAt: 1,
    updatedAt: 3,
  };
  const local = {
    ...book,
    title: 'My title',
    position: { cfi: 'a', fraction: 0.8, section: 'Later', updatedAt: 5 },
    annotations: [note],
  };
  const incoming = {
    ...book,
    position: { cfi: 'b', fraction: 0.2, section: 'Earlier', updatedAt: 2 },
    annotations: [{ ...note, note: 'Backup note', updatedAt: 2 }],
  };
  const merged = mergeBook(local, incoming);
  expect(merged.title).toBe('My title');
  expect(merged.position).toEqual(local.position);
  expect(merged.annotations?.map((n) => n.note)).toEqual([
    'Local note',
    'Backup note',
  ]);
  expect(mergeBook(merged, incoming)).toEqual(merged);
});
it('rejects non backup files', async () => {
  await expect(readBackup(bytes)).rejects.toThrow();
});

import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js';
async function archiveWith(manifest: unknown) {
  const w = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    level: 0,
  });
  await w.add(
    'manifest.json',
    new Uint8ArrayReader(new TextEncoder().encode(JSON.stringify(manifest))),
  );
  return w.close();
}
const manifest = {
  format: 'quire-backup',
  version: 1,
  createdAt: 1,
  kind: 'data',
  preferences: defaults,
  books: [book],
  files: [],
};
it('rejects future formats, duplicate books, and unsafe cover URLs', async () => {
  await expect(
    readBackup(await archiveWith({ ...manifest, version: 99 })),
  ).rejects.toThrow('version');
  await expect(
    readBackup(await archiveWith({ ...manifest, books: [book, book] })),
  ).rejects.toThrow('book list');
  await expect(
    readBackup(
      await archiveWith({
        ...manifest,
        books: [{ ...book, cover: 'https://tracker.test/image' }],
      }),
    ),
  ).rejects.toThrow('invalid library data');
});
it('rejects archives with missing book files', async () => {
  await expect(
    readBackup(
      await archiveWith({ ...manifest, kind: 'full', files: [book.id] }),
    ),
  ).rejects.toThrow();
});
it('keeps newer incoming progress but never removes unrelated annotations', () => {
  const p = { cfi: 'new', fraction: 0.1, section: 'One', updatedAt: 10 };
  expect(
    mergeBook(
      { ...book, position: { ...p, updatedAt: 1 } },
      { ...book, position: p },
    ).position,
  ).toEqual(p);
});
it.each(['added', 'last-read', 'volume'] as const)(
  'roundtrips %s sort preference',
  async (sort) => {
    const restored = await readBackup(
      await createBackup([{ book }], { ...defaults, sort }, 'data'),
    );
    expect(restored.preferences.sort).toBe(sort);
  },
);

it('roundtrips a full backup with a book larger than 128 MB', async () => {
  const file = new Uint8Array(128 * 1024 * 1024 + 1);
  file[0] = 7;
  file[file.length - 1] = 9;
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', file)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const archive = await createBackupBlob(
    [{ book: { ...book, id, format: 'cbz' }, file: async () => file }],
    defaults,
    'full',
  );
  expect(archive.size).toBeGreaterThan(128 * 1024 * 1024);
  const restored = await readBackup(archive);
  const restoredFile = restored.records[0].file!;
  expect(restoredFile.size).toBe(file.length);
  expect(new Uint8Array(await restoredFile.slice(0, 1).arrayBuffer())[0]).toBe(
    7,
  );
  expect(new Uint8Array(await restoredFile.slice(-1).arrayBuffer())[0]).toBe(9);
}, 60000);

it('rejects a declared decompression bomb before allocating its book buffer', async () => {
  const archive = await createBackup([{ book, file: bytes }], defaults, 'full');
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  let entries = 0;
  for (let offset = 0; offset < archive.length - 46; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50 && ++entries === 2) {
      view.setUint32(offset + 24, 600 * 1024 * 1024, true);
      break;
    }
  }
  expect(entries).toBe(2);
  await expect(readBackup(archive)).rejects.toThrow('size limit');
});

it('keeps Blob-input restore files as Blobs after validating their identities', async () => {
  const archive = await createBackupBlob(
    [{ book, file: bytes }],
    defaults,
    'full',
  );
  const restored = await readBackup(archive);
  expect(restored.records[0].file).not.toBeInstanceOf(Uint8Array);
  const file = restored.records[0].file as unknown as Blob;
  expect(file.size).toBe(bytes.length);
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
});
