import {
  getFile,
  listBooks,
  loadSync,
  putDownloadedFile,
  syncTransaction,
} from '../../storage';
import { download, files, metadata, serverLimits } from './transport';
import { assertCurrentAccount, type Account } from './model';
import { readPolicy, writePolicy, touchBook } from '../storage/policy';

/** Covers are immutable derivatives of the book file hash, cached independently of its file. */
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

async function rememberAccess(id: string, expected?: Account) {
  try {
    const state = await loadSync();
    if (expected) assertCurrentAccount(state, expected);
    if (state.account)
      writePolicy(state.account, {
        accessed: { ...readPolicy(state.account).accessed, [id]: Date.now() },
      });
  } catch {
    /* Storage-policy persistence must not prevent reading a local file. */
  }
}
const downloads = new Map<string, Promise<Uint8Array>>();
export async function ensureBookFile(
  id: string,
  expected?: Account,
): Promise<Uint8Array> {
  touchBook(id);
  const local = await getFile(id);
  if (local) {
    if (expected) assertCurrentAccount(await loadSync(), expected);
    await rememberAccess(id, expected);
    return local;
  }
  const state = await loadSync();
  if (expected) assertCurrentAccount(state, expected);
  if (!state.enabled || !state.account)
    throw new Error(
      'Connect to your server to download this book, or import its original file.',
    );
  const account = state.account;
  const key = JSON.stringify([
    account.origin,
    account.username,
    account.sessionId,
    id,
  ]);
  const existing = downloads.get(key);
  if (existing) return existing;
  const task = (async () => {
    const bytes = await download(account, id);
    assertCurrentAccount(await loadSync(), account);
    if (
      bytes.byteLength > (await serverLimits(account.origin)).maxDownloadBytes
    )
      throw new Error('Book file is too large.');
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    if (hash !== id)
      throw new Error('Downloaded book file does not match this book.');
    await putDownloadedFile(id, bytes, account);
    await rememberAccess(id, account);
    window.dispatchEvent(new Event('quire-synced'));
    return bytes;
  })().finally(() => downloads.delete(key));
  downloads.set(key, task);
  return task;
}
