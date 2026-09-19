import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ConflictChoices } from '../src/features/sync/ConflictChoices';
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
  const markup = renderToStaticMarkup(
    <ConflictChoices state={state} busy={false} onResolve={() => {}} />,
  );
  expect(markup).toContain('Folders: Fiction, Favorites');
  expect(markup).toContain('No folders');
});
