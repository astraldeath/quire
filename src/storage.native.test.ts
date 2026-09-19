import { beforeEach, expect, it, vi } from 'vitest';
import type { Book } from './domain/models';
const state = vi.hoisted(() => ({
  books: new Map<string, { metadata: Book; file?: string }>(),
  objects: new Map<string, Uint8Array>(),
  next: 0,
  fail: false,
  largest: 0,
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string, args?: any, options?: any) => {
    if (command === 'prepare_library') return;
    if (command === 'book_file_begin') {
      const id = (++state.next).toString(16).padStart(64, '0');
      state.objects.set(id, new Uint8Array());
      return id;
    }
    if (command === 'book_file_append') {
      state.largest = Math.max(state.largest, args.byteLength);
      const id = options.headers['x-quire-file'];
      const old = state.objects.get(id)!;
      const next = new Uint8Array(old.length + args.length);
      next.set(old);
      next.set(args, old.length);
      state.objects.set(id, next);
      return;
    }
    if (command === 'book_file_finish') return;
    if (command === 'book_file_size') return state.objects.get(args.id)!.length;
    if (command === 'book_file_read')
      return state.objects
        .get(args.id)!
        .slice(args.offset, args.offset + args.length).buffer;
    if (command === 'book_file_remove' || command === 'book_file_abort') {
      state.objects.delete(args.id);
      return;
    }
    throw new Error(command);
  }),
}));
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => ({
      select: async (query: string, params?: string[]) => {
        if (query.includes('SELECT metadata'))
          return [...state.books.values()].map((r) => ({
            metadata: JSON.stringify(r.metadata),
            local: r.file == null ? 0 : 1,
          }));
        if (query.includes('SELECT file')) {
          const r = state.books.get(params![0]);
          return r ? [{ file: r.file ?? null }] : [];
        }
        if (query.includes('sync_state')) return [];
        throw new Error(query);
      },
      execute: async (_query: string, params: string[]) => {
        if (state.fail) throw new Error('rollback');
        const payload = JSON.parse(params[0]);
        for (const id of payload.deleted) state.books.delete(id);
        for (const w of payload.writes)
          state.books.set(w.book.id, {
            metadata: w.book,
            file:
              w.fileMode === 'set'
                ? w.file
                : w.fileMode === 'remove'
                  ? undefined
                  : state.books.get(w.book.id)?.file,
          });
      },
    }),
  },
}));
import { putBook, getFile, removeFile, saveBook, deleteBooks } from './storage';
const book: Book = {
  id: 'book',
  title: 'Comic',
  author: '',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: true,
};
beforeEach(() => {
  state.books.clear();
  state.objects.clear();
  state.fail = false;
  state.largest = 0;
});
it('stores binary chunks outside SQLite and retains files across metadata edits', async () => {
  const bytes = new Uint8Array(3 * 1024 * 1024 + 7);
  bytes[0] = 255;
  bytes[bytes.length - 1] = 42;
  await putBook(book, bytes);
  expect(state.largest).toBe(1024 * 1024);
  expect(state.books.get(book.id)!.file).toMatch(/^@quire-file:[0-9a-f]{64}$/);
  await saveBook({ ...book, title: 'Edited' });
  const restored = (await getFile(book.id))!;
  expect(Buffer.compare(Buffer.from(restored), Buffer.from(bytes))).toBe(0);
});
it('preserves old bytes on rollback and serializes concurrent replacements', async () => {
  await putBook(book, new Uint8Array([1]));
  const old = state.books.get(book.id)!.file;
  state.fail = true;
  await expect(putBook(book, new Uint8Array([2]))).rejects.toThrow('rollback');
  state.fail = false;
  expect(state.books.get(book.id)!.file).toBe(old);
  expect(await getFile(book.id)).toEqual(new Uint8Array([1]));
  await Promise.all([
    putBook(book, new Uint8Array([3])),
    putBook(book, new Uint8Array([4])),
  ]);
  expect(await getFile(book.id)).toEqual(new Uint8Array([4]));
  expect(state.objects.has(old!.slice(12))).toBe(false);
  await removeFile(book.id);
  expect(await getFile(book.id)).toBeUndefined();
  await putBook(book, new Uint8Array([5]));
  await deleteBooks([book.id]);
  expect(await getFile(book.id)).toBeUndefined();
});
it('reads existing base64 rows without rewriting them', async () => {
  state.books.set(book.id, {
    metadata: book,
    file: btoa(String.fromCharCode(0, 128, 255)),
  });
  expect(await getFile(book.id)).toEqual(new Uint8Array([0, 128, 255]));
  await saveBook({ ...book, title: 'Legacy' });
  expect(state.books.get(book.id)!.file).toBe('AID/');
});
