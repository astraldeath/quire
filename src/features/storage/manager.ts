import {
  getNativeFileReference,
  getFile,
  listBooks,
  loadSync,
  removeFileWhen,
} from '../../storage';
import { syncNow } from '../sync/engine';
import { files, upload, download } from '../sync/transport';
import type { Account } from '../sync/model';
import { eligible, owner, readPolicy } from './policy';

const attempts = new Map<string, number>();
let attempt = 0;
let active: string | null = null;
export function protectOpenBook(id: string | null) {
  active = id;
}
let running: Promise<void> | undefined;
let message = '';
export const storageMessage = () => message;
function report(text: string) {
  message = text;
  window.dispatchEvent(new Event('quire-storage-status'));
}
async function current(a: Account) {
  const state = await loadSync();
  return (
    !!state.enabled &&
    !!state.account &&
    owner(state.account) === owner(a) &&
    state.account.sessionId === a.sessionId
  );
}
export interface UploadResult {
  uploaded: string[];
  skipped: string[];
  failed: { id: string; message: string }[];
}
export async function uploadBooks(
  ids: string[],
  expected?: Account,
  options: {
    manual?: boolean;
    onProgress?(completed: number, total: number): void;
    canUpload?(id: string): boolean;
  } = {},
): Promise<UploadResult> {
  const state = await loadSync();
  if (!state.enabled || !state.account)
    throw new Error('Connect to your server first.');
  const account = expected ?? state.account;
  if (!(await current(account)))
    throw new Error('Your server account changed. Try again.');
  await syncNow();
  if (!(await current(account)))
    throw new Error('Your server account changed. Try again.');
  const remote = await files(account);
  const result: UploadResult = { uploaded: [], skipped: [], failed: [] };
  const unique = [...new Set(ids)];
  for (const [index, id] of unique.entries()) {
    if (!(await current(account))) {
      if (!options.manual)
        throw new Error('Your server account changed. Try again.');
      result.failed.push(
        ...unique.slice(index).map((id) => ({
          id,
          message:
            'Your server account changed. Reopen upload to choose a destination.',
        })),
      );
      break;
    }
    if (expected && !options.manual && !readPolicy(account).autoUpload)
      return result;
    try {
      if (options.canUpload && !options.canUpload(id))
        throw new Error('Unlock this book before uploading.');
      if (remote.some((f) => f.bookId === id)) result.skipped.push(id);
      else {
        const bytes = (await getNativeFileReference(id)) ?? (await getFile(id));
        if (!bytes) throw new Error('The book file is not on this device.');
        if (!(await current(account)))
          throw new Error('Your server account changed. Try again.');
        if (expected && !options.manual && !readPolicy(account).autoUpload)
          return result;
        if (options.canUpload && !options.canUpload(id))
          throw new Error('Unlock this book before uploading.');
        await upload(account, id, bytes);
        result.uploaded.push(id);
      }
    } catch (e) {
      if (!options.manual) throw e;
      result.failed.push({
        id,
        message: e instanceof Error ? e.message : 'Upload failed.',
      });
    }
    options.onProgress?.(index + 1, unique.length);
  }
  window.dispatchEvent(new Event('quire-synced'));
  return result;
}
export function manageStorage(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine || document.hidden) return;
    const state = await loadSync();
    if (!state.enabled || !state.account) return;
    const account = state.account,
      policy = readPolicy(account);
    if (!policy.autoUpload && !policy.offload) return;
    let uploadError = '';
    let remote = await files(account);
    let books = await listBooks();
    if (policy.autoUpload) {
      const pending = books
        .filter((b) => b.local && !remote.some((f) => f.bookId === b.id))
        .sort(
          (a, b) =>
            (attempts.get(owner(account) + '/upload/' + a.id) ?? 0) -
            (attempts.get(owner(account) + '/upload/' + b.id) ?? 0),
        );
      // One file per pass keeps imports and reading responsive.
      if (
        pending.length &&
        (await current(account)) &&
        readPolicy(account).autoUpload
      ) {
        report(`Uploading ${pending[0].title}…`);
        attempts.set(owner(account) + '/upload/' + pending[0].id, ++attempt);
        try {
          await uploadBooks([pending[0].id], account);
        } catch (error) {
          uploadError = error instanceof Error ? error.message : String(error);
        }
        remote = await files(account);
      }
    }
    if (!(await current(account))) return;
    books = await listBooks();
    let total = 0;
    const fresh = readPolicy(account);
    if (fresh.offload && books.some((b) => eligible(b, fresh, active))) {
      if (fresh.maxMB)
        for (const b of books.filter((b) => b.local)) {
          const size = (await getFile(b.id))?.byteLength ?? 0;
          total += size;
        }
      const candidates = books
        .filter((b) => eligible(b, fresh, active))
        .sort(
          (a, b) =>
            (attempts.get(owner(account) + '/offload/' + a.id) ?? 0) -
              (attempts.get(owner(account) + '/offload/' + b.id) ?? 0) ||
            Math.max(
              a.addedAt,
              a.position?.updatedAt ?? 0,
              fresh.accessed[a.id] ?? 0,
            ) -
              Math.max(
                b.addedAt,
                b.position?.updatedAt ?? 0,
                fresh.accessed[b.id] ?? 0,
              ),
        );
      for (const book of candidates) {
        const latest = readPolicy(account);
        if (!eligible(book, latest, active) || !(await current(account)))
          continue;
        if (latest.maxMB && total <= latest.maxMB * 1024 * 1024) break;
        if (!remote.some((f) => f.bookId === book.id)) continue;
        report(`Checking server copy of ${book.title}…`);
        // A listed file may have disappeared from a watched folder. Verify actual bytes.
        attempts.set(owner(account) + '/offload/' + book.id, ++attempt);
        const bytes = await download(account, book.id);
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', bytes.slice().buffer),
          ),
          (b) => b.toString(16).padStart(2, '0'),
        ).join('');
        if (hash !== book.id)
          throw new Error(
            'Server copy could not be verified. Downloads were kept.',
          );
        await removeFileWhen(book.id, async (b, s) => {
          let usage = 0;
          const limit = readPolicy(account).maxMB;
          if (limit)
            for (const local of (await listBooks()).filter((b) => b.local))
              usage += (await getFile(local.id))?.byteLength ?? 0;
          const policy = readPolicy(account);
          return (
            !!s.enabled &&
            !!s.account &&
            owner(s.account) === owner(account) &&
            s.account.sessionId === account.sessionId &&
            eligible(b, policy, active) &&
            (!policy.maxMB || usage > policy.maxMB * 1024 * 1024)
          );
        });
        window.dispatchEvent(new Event('quire-synced'));
        break;
      }
    }
    report(uploadError);
  })()
    .catch((e) => report(e instanceof Error ? e.message : String(e)))
    .finally(() => {
      running = undefined;
    });
  return running;
}
export function startStorageManagement() {
  const run = () => {
    void manageStorage();
  };
  const timer = window.setInterval(run, 60000);
  window.addEventListener('online', run);
  window.addEventListener('quire-storage-policy', run);
  document.addEventListener('visibilitychange', run);
  run();
  return () => {
    clearInterval(timer);
    window.removeEventListener('online', run);
    window.removeEventListener('quire-storage-policy', run);
    document.removeEventListener('visibilitychange', run);
  };
}
