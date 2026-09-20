import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { adminConsequence } from '../src/features/server/adminActions';
import { LibraryActions } from '../src/features/server/LibraryActions';
import { LibraryBooks } from '../src/features/server/LibraryBooks';
import { WatchRow } from '../src/features/server/WatchRow';
import { AdminPanel } from '../src/features/server/AdminPanel';
import { navigateWeb } from '../src/features/navigation/routes';
const state = vi.hoisted(() => ({
  fail: false,
  hold: undefined as Promise<void> | undefined,
  libraries: [] as any[],
  invites: [
    { id: 'old-invite-12345678', status: 'pending', expiresAt: 1800000000 },
  ] as any[],
  request: vi.fn(
    async (
      _a: any,
      path: string,
      _body?: any,
      method?: string,
    ): Promise<any> => {
      if (method) {
        if (state.hold) await state.hold;
        if (state.fail) throw new Error('keep at least one active admin');
        return path === '/v1/admin/invites'
          ? { id: 'new', code: 'mock-code', expiresAt: 1800000000 }
          : {};
      }
      if (path.endsWith('/books'))
        return [
          {
            id: 'book-one',
            title: 'First book',
            author: 'Author',
            series: '',
            volume: null,
            uploaded: true,
            watched: false,
          },
          {
            id: 'book-two',
            title: 'Second book',
            author: 'Author',
            series: '',
            volume: null,
            uploaded: true,
            watched: true,
          },
        ];
      if (path === '/v1/admin/users')
        return [
          { id: 'self', username: 'admin', admin: true, disabled: false },
          { id: 'alice', username: 'Alice', admin: false, disabled: false },
          { id: 'bob', username: 'Bob', admin: true, disabled: false },
        ];
      if (path === '/v1/admin/invites') return state.invites;
      if (path === '/v1/admin/libraries') return state.libraries;
      return [];
    },
  ),
}));
vi.mock('../src/features/sync/transport', () => ({
  accountRequest: state.request,
}));
vi.mock('../src/features/sync/engine', () => ({ syncNow: async () => {} }));
vi.mock('../src/features/server/Management', () => ({
  Management: () => null,
}));
vi.mock('../src/features/server/ServerBackups', () => ({
  ServerBackups: () => null,
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section
      role="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://example.test',
  username: 'admin',
  sessionId: 'current',
};
const click = async (host: ParentNode, label: string) =>
  act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === label)!
      .click();
  });
it('describes actual server effects with a named target and preservation guarantees', () => {
  for (const action of [
    'make-admin',
    'make-member',
    'disable',
    'sign-out-devices',
    'delete-library',
    'delete-upload',
    'stop-watch',
  ] as const) {
    expect(adminConsequence(action, 'Alice').title).toContain('Alice');
  }
  expect(adminConsequence('make-admin', 'Alice').description).toContain(
    'sign out',
  );
  expect(adminConsequence('delete-library', 'Comics').description).toContain(
    'cached',
  );
  expect(adminConsequence('stop-watch', 'Comics').description).toContain(
    'Original',
  );
});
it('confirms each account action, keeps cancellation request-free, prevents self-actions and retains failures', async () => {
  state.request.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      navigateWeb('/admin/accounts');
      root.render(
        <AdminPanel
          account={account}
          onClose={() => navigateWeb('/library')}
        />,
      );
    });
    const rows = host.querySelectorAll('article');
    expect(rows[0].querySelectorAll('button')).toHaveLength(0);
    for (const [row, label, path, body, method] of [
      [
        rows[1],
        'Make admin',
        '/v1/admin/users/alice',
        { admin: true, disabled: false },
        'PUT',
      ],
      [
        rows[2],
        'Make member',
        '/v1/admin/users/bob',
        { admin: false, disabled: false },
        'PUT',
      ],
      [
        rows[1],
        'Disable',
        '/v1/admin/users/alice',
        { admin: false, disabled: true },
        'PUT',
      ],
      [
        rows[1],
        'Sign out devices',
        '/v1/admin/users/alice/sessions',
        undefined,
        'DELETE',
      ],
    ] as const) {
      state.request.mockClear();
      await click(row, label);
      expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(0);
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
        label === 'Make member' ? 'Bob' : 'Alice',
      );
      await click(host.querySelector('[role="dialog"]')!, 'Cancel');
      expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(0);
      await click(row, label);
      const dialog = host.querySelector('[role="dialog"]')!;
      await click(dialog, label);
      expect(state.request.mock.calls.filter((c) => c[3])).toEqual([
        [account, path, body, method],
      ]);
    }
    state.fail = true;
    await click(rows[1], 'Make admin');
    await click(host.querySelector('[role="dialog"]')!, 'Make admin');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      'keep at least one active admin',
    );
    expect(rows[1].textContent).toContain('Member');
    await act(async () =>
      host
        .querySelector('[role="dialog"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    state.fail = false;
    await act(async () => root.unmount());
    host.remove();
  }
});
it('explains personal invitation access, supports copy fallback and reports honest old grant data', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  state.libraries = [];
  const copy = vi.fn(async (): Promise<void> => {
    throw new Error('Denied');
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copy },
  });
  try {
    await act(async () => {
      navigateWeb('/admin/invites');
      root.render(<AdminPanel account={account} onClose={() => {}} />);
    });
    expect(host.querySelector('fieldset')).toBeNull();
    expect(host.textContent).toContain('personal library');
    expect(host.textContent).toContain('Access information unavailable');
    expect(host.textContent).toContain('12345678');
    await click(host, 'Create invite');
    expect(
      host.querySelector<HTMLInputElement>('input[readonly]')!.value,
    ).toContain('mock-code');
    await click(host, 'Copy link');
    expect(host.textContent).toContain('Copy the selected link');
    const input = host.querySelector<HTMLInputElement>('input[readonly]')!;
    expect(input.selectionEnd).toBe(input.value.length);
    copy.mockImplementation(async () => {});
    await click(host, 'Copy link');
    expect(host.textContent).toContain('Link copied');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('locks only the pending account row and sends one request on confirmation', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let resolve!: () => void;
  try {
    await act(async () => {
      navigateWeb('/admin/accounts');
      root.render(<AdminPanel account={account} onClose={() => {}} />);
    });
    const rows = host.querySelectorAll('article');
    state.request.mockClear();
    state.hold = new Promise<void>((r) => {
      resolve = r;
    });
    await click(rows[1], 'Disable');
    await click(host.querySelector('[role="dialog"]')!, 'Disable');
    expect(
      [...rows[1].querySelectorAll('button')].every((b) => b.disabled),
    ).toBe(true);
    expect(
      [...rows[2].querySelectorAll('button')].every((b) => !b.disabled),
    ).toBe(true);
    await click(host.querySelector('[role="dialog"]')!, 'Disable');
    expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(1);
    await act(async () => resolve());
    expect(host.textContent).toContain('completed');
  } finally {
    state.hold = undefined;
    resolve?.();
    await act(async () => root.unmount());
    host.remove();
  }
});
it('confirms exact collection, upload and watch deletion targets and cancels without requests', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    refresh = vi.fn(async () => {});
  try {
    for (const [element, openLabel, confirmLabel, path] of [
      [
        <LibraryActions
          account={account}
          library={{ id: 'collection', name: 'Comics' }}
          onChange={refresh}
        />,
        'Delete library',
        'Delete library and server files',
        '/v1/admin/libraries/collection',
      ],
      [
        <LibraryBooks
          account={account}
          library="collection"
          onChange={refresh}
        />,
        'Delete uploaded file',
        'Delete uploaded file',
        '/v1/admin/libraries/collection/books/book-one',
      ],
      [
        <WatchRow
          account={account}
          watch={{
            id: 'watch-one',
            username: 'library.collection',
            path: '/source/Comics',
          }}
          destination="Comics"
          onChange={refresh}
        />,
        'Stop watching',
        'Stop watching',
        '/v1/admin/watches/watch-one',
      ],
    ] as const) {
      await act(async () => root.render(element));
      state.request.mockClear();
      await click(host, openLabel);
      expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(0);
      await click(host.querySelector('[role="dialog"]')!, 'Cancel');
      expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(0);
      await click(host, openLabel);
      await act(async () =>
        host
          .querySelector('[role="dialog"]')!
          .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          ),
      );
      expect(state.request.mock.calls.filter((c) => c[3])).toHaveLength(0);
      await click(host, openLabel);
      await click(host.querySelector('[role="dialog"]')!, confirmLabel);
      expect(state.request.mock.calls.filter((c) => c[3])).toEqual([
        [account, path, undefined, 'DELETE'],
      ]);
      await act(async () => root.render(<></>));
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('renders provided invitation grants and only grants selected collection IDs', async () => {
  state.libraries = [
    { id: 'comics', name: 'Comics' },
    { id: 'novels', name: 'Novels' },
  ];
  state.invites = [
    {
      id: 'invite-12345678',
      status: 'pending',
      expiresAt: 1800000000,
      libraries: [{ id: 'comics', name: 'Comics' }],
    },
  ];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      navigateWeb('/admin/invites');
      root.render(<AdminPanel account={account} onClose={() => {}} />);
    });
    expect(host.textContent).toContain('Shared access: Comics');
    expect(host.textContent).toContain(
      new Date(1800000000000).toLocaleString(),
    );
    expect(host.querySelector('input[readonly]')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    state.request.mockClear();
    await click(host, 'Create invite');
    expect(state.request.mock.calls.filter((c) => c[3] === 'PUT')).toEqual([
      [account, '/v1/admin/invites/new/libraries/comics', undefined, 'PUT'],
    ]);
  } finally {
    state.libraries = [];
    await act(async () => root.unmount());
    host.remove();
  }
});
