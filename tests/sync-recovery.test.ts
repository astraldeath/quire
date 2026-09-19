import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  prepareBatch,
  queueChanges,
  conflictsForReview,
  resolveConflict,
  queueValue,
  emptySync,
} from '../src/features/sync/model';
import { SyncConflictError } from '../src/features/sync/errors';
import { recoverSyncBatch } from '../src/features/sync/recovery';
import * as storage from '../src/storage';
import * as transport from '../src/features/sync/transport';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/sync/transport', () => ({ call: vi.fn() }));
storage.useBrowserAccount('recovery');
beforeEach(async () => {
  vi.mocked(transport.call).mockReset();
  await storage.syncTransaction((s) => {
    Object.assign(s, emptySync(), {
      enabled: true,
      account: {
        origin: 'https://quire.example',
        username: 'reader',
        sessionId: 'session',
      },
      cursor: 333,
    });
    return { result: undefined };
  });
});

it('isolates a rejected position, syncs unrelated books, and preserves the local choice', async () => {
  const account = {
    origin: 'https://quire.example',
    username: 'reader',
    sessionId: 'session',
  };
  const book = {
    id: 'a'.repeat(64),
    title: 'A',
    author: '',
    series: '',
    volume: null,
    cover: '',
    addedAt: 0,
    local: true,
  };
  const position = {
    cfi: 'epubcfi(/6/18)',
    fraction: 0.05,
    section: 'Chapter 8',
  };
  await storage.syncTransaction((s) => {
    s.account = account;
    s.enabled = true;
    s.cursor = 333;
    s.pending.push({
      id: 'rejected',
      bookId: book.id,
      kind: 'position',
      recordId: 'default',
      baseRevision: 233,
      deleted: false,
      value: position,
    });
    queueChanges(s, undefined, { ...book, id: 'b'.repeat(64) });
    return { result: undefined };
  });
  const batch = await storage.syncTransaction((s) => ({
    result: prepareBatch(s),
  }));
  const remote = {
    bookId: book.id,
    kind: 'position' as const,
    recordId: 'default',
    revision: 249,
    candidates: Array.from({ length: 16 }, (_, i) => ({
      operationId: `remote-${i}`,
      deleted: false,
      value: { ...position, fraction: i / 20 },
      createdAt: i,
    })),
  };
  vi.mocked(transport.call).mockImplementation(async (_account, body) => {
    const request = body as typeof batch;
    if (!request.operations.length)
      return {
        results: [],
        changes: [{ ...remote, cursor: 333 }],
        cursor: 333,
        hasMore: false,
      };
    if (request.operations[0].id === 'rejected') throw new SyncConflictError();
    return {
      results: [{ id: request.operations[0].id, revision: 1, conflict: false }],
      changes: [],
      cursor: 333,
      hasMore: false,
    };
  });
  await recoverSyncBatch(account, batch.operations);
  const state = await storage.loadSync();
  expect(state.pending).toHaveLength(1);
  expect(state.pending[0]).toMatchObject({
    id: 'rejected',
    blocked: true,
    value: position,
    baseRevision: 233,
  });
  expect(prepareBatch(state).operations).toEqual([]);
  const review = conflictsForReview(state);
  expect(review).toHaveLength(1);
  expect(review[0].candidates.at(-1)).toMatchObject({
    operationId: 'rejected',
    value: position,
  });
  queueValue(state, remote, { ...position, fraction: 0.2 });
  expect(prepareBatch(state).operations).toEqual([]);
  expect(() =>
    resolveConflict(state, review[0], review[0].candidates.at(-1)!),
  ).toThrow('conflict changed');
  const latest = conflictsForReview(state)[0];
  resolveConflict(state, latest, latest.candidates.at(-1)!);
  const resolution = prepareBatch(state).operations;
  expect(resolution).toHaveLength(1);
  expect(resolution[0]).toMatchObject({
    baseRevision: 249,
    value: { fraction: 0.2 },
  });
  expect(resolution[0].id).not.toBe('rejected');
  expect(resolution[0]).not.toHaveProperty('blocked');
  expect(resolution[0]).not.toHaveProperty('dependsOn');
});

it('refreshes a restored server cursor without pending operations', async () => {
  const before = await storage.loadSync();
  await storage.syncTransaction((s) => {
    s.pending = [];
    s.cursor = 333;
    return { result: undefined };
  });
  vi.mocked(transport.call).mockResolvedValue({
    results: [],
    changes: [],
    cursor: 0,
    hasMore: false,
  });
  await recoverSyncBatch(before.account!, []);
  expect((await storage.loadSync()).cursor).toBe(0);
});

it('does not replace acknowledgements written by another tab during recovery', async () => {
  const before = await storage.loadSync();
  vi.mocked(transport.call).mockImplementationOnce(async () => {
    await storage.syncTransaction((s) => {
      s.cursor = 10;
      s.acknowledged = { newer: { revision: 12, conflict: false } };
      return { result: undefined };
    });
    return { results: [], changes: [], cursor: 0, hasMore: false };
  });
  await recoverSyncBatch(before.account!, []);
  const after = await storage.loadSync();
  expect(after.cursor).toBe(10);
  expect(after.acknowledged).toHaveProperty('newer');
});

it('does not commit a recovery response after switching sessions', async () => {
  const before = await storage.loadSync();
  vi.mocked(transport.call).mockImplementationOnce(async () => {
    await storage.syncTransaction((s) => {
      s.account = { ...s.account!, sessionId: 'replacement' };
      return { result: undefined };
    });
    return { results: [], changes: [], cursor: 0, hasMore: false };
  });
  await recoverSyncBatch(before.account!, []);
  expect((await storage.loadSync()).cursor).toBe(333);
});
