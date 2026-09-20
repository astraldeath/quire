import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/sync/transport', () => ({ download: vi.fn() }));
vi.mock('../src/features/storage/manager', () => ({ uploadBooks: vi.fn() }));
import { BookStorageActions } from '../src/features/storage/BookStorageActions';
import { download } from '../src/features/sync/transport';
import {
  deleteBooks,
  listBooks,
  putBook,
  saveBook,
  syncTransaction,
} from '../src/storage';
import { readPolicy, writePolicy } from '../src/features/storage/policy';
import type { Book } from '../src/domain/models';
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'session',
};
const bytes = new Uint8Array([3, 4]);
const book: Book = {
  id: createHash('sha256').update(bytes).digest('hex'),
  title: 'Book',
  author: '',
  series: '',
  volume: null,
  addedAt: 1,
  cover: '',
  local: false,
};
const failedBook = { ...book, id: 'b'.repeat(64), title: 'Other' };
beforeEach(async () => {
  vi.resetAllMocks();
  localStorage.clear();
  await deleteBooks((await listBooks()).map((b) => b.id));
  await syncTransaction((s) => {
    s.enabled = true;
    s.account = account;
    return { result: undefined };
  });
  await saveBook(book);
  await saveBook(failedBook);
});
async function render(books: Book[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    close = vi.fn();
  await act(async () =>
    root.render(<BookStorageActions books={books} onClose={close} />),
  );
  // IndexedDB completion arrives outside React's microtask queue.
  await vi.waitFor(() =>
    expect(host.querySelector('[data-menu-id="pin"]')).toBeTruthy(),
  );
  return {
    host,
    close,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it.each(['cloud', 'local', 'pinned'])(
  'shows the correct offline action for a %s book',
  async (state) => {
    if (state !== 'cloud') await putBook(book, bytes);
    if (state === 'pinned') writePolicy(account, { pinned: [book.id] });
    const c = await render([{ ...book, local: state !== 'cloud' }]);
    try {
      expect(c.host.querySelector('[data-menu-id="pin"]')?.textContent).toBe(
        state === 'cloud'
          ? 'Download and keep'
          : state === 'local'
            ? 'Keep downloaded'
            : 'Allow automatic offloading',
      );
    } finally {
      await c.dispose();
    }
  },
);
it('keeps the actions open on partial failure and retries only unfinished books', async () => {
  vi.mocked(download).mockImplementation(async (_account, id) => {
    if (id === book.id) return bytes;
    throw new Error('Server unavailable');
  });
  const c = await render([book, failedBook]);
  try {
    await act(async () =>
      c.host.querySelector<HTMLButtonElement>('[data-menu-id="pin"]')!.click(),
    );
    await vi.waitFor(() =>
      expect(c.host.querySelector('[role="alert"]')?.textContent).toContain(
        '1 book could not be kept',
      ),
    );
    expect(c.close).not.toHaveBeenCalled();
    expect(readPolicy(account).pinned).toEqual([book.id]);
    const retry = [...c.host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Retry',
    )!;
    expect(retry).toBeTruthy();
    expect(retry.getAttribute('role')).toBe('menuitem');
    await act(async () => retry.click());
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    expect(readPolicy(account).pinned).toEqual([book.id]);
  } finally {
    await c.dispose();
  }
});

it.each([false, true])(
  'restores Retry focus after failure without overriding a deliberate focus move (%s)',
  async (movedFocus) => {
    let rejectDownload!: (error: Error) => void;
    vi.mocked(download).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const c = await render([book]);
    const back = document.createElement('button');
    back.textContent = 'Back';
    c.host.prepend(back);
    try {
      const pin = c.host.querySelector<HTMLButtonElement>(
        '[data-menu-id="pin"]',
      )!;
      pin.focus();
      await act(async () => pin.click());
      await vi.waitFor(() => expect(rejectDownload).toBeTypeOf('function'));
      expect(pin.disabled).toBe(true);
      // Chromium drops focus to body when the currently focused action is disabled.
      // jsdom retains focus, so reproduce that browser boundary explicitly.
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute('tabindex');
      expect(document.activeElement).toBe(document.body);
      if (movedFocus) back.focus();
      await act(async () => rejectDownload(new Error('Server unavailable')));
      await vi.waitFor(() =>
        expect(
          c.host.querySelector('[data-menu-id="retry-download"]'),
        ).toBeTruthy(),
      );
      const retry = c.host.querySelector<HTMLButtonElement>(
        '[data-menu-id="retry-download"]',
      )!;
      expect(document.activeElement).toBe(movedFocus ? back : retry);
      expect(c.close).not.toHaveBeenCalled();
      if (!movedFocus) {
        // Retry itself is removed during the next attempt; a repeated failure
        // must focus the newly rendered Retry action too.
        await act(async () => retry.click());
        await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
        await act(async () => rejectDownload(new Error('Still unavailable')));
        await vi.waitFor(() =>
          expect(
            c.host.querySelector('[data-menu-id="retry-download"]'),
          ).toBeTruthy(),
        );
        expect(document.activeElement).toBe(
          c.host.querySelector('[data-menu-id="retry-download"]'),
        );
      }
    } finally {
      await c.dispose();
    }
  },
);
