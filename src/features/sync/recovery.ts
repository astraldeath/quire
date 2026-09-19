import { loadSync, syncTransaction } from '../../storage';
import { call } from './transport';
import { SyncConflictError } from './errors';
import {
  acceptResponse,
  applyRecords,
  recordKey,
  type Account,
  type Operation,
  type RemoteRecord,
} from './model';
import { validateResponse } from './validation';

/** A rejected atomic batch must not strand unrelated edits behind one record. */
export async function recoverSyncBatch(
  account: Account,
  rejected: Operation[],
) {
  const current = (s: Awaited<ReturnType<typeof loadSync>>) =>
    s.enabled &&
    s.account?.origin === account.origin &&
    s.account?.username === account.username &&
    s.account?.sessionId === account.sessionId;
  const version = (s: Awaited<ReturnType<typeof loadSync>>) =>
    JSON.stringify([s.cursor, s.records, s.acknowledged]);
  const initial = await loadSync();
  if (!current(initial)) return;
  const baseline = version(initial);
  // Read a fresh snapshot, including records older than the cached cursor. The
  // server may have been restored; never rebase and overwrite automatically.
  let cursor = 0;
  const records: Record<string, RemoteRecord> = {};
  for (;;) {
    if (!current(await loadSync())) return;
    const response = validateResponse(
      await call(account, { cursor, operations: [] }),
      cursor,
      [],
    );
    for (const { cursor: _, ...record } of response.changes)
      records[recordKey(record)] = record;
    cursor = response.cursor;
    if (!response.hasMore) break;
  }
  const active = await syncTransaction((s) => {
    // Another tab may have acknowledged newer changes during the pull. Leave
    // its state intact and let the main sync loop retry against that state.
    if (!current(s) || version(s) !== baseline) return { result: false };
    s.records = records;
    s.acknowledged = {};
    s.cursor = cursor;
    return { result: true };
  });
  if (!active) return;
  for (const operation of rejected) {
    const state = await loadSync();
    if (!current(state)) return;
    if (
      !state.pending.some((p) => p.id === operation.id) ||
      state.pending.some(
        (p) => p.blocked && recordKey(p) === recordKey(operation),
      )
    )
      continue;
    try {
      const response = validateResponse(
        await call(account, { cursor: state.cursor, operations: [operation] }),
        state.cursor,
        [operation.id],
      );
      await syncTransaction((s, books) => {
        if (!current(s)) return { result: undefined };
        acceptResponse(s, response);
        return { result: undefined, books: applyRecords(s, books) };
      });
    } catch (error) {
      if (!(error instanceof SyncConflictError)) throw error;
      await syncTransaction((s) => {
        if (current(s)) {
          const pending = s.pending.find((p) => p.id === operation.id);
          if (pending) pending.blocked = true;
        }
        return { result: undefined };
      });
    }
  }
}
