import {
  getFile,
  listBooks,
  loadSync,
  putBook,
  syncTransaction,
} from '../../storage';

import { download, files, metadata } from './transport';
import type { Account } from './model';

/** Covers are immutable derivatives of the EPUB hash, cached independently of its file. */
export async function fetchCovers(account: Account) {
  const available = await files(account);
  const [state, books] = await Promise.all([loadSync(), listBooks()]);
  if (!state.enabled || state.account?.sessionId !== account.sessionId) return;
  for (const file of available) {
    const needed =
      !state.covers?.includes(file.bookId) &&
      books.some((b) => b.id === file.bookId && !b.cover);
    if (!needed) continue;
    const preview = await metadata(account, file.bookId);
    await syncTransaction((s, books) => {
      if (!s.enabled || s.account?.sessionId !== account.sessionId)
        return { result: undefined };
      s.covers = [...new Set([...(s.covers ?? []), file.bookId])];
      return {
        result: undefined,
        books: books.map((b) =>
          b.id === file.bookId && !b.cover ? { ...b, cover: preview.cover } : b,
        ),
      };
    });
  }
}

const downloads = new Map<string, Promise<Uint8Array>>();
export function ensureBookFile(id: string): Promise<Uint8Array> {
  const existing = downloads.get(id);
  if (existing) return existing;
  const task = (async () => {
    const local = await getFile(id);
    if (local) return local;
    const state = await loadSync();
    if (!state.enabled || !state.account)
      throw new Error(
        'Connect to your server to download this book, or import its EPUB.',
      );
    const bytes = await download(state.account, id);
    if (bytes.byteLength > 128 * 1024 * 1024)
      throw new Error('EPUB is too large (128 MB maximum).');
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    if (hash !== id)
      throw new Error('Downloaded EPUB does not match this book.');
    const book = (await listBooks()).find((b) => b.id === id);
    if (!book) throw new Error('This book is no longer in your library.');
    await putBook(book, bytes);
    window.dispatchEvent(new Event('quire-synced'));
    return bytes;
  })().finally(() => downloads.delete(id));
  downloads.set(id, task);
  return task;
}
