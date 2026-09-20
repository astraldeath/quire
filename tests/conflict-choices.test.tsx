import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';
import { ConflictChoices } from '../src/features/sync/ConflictChoices';
import { conflictFields } from '../src/features/sync/conflictPresentation';
import {
  emptySync,
  recordKey,
  type Candidate,
  type RemoteRecord,
} from '../src/features/sync/model';

const privacy = vi.hoisted(() => ({
  access: vi.fn<(bookId: string) => boolean>(),
  authenticate: vi.fn(),
}));
vi.mock('../src/features/privacy/Privacy', () => ({
  usePrivacy: () => privacy,
}));

const idA = 'a'.repeat(64);
const idB = 'b'.repeat(64);
const books: Book[] = [
  {
    id: idA,
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    series: '',
    volume: null,
    cover: '',
    addedAt: 1,
    local: true,
  },
  {
    id: idB,
    title: 'Through the Looking-Glass',
    author: 'Lewis Carroll',
    series: '',
    volume: null,
    cover: '',
    addedAt: 2,
    local: true,
  },
];

function candidate(
  operationId: string,
  value: Record<string, unknown> | null,
  createdAt: number,
  deleted = false,
): Candidate {
  return { operationId, value, createdAt, deleted };
}

function record(
  bookId: string,
  kind: RemoteRecord['kind'],
  recordId: string,
  candidates: Candidate[],
): RemoteRecord {
  return { bookId, kind, recordId, revision: 2, candidates };
}

function stateWith(...records: RemoteRecord[]) {
  const state = emptySync();
  state.enabled = true;
  for (const item of records) state.records[recordKey(item)] = item;
  return state;
}

function renderedText(markup: string) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.textContent ?? '';
}

beforeEach(() => {
  privacy.access.mockReset().mockReturnValue(true);
  privacy.authenticate.mockReset();
});

it('does not discard a passage when its annotation has a note', () => {
  const fields = conflictFields('annotation', {
    operationId: 'test',
    createdAt: 1,
    deleted: false,
    value: {
      kind: 'highlight',
      text: 'Selected passage',
      note: 'My note',
      section: 'Chapter 9',
    },
  });
  expect(fields).toContainEqual({
    label: 'Passage',
    value: 'Selected passage',
  });
  expect(fields).toContainEqual({ label: 'Note', value: 'My note' });
});

it.each([null, '', '0.5', undefined])(
  'does not present an invalid progress fraction (%s) as a percentage',
  (fraction) => {
    expect(
      conflictFields(
        'position',
        candidate('invalid-position', { fraction }, 1),
      ),
    ).toContainEqual({ label: 'Progress', value: 'Progress unavailable' });
  },
);

it('groups conflicts by known book and shows every version with explicit differences', () => {
  const alicePosition = record(idA, 'position', 'default', [
    candidate(
      'alice-local',
      { section: 'Down the Rabbit-Hole', fraction: 0.125 },
      0,
    ),
    candidate(
      'alice-server-1',
      { section: 'The Pool of Tears', fraction: 0.5 },
      1_725_000_000_000,
    ),
    candidate(
      'alice-server-2',
      { section: 'A Caucus-Race', fraction: 0.75 },
      1_726_000_000_000,
    ),
  ]);
  const lookingGlassPosition = record(idB, 'position', 'default', [
    candidate('glass-a', { section: 'Looking-Glass House', fraction: 0.2 }, 3),
    candidate('glass-b', { section: 'The Garden', fraction: Number.NaN }, 4),
  ]);
  const annotation = record(idA, 'annotation', 'highlight-1', [
    candidate(
      'annotation-a',
      {
        kind: 'highlight',
        section: 'Advice from a Caterpillar',
        text: 'Who are you?',
        note: 'Identity changes',
      },
      5,
    ),
    candidate('annotation-deleted', null, 6, true),
  ]);
  const state = stateWith(alicePosition, lookingGlassPosition, annotation);
  state.pending.push({
    id: 'alice-local',
    bookId: idA,
    kind: 'position',
    recordId: 'default',
    baseRevision: 1,
    deleted: false,
    value: alicePosition.candidates[0].value,
    blocked: true,
  });

  const markup = renderToStaticMarkup(
    <ConflictChoices
      books={books}
      state={state}
      busy={false}
      onResolve={() => {}}
    />,
  );
  const text = renderedText(markup);

  expect(text).toContain("Alice's Adventures in Wonderland");
  expect(text).toContain('Through the Looking-Glass');
  expect(text).toContain('Down the Rabbit-Hole');
  expect(text).toContain('The Pool of Tears');
  expect(text).toContain('A Caucus-Race');
  expect(text).toContain('12.5%');
  expect(text).toContain('Progress unavailable');
  expect(text).toContain('Passage');
  expect(text).toContain('Who are you?');
  expect(text).toContain('Note');
  expect(text).toContain('Identity changes');
  expect(text).toContain('Keep deletion');
  expect(text).toContain('Local version');
  expect(text).toContain('Server version');
  expect(text).not.toContain('latest');
});

it('uses a neutral heading when library metadata is absent', () => {
  const missing = record('c'.repeat(64), 'book', 'default', [
    candidate('one', { title: 'Remote title one' }, 1),
    candidate('two', { title: 'Remote title two' }, 2),
  ]);
  const markup = renderToStaticMarkup(
    <ConflictChoices
      books={[]}
      state={stateWith(missing)}
      busy={false}
      onResolve={() => {}}
    />,
  );
  expect(markup).toContain('Book title unavailable');
  expect(markup).toContain('Remote title one');
  expect(markup).toContain('Remote title two');
});

it('does not put protected conflict details into the DOM', () => {
  privacy.access.mockImplementation((bookId) => bookId !== idB);
  const publicRecord = record(idA, 'book', 'default', [
    candidate('public-a', { title: 'Visible title', folders: ['Classics'] }, 1),
    candidate('public-b', { title: 'Visible title', folders: [] }, 2),
  ]);
  const protectedRecord = record(idB, 'position', 'default', [
    candidate(
      'private-a',
      { section: 'Private chapter', fraction: 0.42, folders: ['Secret shelf'] },
      3,
    ),
    candidate(
      'private-b',
      { text: 'Private excerpt', note: 'Private note', fraction: 0.84 },
      4,
    ),
  ]);
  const markup = renderToStaticMarkup(
    <ConflictChoices
      books={books}
      state={stateWith(publicRecord, protectedRecord)}
      busy={false}
      onResolve={() => {}}
    />,
  );
  expect(markup).toContain('Visible title');
  expect(markup).toContain('Unlock private book to resolve conflict');
  expect(markup).not.toContain('Through the Looking-Glass');
  expect(markup).not.toContain('Secret shelf');
  expect(markup).not.toContain('Private chapter');
  expect(markup).not.toContain('Private excerpt');
  expect(markup).not.toContain('42%');
  expect(markup).not.toContain('84%');
});

it('resolves with the exact record and candidate selected', async () => {
  const selected = candidate(
    'selected',
    { section: 'Chapter 2', fraction: 0.2 },
    2,
  );
  const conflict = record(idA, 'position', 'default', [
    candidate('other', { section: 'Chapter 1', fraction: 0.1 }, 1),
    selected,
  ]);
  const resolve = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ConflictChoices
          books={books}
          state={stateWith(conflict)}
          busy={false}
          onResolve={resolve}
        />,
      ),
    );
    const choice = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Chapter 2'),
    );
    expect(choice).toBeTruthy();
    await act(async () => choice!.click());
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(conflict, selected);
  } finally {
    await act(async () => root.unmount());
  }
});
