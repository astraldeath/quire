// @vitest-environment node
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDB } from 'idb';
import { restoreBooks, getFile } from './storage';
import type { Book } from './domain/models';

it('restores a Blob directly into IndexedDB and materializes bytes only when opened', async () => {
  const book: Book = {
    id: 'blob-restore',
    title: 'Comic',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: true,
  };
  const file = new Blob([new Uint8Array([0, 128, 255])]);
  await restoreBooks([{ book, file }]);
  const db = await openDB('quire-library');
  const stored = await db.get('files', book.id);
  expect(stored).toBeInstanceOf(Blob);
  expect(await getFile(book.id)).toEqual(new Uint8Array([0, 128, 255]));
  db.close();
});
