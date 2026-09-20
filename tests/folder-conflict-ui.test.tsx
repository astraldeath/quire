import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ConflictChoices } from '../src/features/sync/ConflictChoices';
import type { Book } from '../src/domain/models';
import {
  emptySync,
  recordKey,
  type RemoteRecord,
} from '../src/features/sync/model';
vi.mock('../src/features/privacy/Privacy', () => ({
  usePrivacy: () => ({ access: () => true }),
}));
it('distinguishes folder versions of the same book in conflict choices', () => {
  const state = emptySync();
  state.enabled = true;
  const record: RemoteRecord = {
    bookId: 'a'.repeat(64),
    kind: 'book',
    recordId: 'default',
    revision: 2,
    candidates: [
      {
        operationId: 'first',
        deleted: false,
        createdAt: 1,
        value: {
          title: 'Novel',
          folders: ['Fiction', 'Favorites'],
          folder: 'Fiction',
        },
      },
      {
        operationId: 'second',
        deleted: false,
        createdAt: 2,
        value: { title: 'Novel', folders: [], folder: '' },
      },
    ],
  };
  state.records[recordKey(record)] = record;
  const books: Book[] = [
    {
      id: record.bookId,
      title: 'Novel',
      author: '',
      series: '',
      volume: null,
      cover: '',
      addedAt: 1,
      local: true,
    },
  ];
  const markup = renderToStaticMarkup(
    <ConflictChoices
      books={books}
      state={state}
      busy={false}
      onResolve={() => {}}
    />,
  );
  const host = document.createElement('div');
  host.innerHTML = markup;
  expect(host.textContent).toContain('FoldersFiction, Favorites');
  expect(host.textContent).toContain('FoldersNo folders');
});
