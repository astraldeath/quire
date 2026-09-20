import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/features/sync/transport', () => ({
  uploadSharedFile: vi.fn(),
}));
vi.mock('../src/storage', () => ({ loadSync: vi.fn() }));
import { uploadSharedFile } from '../src/features/sync/transport';
import { loadSync } from '../src/storage';
import { SharedUpload } from '../src/features/server/SharedUpload';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://books.example',
  username: 'alice',
  sessionId: 'session',
};
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(loadSync).mockResolvedValue({ enabled: true, account } as any);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function select(names: string[]) {
  await act(async () => {
    const input = host.querySelector('input')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: names.map((n) => new File(['book'], n)),
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('cancels the active file and refreshes completed files only once', async () => {
  let reject!: (e: unknown) => void;
  vi.mocked(uploadSharedFile)
    .mockResolvedValueOnce({ bookId: 'a'.repeat(64), size: 4 })
    .mockImplementationOnce(
      (_a, _l, _f, signal) =>
        new Promise((_resolve, rej) => {
          reject = rej;
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
  const refreshed = vi.fn();
  await act(async () =>
    root.render(
      <SharedUpload
        account={account}
        library="library"
        onComplete={refreshed}
      />,
    ),
  );
  await select(['first.cbz', 'second.cbz']);
  expect(host.textContent).toContain('second.cbz');
  expect(host.querySelector('progress')?.hasAttribute('value')).toBe(false);
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Cancel')!
      .click(),
  );
  expect(vi.mocked(uploadSharedFile).mock.calls[1][3].aborted).toBe(true);
  expect(refreshed).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('cancelled');
});
it.each(['unmount', 'account', 'stored-session'])(
  'ignores late success after %s',
  async (change) => {
    let finish!: (v: { bookId: string; size: number }) => void;
    vi.mocked(uploadSharedFile).mockImplementation(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const refreshed = vi.fn();
    await act(async () =>
      root.render(
        <SharedUpload
          account={account}
          library="library"
          onComplete={refreshed}
        />,
      ),
    );
    await select(['book.cbz']);
    if (change === 'unmount') await act(async () => root.render(null));
    else if (change === 'account')
      await act(async () =>
        root.render(
          <SharedUpload
            account={{ ...account, sessionId: 'new' }}
            library="library"
            onComplete={refreshed}
          />,
        ),
      );
    else
      vi.mocked(loadSync).mockResolvedValue({
        enabled: true,
        account: { ...account, sessionId: 'new' },
      } as any);
    await act(async () => finish({ bookId: 'a'.repeat(64), size: 4 }));
    expect(refreshed).not.toHaveBeenCalled();
  },
);
it('identifies a failed file and retries remaining files without repeating successes', async () => {
  vi.mocked(uploadSharedFile)
    .mockResolvedValueOnce({ bookId: 'a'.repeat(64), size: 4 })
    .mockRejectedValueOnce(new Error('Try again.'))
    .mockResolvedValue({ bookId: 'b'.repeat(64), size: 4 });
  await act(async () =>
    root.render(
      <SharedUpload account={account} library="library" onComplete={vi.fn()} />,
    ),
  );
  await select(['first.cbz', 'second.cbz']);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'second.cbz',
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Retry')!
      .click(),
  );
  expect(vi.mocked(uploadSharedFile).mock.calls.map((c) => c[2].name)).toEqual([
    'first.cbz',
    'second.cbz',
    'second.cbz',
  ]);
});
it('keeps keyboard focus in upload controls after cancellation and completion', async () => {
  let finish!: (v: { bookId: string; size: number }) => void;
  vi.mocked(uploadSharedFile).mockImplementation(
    (_a, _l, _f, signal) =>
      new Promise((resolve, reject) => {
        finish = resolve;
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  await act(async () =>
    root.render(
      <SharedUpload account={account} library="library" onComplete={vi.fn()} />,
    ),
  );
  host.querySelector('input')!.focus();
  await select(['book.cbz']);
  const cancel = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Cancel',
  )!;
  cancel.focus();
  await act(async () => cancel.click());
  expect(document.activeElement?.textContent).toBe('Retry remaining files');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(document.activeElement?.textContent).toBe('Cancel');
  await act(async () => finish({ bookId: 'a'.repeat(64), size: 4 }));
  expect(document.activeElement).toBe(host.querySelector('input'));
});
it('does not steal focus from another control when an upload completes', async () => {
  let finish!: (v: { bookId: string; size: number }) => void;
  vi.mocked(uploadSharedFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const other = document.createElement('button');
  document.body.append(other);
  try {
    await act(async () =>
      root.render(
        <SharedUpload
          account={account}
          library="library"
          onComplete={vi.fn()}
        />,
      ),
    );
    host.querySelector('input')!.focus();
    await select(['book.cbz']);
    other.focus();
    await act(async () => finish({ bookId: 'a'.repeat(64), size: 4 }));
    expect(document.activeElement).toBe(other);
  } finally {
    other.remove();
  }
});
it('reports cancellation even when a late upload response succeeds', async () => {
  let finish!: (v: { bookId: string; size: number }) => void;
  vi.mocked(uploadSharedFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    root.render(
      <SharedUpload account={account} library="library" onComplete={vi.fn()} />,
    ),
  );
  await select(['book.cbz']);
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Cancel')!
      .click(),
  );
  await act(async () => finish({ bookId: 'a'.repeat(64), size: 4 }));
  expect(host.textContent).toContain('cancelled');
  expect(host.textContent).not.toContain('1 book uploaded.');
});
it.each(['account', 'library'])(
  'keeps the new %s retry queue when an old post-upload account read resolves',
  async (change) => {
    let finishOldRead!: (state: Awaited<ReturnType<typeof loadSync>>) => void;
    let rejectNewUpload!: (error: Error) => void;
    const oldState = { enabled: true, account } as Awaited<
      ReturnType<typeof loadSync>
    >;
    vi.mocked(loadSync)
      .mockResolvedValueOnce(oldState)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRead = resolve;
          }),
      );
    vi.mocked(uploadSharedFile)
      .mockResolvedValueOnce({ bookId: 'a'.repeat(64), size: 4 })
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectNewUpload = reject;
          }),
      )
      .mockResolvedValue({ bookId: 'b'.repeat(64), size: 4 });
    const refreshed = vi.fn();
    await act(async () =>
      root.render(
        <SharedUpload
          account={account}
          library="old-library"
          onComplete={refreshed}
        />,
      ),
    );
    await select(['old-first.cbz', 'old-private.cbz']);
    const nextAccount =
      change === 'account'
        ? { ...account, username: 'bob', sessionId: 'new-session' }
        : account;
    const nextLibrary = change === 'library' ? 'new-library' : 'old-library';
    vi.mocked(loadSync).mockResolvedValue({
      enabled: true,
      account: nextAccount,
    } as Awaited<ReturnType<typeof loadSync>>);
    await act(async () =>
      root.render(
        <SharedUpload
          account={nextAccount}
          library={nextLibrary}
          onComplete={refreshed}
        />,
      ),
    );
    await select(['new-first.cbz', 'new-remaining.cbz']);
    await act(async () => finishOldRead(oldState));
    expect(refreshed).not.toHaveBeenCalled();
    await act(async () => rejectNewUpload(new Error('New upload failed.')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'new-first.cbz',
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === 'Retry')!
        .click(),
    );
    expect(
      vi
        .mocked(uploadSharedFile)
        .mock.calls.map((call) => [call[0].username, call[1], call[2].name]),
    ).toEqual([
      ['alice', 'old-library', 'old-first.cbz'],
      [nextAccount.username, nextLibrary, 'new-first.cbz'],
      [nextAccount.username, nextLibrary, 'new-first.cbz'],
      [nextAccount.username, nextLibrary, 'new-remaining.cbz'],
    ]);
  },
);
it('preserves the failed filename and upload details when refreshing also fails', async () => {
  vi.mocked(uploadSharedFile).mockRejectedValue(
    new Error('Upload connection was interrupted.'),
  );
  await act(async () =>
    root.render(
      <SharedUpload
        account={account}
        library="library"
        onComplete={vi.fn().mockRejectedValue(new Error('Offline'))}
      />,
    ),
  );
  await select(['failed.cbz']);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'failed.cbz',
  );
  expect(host.querySelector('details')?.textContent).toContain(
    'Upload connection was interrupted.',
  );
  expect(host.querySelector('details')?.textContent).toContain(
    'Could not refresh',
  );
});
it('keeps cancellation and the remaining queue when cancelled during the post-upload account read', async () => {
  let finishRead!: (state: Awaited<ReturnType<typeof loadSync>>) => void;
  const state = { enabled: true, account } as Awaited<
    ReturnType<typeof loadSync>
  >;
  vi.mocked(loadSync)
    .mockResolvedValueOnce(state)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
  vi.mocked(uploadSharedFile).mockResolvedValue({
    bookId: 'a'.repeat(64),
    size: 4,
  });
  await act(async () =>
    root.render(
      <SharedUpload account={account} library="library" onComplete={vi.fn()} />,
    ),
  );
  await select(['book.cbz']);
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel')!
      .click(),
  );
  await act(async () => finishRead(state));
  expect(host.textContent).toContain('Upload cancelled.');
  expect(host.textContent).toContain('Retry remaining files');
  expect(host.textContent).not.toContain('1 book uploaded.');
});
