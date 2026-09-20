import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { AdminPanel } from '../src/features/server/AdminPanel';
import { navigateWeb } from '../src/features/navigation/routes';
const state = vi.hoisted(() => ({
  fail: false,
  config: { name: 'Quire', scanSeconds: 300 },
  request: vi.fn(
    async (
      _a: any,
      path: string,
      body?: any,
      method?: string,
    ): Promise<any> => {
      if (path.endsWith('/settings')) {
        if (method) {
          if (state.fail) throw new Error('Settings unavailable');
          state.config = { ...body };
        }
        return { ...state.config };
      }
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
vi.mock('../src/features/server/ServerBackups', () => ({
  ServerBackups: () => null,
}));
vi.mock('../src/components/Modal', () => ({
  Modal: ({ children, title, onClose }: any) => (
    <section role="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const click = async (host: ParentNode, label: string) =>
  act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === label)!
      .click();
  });
const edit = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
it('keeps settings drafts separate, reverts values, preserves failures and shares route guards', async () => {
  state.config = { name: 'Quire', scanSeconds: 300 };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      navigateWeb('/admin/overview');
      navigateWeb('/admin/settings');
      root.render(
        <AdminPanel
          account={{
            origin: 'https://example.test',
            username: 'admin',
            sessionId: 'current',
          }}
          onClose={() => navigateWeb('/library')}
        />,
      );
    });
    const save = () =>
      [...host.querySelectorAll('button')].find(
        (b) => b.textContent === 'Save settings',
      )!;
    expect(save().disabled).toBe(true);
    const input = host.querySelector<HTMLInputElement>('form input')!;
    const select = host.querySelector<HTMLSelectElement>('form select')!;
    await edit(input, 'New name');
    await act(async () => {
      select.value = '900';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(host, 'Revert');
    expect(input.value).toBe('Quire');
    expect(select.value).toBe('300');
    expect(save().disabled).toBe(true);
    await edit(input, 'Draft');
    state.fail = true;
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.textContent).toContain('Settings unavailable');
    expect(input.value).toBe('Draft');
    state.fail = false;
    await act(async () => window.dispatchEvent(new Event('quire-synced')));
    expect(input.value).toBe('Draft');
    await click(host, 'Accounts');
    expect(location.pathname).toBe('/admin/settings');
    expect(host.textContent).toContain('Discard changes?');
    await click(document.body, 'Keep editing');
    expect(input.value).toBe('Draft');
    await act(async () => {
      history.back();
      await vi.waitFor(() =>
        expect(host.textContent).toContain('Discard changes?'),
      );
    });
    expect(host.textContent).toContain('Discard changes?');
    await click(document.body, 'Keep editing');
    expect(location.pathname).toBe('/admin/settings');
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    expect(save().disabled).toBe(true);
    expect(host.textContent).toContain('Settings saved');
    await edit(input, 'Another draft');
    await click(host, 'Accounts');
    await click(document.body, 'Discard changes');
    expect(location.pathname).toBe('/admin/accounts');
    expect(host.querySelector('form')).toBeNull();
  } finally {
    state.fail = false;
    await act(async () => root.unmount());
    host.remove();
  }
});
