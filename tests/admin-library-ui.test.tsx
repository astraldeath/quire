import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { AdminNavigation } from '../src/features/server/AdminNavigation';
import { Management } from '../src/features/server/Management';
import { parseWebRoute, navigateWeb } from '../src/features/navigation/routes';
const state = vi.hoisted(() => ({
  libraries: [] as any[],
  request: vi.fn(
    async (
      _a: any,
      path: string,
      _body?: any,
      method?: string,
    ): Promise<any> => {
      if (method) return {};
      if (path === '/v1/admin/libraries') return state.libraries;
      if (path === '/v1/admin/users')
        return [
          { id: 'a', username: 'Alice' },
          { id: 'b', username: 'Bob' },
        ];
      if (path.endsWith('/settings'))
        return { name: 'Quire', scanSeconds: 300 };
      if (path.endsWith('/overview'))
        return { users: 2, books: 0, bytes: 0, status: 'Ready' };
      return [];
    },
  ),
}));
vi.mock('../src/features/sync/transport', () => ({
  accountRequest: state.request,
}));
vi.mock('../src/features/sync/engine', () => ({ syncNow: async () => {} }));
vi.mock('../src/features/server/SharedUpload', () => ({
  SharedUpload: () => <div data-upload>Upload form</div>,
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section role="dialog">
      <h2>{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </section>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const account = {
  origin: 'https://example.test',
  username: 'admin',
  sessionId: 'current',
};
it('renders labeled desktop destinations or one phone selector', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn();
  try {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await act(async () =>
      root.render(<AdminNavigation active="libraries" onChange={change} />),
    );
    expect(host.querySelector('nav')?.textContent).toContain('Watched folders');
    expect(host.querySelector('select')).toBeNull();
    await act(async () => root.render(<></>));
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await act(async () =>
      root.render(<AdminNavigation active="libraries" onChange={change} />),
    );
    expect(host.querySelector('nav')).toBeNull();
    const select = host.querySelector('select')!;
    await act(async () => {
      select.value = 'accounts';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith('accounts');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
it('keeps collection summaries compact and member mutations scoped to visible selection', async () => {
  state.libraries = [];
  state.request.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      navigateWeb('/admin/libraries');
      root.render(<Management account={account} tab="libraries" />);
    });
    expect(host.querySelector('input[type="search"]')).toBeNull();
    await act(async () => root.render(<></>));
    state.libraries = [
      { id: 'one', name: 'First', members: [], books: 2 },
      { id: 'two', name: 'Second', members: ['b'], books: 1 },
    ];
    await act(async () =>
      root.render(<Management account={account} tab="libraries" />),
    );
    expect(host.querySelector('[data-upload]')).toBeNull();
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Manage')!
        .click(),
    );
    expect(parseWebRoute(location.pathname + location.search).library).toBe(
      'one',
    );
    expect(host.querySelector('h2')?.textContent).toBe('First');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Access')!
        .click(),
    );
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'Alice');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(state.request.mock.calls.filter((c) => c[3])).toEqual([
      [account, '/v1/admin/libraries/one/members/a', undefined, 'PUT'],
    ]);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Upload')!
        .click(),
    );
    expect(host.querySelector('[data-upload]')).not.toBeNull();
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Back to libraries'))!
        .click(),
    );
    expect(location.search).toBe('');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Manage')!
        .click(),
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Delete library'))!
        .click(),
    );
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      'Delete First',
    );
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Cancel')!
        .click(),
    );
    expect(
      state.request.mock.calls.filter((c) => c[3] === 'DELETE'),
    ).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('clears invalid selected collection URLs with an unavailable notice', async () => {
  state.libraries = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      navigateWeb('/admin/libraries?library=deleted');
      root.render(<Management account={account} tab="libraries" />);
    });
    expect(location.search).toBe('');
    expect(host.textContent).toContain('unavailable');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
