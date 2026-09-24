import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';
const mocks = vi.hoisted(() => ({
  loadSync: vi.fn(),
  files: vi.fn(),
  uploadBooks: vi.fn(),
}));
vi.mock('../src/storage', () => ({ loadSync: mocks.loadSync }));
vi.mock('../src/features/sync/transport', () => ({ files: mocks.files }));
vi.mock('../src/features/storage/manager', () => ({
  uploadBooks: mocks.uploadBooks,
}));
vi.mock('../src/features/sync/ServerSettings', () => ({
  ServerSettings: () => <p>Connection settings</p>,
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section>
      <h2>{title}</h2>
      <button onClick={onClose}>Close dialog</button>
      {children}
    </section>
  ),
}));
import { UploadDialog } from '../src/features/storage/UploadDialog';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'one',
};
const books = [
  { id: 'one', title: 'One', local: true },
  { id: 'two', title: 'Two', local: true },
] as Book[];
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const close = vi.fn(),
  allowed = () => true;
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text)!;
const click = (text: string) => act(async () => button(text).click());
beforeEach(() => {
  vi.resetAllMocks();
  host = document.createElement('div');
  root = createRoot(host);
  mocks.loadSync.mockResolvedValue({ enabled: true, account });
  mocks.files.mockResolvedValue([]);
  mocks.uploadBooks.mockResolvedValue({
    uploaded: ['one', 'two'],
    skipped: [],
    failed: [],
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const render = (items = books, canUpload = allowed) =>
  act(async () =>
    root.render(
      <UploadDialog books={items} onClose={close} canUpload={canUpload} />,
    ),
  );
it('retains the presented destination and selection across parent rerenders', async () => {
  await render();
  mocks.loadSync.mockResolvedValue({
    enabled: true,
    account: { ...account, username: 'bob', sessionId: 'two' },
  });
  await render([...books]);
  expect(host.textContent).toContain('alice');
  expect(host.textContent).not.toContain('bob');
  await click('Upload 2');
  expect(mocks.uploadBooks).toHaveBeenCalledWith(
    ['one', 'two'],
    account,
    expect.objectContaining({ manual: true }),
  );
});
it('retries only failed books and retains the completed count', async () => {
  mocks.uploadBooks
    .mockResolvedValueOnce({
      uploaded: ['one'],
      skipped: [],
      failed: [{ id: 'two', message: 'Offline' }],
    })
    .mockResolvedValueOnce({ uploaded: ['two'], skipped: [], failed: [] });
  await render();
  await click('Upload 2');
  expect(host.textContent).toContain('1 uploaded · 1 failed');
  await click('Retry failed');
  expect(mocks.uploadBooks.mock.calls[1][0]).toEqual(['two']);
  expect(host.textContent).toContain('2 uploaded');
  expect(button('Retry failed')).toBeUndefined();
});
it('returns from connection settings with the original selection', async () => {
  mocks.loadSync.mockResolvedValue({ enabled: false });
  await render();
  expect(host.textContent).toContain('Connection settings');
  mocks.loadSync.mockResolvedValue({ enabled: true, account });
  await click('Continue to upload');
  expect(host.textContent).toContain('2 books to upload');
  await click('Upload 2');
  expect(mocks.uploadBooks.mock.calls[0][0]).toEqual(['one', 'two']);
});
it('offers no enabled upload when every local book is already uploaded', async () => {
  mocks.files.mockResolvedValue([{ bookId: 'one' }, { bookId: 'two' }]);
  await render();
  expect(
    [...host.querySelectorAll('button')].some(
      (b) => b.textContent?.startsWith('Upload ') && !b.disabled,
    ),
  ).toBe(false);
});
it('checks current privacy permission throughout an active upload', async () => {
  let finish!: (value: any) => void;
  mocks.uploadBooks.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await click('Upload 2');
  const permission = mocks.uploadBooks.mock.calls[0][2].canUpload;
  await render(books, () => false);
  expect(permission('two')).toBe(false);
  expect(button('Cancel').disabled).toBe(true);
  await click('Close dialog');
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish({ uploaded: [], skipped: [], failed: [] }));
});
