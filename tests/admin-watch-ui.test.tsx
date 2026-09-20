import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { WatchRow } from '../src/features/server/WatchRow';
const request = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../src/features/sync/transport', () => ({ accountRequest: request }));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section role="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('keeps full paths and supplied diagnostics in Details, supports old scans, and cancels stop without a request', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    refresh = vi.fn(async () => {});
  const common = {
    account: {
      origin: 'https://example.test',
      username: 'admin',
      sessionId: 'current',
    },
    onChange: refresh,
    destination: 'Comics',
  };
  try {
    await act(async () =>
      root.render(
        <>
          <WatchRow
            {...common}
            watch={{
              id: 'one',
              path: '/very/long/source/books',
              username: 'library.one',
            }}
            scan={{
              id: 'one',
              lastAt: 1700000000,
              error: '',
              imported: 2,
              existing: 3,
              skipped: 4,
            }}
          />
          <WatchRow
            {...common}
            watch={{
              id: 'two',
              path: '/missing/mount/books',
              username: 'library.two',
            }}
            scan={{
              id: 'two',
              lastAt: 1700000000,
              error: 'Mount missing',
              imported: 0,
              existing: 0,
              skipped: 3,
              skippedFiles: [{ path: '<bad>.epub', reason: 'invalid-book' }],
              omittedSkippedFiles: 2,
            }}
          />
        </>,
      ),
    );
    expect(host.querySelectorAll('strong')[0].textContent).toBe('books');
    expect(host.querySelectorAll('details')[0].textContent).toContain(
      '/very/long/source/books',
    );
    expect(host.querySelectorAll('details')[0].textContent).toContain(
      'does not provide',
    );
    expect(host.querySelectorAll('details')[1].textContent).toContain(
      '<bad>.epub',
    );
    expect(host.querySelectorAll('details')[1].textContent).toContain(
      '2 additional',
    );
    expect(host.textContent).toContain('Scan failed');
    expect(host.querySelector('bad')).toBeNull();
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Stop watching'))!
        .click(),
    );
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      'books',
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Cancel')!
        .click(),
    );
    expect(request).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('labels known skip reasons and preserves an unknown server reason', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WatchRow
          account={{
            origin: 'https://example.test',
            username: 'admin',
            sessionId: 'current',
          }}
          watch={{ id: 'watch', path: '/books', username: 'admin' }}
          destination="Books"
          onChange={async () => {}}
          scan={{
            id: 'watch',
            lastAt: 1700000000,
            error: '',
            imported: 0,
            existing: 0,
            skipped: 5,
            skippedFiles: [
              'unsupported-format',
              'too-large',
              'symlink',
              'not-regular',
              'future-server-reason',
            ].map((reason, i) => ({ path: `file-${i}`, reason })),
          }}
        />,
      ),
    );
    const text = host.querySelector('details')!.textContent;
    for (const label of [
      'Unsupported file format',
      'File exceeds the size limit',
      'Symbolic link',
      'Not a regular file',
      'future-server-reason',
    ])
      expect(text).toContain(label);
    expect(text).not.toContain('unsupported-format');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
