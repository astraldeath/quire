import {
  syncFolderCatalog,
  FolderCatalogUnavailable,
} from '../library/folderSync';
import { syncReadingActivity } from '../statistics/sync';
import { syncCatalogSources } from '../opds/sources';
import { syncPrivacy, privacyChanged } from '../privacy/sync';
import { fetchCovers } from './library';
import { loadSync, syncTransaction } from '../../storage';
import {
  acceptResponse,
  applyRecords,
  emptySync,
  prepareBatch,
  queueChanges,
  type RemoteRecord,
  type Candidate,
} from './model';
import * as transport from './transport';
import { validateResponse } from './validation';
import { SyncConflictError } from './errors';
import { recoverSyncBatch } from './recovery';
import {
  conflictsForReview,
  sendableOperations,
  resolveConflict,
} from './model';
let running: Promise<void> | undefined;
let status = { busy: false, message: 'Not connected' };
const listeners = new Set<() => void>();
export const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export const snapshot = () => status;
function report(message: string, busy = false) {
  status = { message, busy };
  listeners.forEach((f) => f());
}
export async function connect(
  origin: string,
  username: string,
  password: string,
) {
  if (running) await running;
  const session = await transport.login(origin, username, password);
  try {
    await syncTransaction((s, books) => {
      if (s.account?.origin !== origin || s.account?.username !== username)
        Object.assign(s, emptySync());
      s.account = { origin, username, sessionId: session.id };
      s.enabled = true;
      for (const book of books)
        if (
          !Object.values(s.records).some((r) => r.bookId === book.id) &&
          !s.pending.some((p) => p.bookId === book.id)
        )
          queueChanges(s, undefined, book);
      return { result: undefined };
    });
  } catch (e) {
    await transport
      .logout({ origin, username, sessionId: session.id })
      .catch(() => {});
    throw e;
  }
  await syncNow();
}
export async function disconnect() {
  if (running) await running;
  const account = await syncTransaction((s) => {
    s.enabled = false;
    return { result: s.account };
  });
  report('Disconnected');
  if (account) await transport.logout(account);
}
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const initial = await loadSync();
    if (!initial.enabled || !initial.account) {
      report('Not connected');
      return;
    }
    report('Syncing', true);
    try {
      await syncPrivacy();
      const multipleFolders = await transport.supportsMultipleFolders(
        initial.account.origin,
      );
      const currentChapter = await transport.supportsCurrentChapter(
        initial.account.origin,
      );
      for (let i = 0; i < 100; i++) {
        const batch = await syncTransaction((s) => ({
          result: {
            account: s.account,
            enabled: s.enabled,
            request: prepareBatch(s, multipleFolders, currentChapter),
          },
        }));
        if (!batch.enabled || !batch.account) return;
        let raw;
        try {
          raw = await transport.call(batch.account, batch.request);
        } catch (error) {
          if (!(error instanceof SyncConflictError)) throw error;
          await recoverSyncBatch(batch.account, batch.request.operations);
          continue;
        }
        const response = validateResponse(
          raw,
          batch.request.cursor,
          batch.request.operations.map((o) => o.id),
        );
        const more = await syncTransaction((s, books) => {
          if (s.account?.sessionId !== batch.account!.sessionId || !s.enabled)
            return { result: false };
          acceptResponse(s, response);
          return {
            result: response.hasMore || sendableOperations(s).length > 0,
            books: applyRecords(s, books),
          };
        });
        if (!more) {
          await fetchCovers(batch.account);
          await syncReadingActivity();
          let folderNote = '';
          try {
            await syncFolderCatalog();
          } catch (error) {
            if (error instanceof FolderCatalogUnavailable)
              folderNote = error.message;
            else throw error;
          }
          const s = await loadSync();
          let catalogNote = '';
          try {
            await syncCatalogSources(true);
          } catch (error) {
            catalogNote =
              error instanceof Error
                ? error.message
                : 'Catalog sync failed. Open Catalogs to retry.';
          }
          const conflicts = conflictsForReview(s).length;
          report(
            conflicts
              ? `${conflicts} ${conflicts === 1 ? 'change needs' : 'changes need'} review in Settings → Sync`
              : catalogNote || folderNote || 'Up to date',
          );
          window.dispatchEvent(new Event('quire-synced'));
          if (import.meta.env.VITE_HOSTED === 'true')
            void transport
              .accountRequest(batch.account, '/v1/tracking/sync', {}, 'POST')
              .catch(() => {});
          return;
        }
      }
      report('More changes are queued. Sync will continue shortly.');
    } catch (e) {
      report(e instanceof Error ? e.message : String(e));
      throw e;
    }
  })().finally(() => {
    running = undefined;
  });
  return running;
}
export async function resolve(record: RemoteRecord, candidate: Candidate) {
  await syncTransaction((s, books) => {
    resolveConflict(
      s,
      record,
      candidate,
      books.find((book) => book.id === record.bookId),
    );
    return { result: undefined };
  });
  await syncNow();
}
export function startSync() {
  let timer: ReturnType<typeof setTimeout>;
  const run = () => {
    void syncNow().catch(() => {});
  };
  const foreground = () => {
    if (document.visibilityState === 'visible') run();
  };
  const changed = () => {
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void loadSync()
        .then((s) => {
          if (s.pending.length) run();
        })
        .catch(() => {});
    }, 1500);
  };
  const activityChanged = () => {
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(run, 1500);
  };
  window.addEventListener('quire-statistics', activityChanged);
  window.addEventListener(privacyChanged, activityChanged);
  window.addEventListener('quire-folders-changed', activityChanged);
  window.addEventListener('quire-catalogs-changed', activityChanged);
  window.addEventListener('quire-storage', changed);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', foreground);
  const interval = setInterval(
    foreground,
    import.meta.env.VITE_HOSTED === 'true' ? 10000 : 60000,
  );
  run();
  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener('quire-statistics', activityChanged);
    window.removeEventListener(privacyChanged, activityChanged);
    window.removeEventListener('quire-folders-changed', activityChanged);
    window.removeEventListener('quire-catalogs-changed', activityChanged);
    window.removeEventListener('quire-storage', changed);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', foreground);
  };
}
