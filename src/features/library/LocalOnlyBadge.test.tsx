import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useServerFiles, LocalOnlyBadge } from './LocalOnlyBadge';
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  files: vi.fn(),
  notify: () => {},
}));
vi.mock('../../storage', () => ({ loadSync: mock.load }));
vi.mock('../sync/transport', () => ({ files: mock.files }));
vi.mock('../sync/engine', () => ({
  subscribe: (fn: () => void) => {
    mock.notify = fn;
    return () => {};
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://example.com',
  username: 'reader',
  sessionId: 'one',
};
afterEach(() => vi.resetAllMocks());
async function mount() {
  const host = document.createElement('div');
  const root = createRoot(host);
  function View() {
    const remote = useServerFiles();
    return (
      <>
        <LocalOnlyBadge
          books={[{ id: 'local', local: true }]}
          remote={remote}
        />
        <LocalOnlyBadge
          books={[
            { id: 'remote', local: true },
            { id: 'cloud', local: false },
          ]}
          remote={remote}
        />
      </>
    );
  }
  await act(async () => root.render(<View />));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
    },
  };
}
async function refresh() {
  await act(async () => {
    mock.notify();
    await new Promise((r) => setTimeout(r, 60));
  });
}
it('checks once for the library, distinguishes downloaded from local-only, and refreshes after upload', async () => {
  mock.load.mockResolvedValue({ enabled: true, account });
  mock.files.mockResolvedValue([{ bookId: 'remote' }, { bookId: 'cloud' }]);
  const view = await mount();
  expect(mock.files).toHaveBeenCalledTimes(1);
  expect(
    view.host.querySelectorAll('[aria-label="Only on this device"]'),
  ).toHaveLength(1);
  mock.files.mockResolvedValue([{ bookId: 'local' }, { bookId: 'remote' }]);
  await refresh();
  expect(view.host.querySelector('span')).toBeNull();
  await view.close();
});
it('hides the indicator when disconnected or the server file list cannot be checked', async () => {
  mock.load.mockResolvedValue({ enabled: false, account });
  const view = await mount();
  expect(mock.files).not.toHaveBeenCalled();
  expect(view.host.querySelector('span')).toBeNull();
  mock.load.mockResolvedValue({ enabled: true, account });
  mock.files.mockRejectedValue(new Error('offline'));
  await refresh();
  expect(view.host.querySelector('span')).toBeNull();
  await view.close();
});
it('rejects inventory from a previous account while its request is in flight', async () => {
  mock.load.mockResolvedValue({ enabled: true, account });
  let resolve!: (files: { bookId: string }[]) => void;
  mock.files.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = await mount();
  mock.load.mockResolvedValue({
    enabled: true,
    account: { ...account, sessionId: 'two' },
  });
  await act(async () => resolve([]));
  expect(view.host.querySelector('span')).toBeNull();
  await view.close();
});
it('labels a mixed series with the number of local-only files', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <LocalOnlyBadge
        books={[
          { id: 'a', local: true },
          { id: 'b', local: true },
          { id: 'c', local: false },
        ]}
        remote={new Set(['b', 'c'])}
      />,
    ),
  );
  expect(host.querySelector('span')?.getAttribute('aria-label')).toBe(
    '1 book only on this device',
  );
  await act(async () => root.unmount());
});
