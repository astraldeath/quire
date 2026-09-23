import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PasswordField } from '../src/components/PasswordField';
import { HostedApp } from '../src/features/server/HostedApp';
import { navigateWeb } from '../src/features/navigation/routes';
import { AccountPanel } from '../src/features/server/AccountPanel';
const request = vi.hoisted(() =>
  vi.fn(async (_a, _path, _b?, method?) =>
    method === 'DELETE'
      ? {}
      : {
          sessions: [
            { id: 'current', deviceName: 'Browser', createdAt: 1700000000 },
            { id: 'other', deviceName: 'Browser', createdAt: 1700100000000 },
          ],
        },
  ),
);
const auth = vi.hoisted(() => ({ admin: false, restored: true }));
vi.mock('../src/App', () => ({
  App: ({ accountActions }: any) => <main>{accountActions}</main>,
}));
vi.mock('../src/storage', () => ({
  useBrowserAccount: vi.fn(),
  syncTransaction: async () => {},
}));
vi.mock('../src/features/sync/engine', () => ({ syncNow: async () => {} }));
vi.mock('../src/features/server/AdminPanel', () => ({
  AdminPanel: () => <div>Admin page</div>,
}));
vi.mock('../src/features/sync/transport', () => ({
  supportsOpds: async () => false,
  accountRequest: (...args: any[]) =>
    args[1] === '/v1/me'
      ? Promise.resolve({ id: 'user', username: 'member', admin: auth.admin })
      : args[1] === '/v1/libraries'
        ? Promise.resolve([])
        : (request as any)(...args),
  restoreBrowserAccount: async () =>
    auth.restored
      ? {
          origin: 'https://example.test',
          username: 'member',
          sessionId: 'current',
        }
      : undefined,
  clearBrowserSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, onClose }: any) => (
    <section role="dialog">
      {children}
      <button onClick={onClose}>Close account</button>
    </section>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('reveals a password without submitting or changing its value', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    submit = vi.fn();
  try {
    await act(async () =>
      root.render(
        <form onSubmit={submit}>
          <PasswordField label="Password" defaultValue="a test password" />
        </form>,
      ),
    );
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Show password');
    await act(async () => button.click());
    expect(host.querySelector('input')!.type).toBe('text');
    expect(host.querySelector('input')!.value).toBe('a test password');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(submit).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('distinguishes same-name sessions and revokes only the selected non-current ID', async () => {
  request.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AccountPanel
          account={{
            origin: 'https://example.test',
            username: 'member',
            sessionId: 'current',
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(host.textContent).toContain('Current session');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[role="tab"][aria-label="Devices"]')!
        .click(),
    );
    expect(
      host.querySelector('[role="tabpanel"]:not([hidden])')?.textContent,
    ).toContain('Signed-in devices');
    const times = [...host.querySelectorAll('time')];
    expect(times).toHaveLength(2);
    expect(times[0].dateTime).toBe(new Date(1700000000000).toISOString());
    expect(times[1].dateTime).toBe(new Date(1700100000000).toISOString());
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Sign out')!
        .click(),
    );
    expect(request.mock.calls.filter((c) => c[3] === 'DELETE')).toEqual([
      [expect.anything(), '/v1/sessions/other', undefined, 'DELETE'],
    ]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('anchors the account menu, restores focus, and routes member and admin actions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    auth.admin = false;
    await act(async () => {
      navigateWeb('/library');
      root.render(<HostedApp />);
    });
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Account menu"]',
    )!;
    await act(async () => trigger.click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toContain('Account settings');
    expect(document.body.textContent).not.toContain('Administration');
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click(),
    );
    expect(location.pathname).toBe('/account');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => root.render(<></>));
    auth.admin = true;
    await act(async () => {
      navigateWeb('/library');
      root.render(<HostedApp />);
    });
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Account menu"]')!
        .click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((b) => b.textContent?.includes('Administration'))!
        .click(),
    );
    expect(location.pathname).toBe('/admin/overview');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    auth.admin = false;
  }
});
it('shows account creation rules and administrator password recovery', async () => {
  auth.restored = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ required: false }) })),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HostedApp />));
    expect(host.textContent).toContain('Ask your server administrator');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Have an invite code?')!
        .click(),
    );
    expect(host.textContent).toContain('At least 12 characters');
    expect(host.textContent).toContain('Start with a letter or number');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    auth.restored = true;
    vi.unstubAllGlobals();
  }
});
it('keeps password errors actionable and guards closing a password draft', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <AccountPanel
          account={{
            origin: 'https://example.test',
            username: 'member',
            sessionId: 'current',
          }}
          onClose={close}
        />,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'mock-current');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[role="tab"][aria-label="OPDS"]')!
        .click(),
    );
    expect(
      host.querySelector('[role="tabpanel"]:not([hidden])')?.textContent,
    ).toContain('OPDS');
    expect(host.textContent).not.toContain('Discard changes?');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="tab"][aria-label="Password"]',
        )!
        .click(),
    );
    expect(input.value).toBe('mock-current');
    request.mockRejectedValueOnce(new Error('Current password is incorrect'));
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.textContent).toContain('Current password is incorrect');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Close account')!
        .click(),
    );
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Discard changes')!
        .click(),
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
