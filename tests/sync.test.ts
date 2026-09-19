import { describe, it, expect } from 'vitest';
import {
  emptySync,
  queueChanges,
  prepareBatch,
  acceptResponse,
  applyRecords,
  conflictsForReview,
  resolveConflict,
  type SyncState,
} from '../src/features/sync/model';
import type { Book } from '../src/domain/models';
const book: Book = {
  id: 'a'.repeat(64),
  title: 'Book',
  author: '',
  series: '',
  volume: null,
  cover: '',
  addedAt: 0,
  local: true,
};
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

it('resolves legacy metadata conflicts with explicit preserved memberships on the wire', () => {
  for (const currentBook of [
    undefined,
    { ...book, folders: ['A', 'B'], folder: 'A' },
  ])
    for (const value of [
      { title: 'Legacy title' },
      { title: 'Legacy title', folder: '' },
      { title: 'Legacy title', folder: 'Other' },
    ]) {
      const s = state();
      s.records[`${book.id}/book/default`] = {
        bookId: book.id,
        kind: 'book',
        recordId: 'default',
        revision: 3,
        candidates: [
          { operationId: 'legacy', deleted: false, createdAt: 1, value },
          {
            operationId: 'modern',
            deleted: false,
            createdAt: 2,
            value: { title: 'Modern title', folders: ['A', 'B'], folder: 'A' },
          },
        ],
      };
      const record = conflictsForReview(s)[0];
      resolveConflict(s, record, record.candidates[0], currentBook);
      const folders =
        value.folder === undefined
          ? ['A', 'B']
          : value.folder
            ? ['Other', 'B']
            : ['B'];
      expect(prepareBatch(s).operations[0]).toMatchObject({
        baseRevision: 3,
        value: { title: 'Legacy title', folders, folder: folders[0] },
      });
      expect(record.candidates[0].value).toEqual(value);
    }
});

it('does not guess conflicting folder baselines on fresh-device legacy resolution', () => {
  const s = state();
  s.records[`${book.id}/book/default`] = {
    bookId: book.id,
    kind: 'book',
    recordId: 'default',
    revision: 3,
    candidates: [
      {
        operationId: 'legacy',
        deleted: false,
        createdAt: 1,
        value: { title: 'Legacy' },
      },
      {
        operationId: 'one',
        deleted: false,
        createdAt: 2,
        value: { title: 'One', folders: ['A', 'B'] },
      },
      {
        operationId: 'two',
        deleted: false,
        createdAt: 3,
        value: { title: 'Two', folders: [] },
      },
    ],
  };
  const record = conflictsForReview(s)[0];
  expect(() => resolveConflict(s, record, record.candidates[0])).toThrow(
    'Choose a version with folder information',
  );
  expect(s.pending).toEqual([]);
  resolveConflict(s, record, record.candidates[2]);
  expect(prepareBatch(s).operations[0].value).toMatchObject({
    title: 'Two',
    folders: [],
  });
});

it('queues secondary membership changes and explicit clearing, with matching legacy primary', () => {
  const s = state();
  queueChanges(
    s,
    { ...book, folder: 'A' },
    { ...book, folders: ['A', 'B'], folder: 'stale' },
  );
  expect(prepareBatch(s).operations[0].value).toMatchObject({
    folders: ['A', 'B'],
    folder: 'A',
  });
  const cleared = state();
  queueChanges(
    cleared,
    { ...book, folders: ['A', 'B'] },
    { ...book, folders: [], folder: 'A' },
  );
  expect(prepareBatch(cleared).operations[0].value).toMatchObject({
    folders: [],
    folder: '',
  });
});

it('negotiates old-server payloads without changing retry identity after upgrades or reloads', () => {
  const s = state();
  queueChanges(s, undefined, { ...book, folders: ['A'] });
  const legacy = prepareBatch(s, false);
  expect(legacy.operations[0].value).toMatchObject({ folder: 'A' });
  expect(legacy.operations[0].value).not.toHaveProperty('folders');
  expect(s.pending[0].value).toMatchObject({ folders: ['A'] });
  expect(prepareBatch(JSON.parse(JSON.stringify(s)), true)).toEqual(legacy);
  const multi = state();
  queueChanges(multi, undefined, { ...book, folders: ['A', 'B'] });
  expect(() => prepareBatch(multi, false)).toThrow('Update Quire Server');
  expect(multi.pending[0].frozen).toBeUndefined();
  expect(prepareBatch(multi, true).operations[0].value).toMatchObject({
    folders: ['A', 'B'],
  });
});

it('applies array membership changes and preserves multi-folder organization in legacy records', () => {
  const s = state();
  const record = {
    bookId: book.id,
    kind: 'book' as const,
    recordId: 'default',
    revision: 1,
    candidates: [
      {
        operationId: 'op',
        createdAt: 1,
        deleted: false,
        value: { title: 'Book', folder: 'C' } as Record<string, unknown>,
      },
    ],
  };
  s.records[`${book.id}/book/default`] = record;
  const local = { ...book, folders: ['A', 'B'], folder: 'A' };
  expect(applyRecords(s, [local])[0]).toMatchObject({
    folders: ['A', 'B'],
    folder: 'A',
  });
  record.candidates[0].value = {
    title: 'Book',
    folders: ['D', 'E'],
    folder: 'stale',
  };
  expect(applyRecords(s, [local])[0]).toMatchObject({
    folders: ['D', 'E'],
    folder: 'D',
  });
  record.candidates[0].value = { title: 'Book', folders: [], folder: 'A' };
  expect(applyRecords(s, [local])[0]).toMatchObject({
    folders: [],
    folder: '',
  });
});

it('replays legacy folder records without progressively removing local memberships', () => {
  for (const folder of ['', 'Replacement']) {
    const s = state();
    s.records[`${book.id}/book/default`] = {
      bookId: book.id,
      kind: 'book',
      recordId: 'default',
      revision: 1,
      candidates: [
        {
          operationId: 'legacy',
          createdAt: 1,
          deleted: false,
          value: { title: 'Book', folder },
        },
      ],
    };
    let books: Book[] = [{ ...book, folders: ['A', 'B', 'C'], folder: 'A' }];
    for (let i = 0; i < 4; i++) {
      books = applyRecords(s, books);
      expect(books[0]).toMatchObject({ folders: ['A', 'B', 'C'], folder: 'A' });
    }
    const single = applyRecords(s, [{ ...book, folders: ['A'], folder: 'A' }]);
    expect(single[0]).toMatchObject({
      folders: folder ? [folder] : [],
      folder,
    });
    expect(applyRecords(s, single)).toEqual(single);
  }
});
describe('durable sync outbox', () => {
  it('coalesces unsent edits but preserves an in-flight retry and rebases the next edit', () => {
    const s = state();
    queueChanges(s, undefined, book);
    const batch = prepareBatch(s);
    const first = batch.operations[0];
    queueChanges(s, book, { ...book, title: 'Edited' });
    expect(s.pending).toHaveLength(2);
    expect(prepareBatch(s).operations).toEqual(batch.operations);
    acceptResponse(s, {
      results: [{ id: first.id, revision: 1, conflict: false }],
      changes: [],
      cursor: 0,
      hasMore: false,
    });
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0].baseRevision).toBe(1);
    expect(s.pending[0].value).toMatchObject({ title: 'Edited' });
  });
  it('retains remote conflicts and queues annotation tombstones', () => {
    const s = state();
    const note = {
      id: 'n',
      kind: 'highlight' as const,
      cfi: 'epubcfi(/6/2)',
      text: 'word',
      note: 'note',
      section: 'one',
      createdAt: 0,
      updatedAt: 0,
    };
    queueChanges(
      s,
      { ...book, annotations: [note] },
      { ...book, annotations: [] },
    );
    expect(s.pending[0]).toMatchObject({
      kind: 'annotation',
      deleted: true,
      value: null,
    });
    const rec = {
      bookId: book.id,
      kind: 'annotation' as const,
      recordId: 'n',
      revision: 2,
      candidates: [
        {
          operationId: 'a',
          deleted: false,
          value: {
            kind: 'highlight',
            cfi: note.cfi,
            text: 'word',
            note: 'first',
            section: 'one',
          },
          createdAt: 1,
        },
        { operationId: 'b', deleted: true, value: null, createdAt: 2 },
      ],
    };
    acceptResponse(s, {
      results: [],
      changes: [{ ...rec, cursor: 1 }],
      cursor: 1,
      hasMore: false,
    });
    expect(Object.values(s.records)[0].candidates).toHaveLength(2);
  });
  it('does not enqueue local download removal or timestamps', () => {
    const s = state();
    queueChanges(s, book, { ...book, local: false, addedAt: 9 });
    expect(s.pending).toEqual([]);
  });
});
it('keeps a just-acknowledged local value until its change page arrives', async () => {
  const { applyRecords } = await import('../src/features/sync/model');
  const s = state();
  s.records[`${book.id}/book/default`] = {
    bookId: book.id,
    kind: 'book',
    recordId: 'default',
    revision: 1,
    candidates: [
      {
        operationId: 'old',
        deleted: false,
        value: { title: 'Old', author: '', series: '', volume: null },
        createdAt: 1,
      },
    ],
  };
  queueChanges(s, { ...book, title: 'Old' }, book);
  const batch = prepareBatch(s);
  acceptResponse(s, {
    results: [{ id: batch.operations[0].id, revision: 2, conflict: false }],
    changes: [],
    cursor: 0,
    hasMore: false,
  });
  expect(applyRecords(s, [book])[0].title).toBe('Book');
});
it('ordinary edits cannot silently resolve a known conflict', () => {
  const s = state();
  s.records[`${book.id}/book/default`] = {
    bookId: book.id,
    kind: 'book',
    recordId: 'default',
    revision: 2,
    candidates: [
      { operationId: 'a', deleted: false, value: { title: 'A' }, createdAt: 1 },
      { operationId: 'b', deleted: false, value: { title: 'B' }, createdAt: 2 },
    ],
  };
  queueChanges(s, book, { ...book, title: 'Edit' });
  expect(s.pending[0].baseRevision).toBeLessThan(2);
});
it('resolution sends only operation fields, never remote record internals', async () => {
  const { queueValue } = await import('../src/features/sync/model');
  const s = state();
  const record = {
    bookId: book.id,
    kind: 'book' as const,
    recordId: 'default',
    revision: 2,
    candidates: [
      { operationId: 'a', deleted: false, value: { title: 'A' }, createdAt: 1 },
      { operationId: 'b', deleted: false, value: { title: 'B' }, createdAt: 2 },
    ],
  };
  s.records[`${book.id}/book/default`] = record;
  queueValue(s, record, { title: 'A' }, true);
  const operation = prepareBatch(s).operations[0];
  expect(operation.baseRevision).toBe(2);
  expect(Object.keys(operation).sort()).toEqual([
    'baseRevision',
    'bookId',
    'deleted',
    'id',
    'kind',
    'recordId',
    'value',
  ]);
});
