import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ServerSettings } from '../src/features/sync/ServerSettings';
import { SyncStatus } from '../src/features/sync/SyncStatus';
import { connect } from '../src/features/sync/engine';
const { discover } = vi.hoisted(() => ({
  discover: vi.fn(async (): Promise<{ name: string; origin: string }> => {
    throw new Error('unavailable');
  }),
}));
vi.mock('../src/storage', () => ({
  loadSync: async () => ({ pending: [], records: {} }),
}));
vi.mock('../src/features/sync/engine', () => ({
  subscribe: () => () => {},
  snapshot: (() => {
    const status = { message: 'Offline', busy: false };
    return () => status;
  })(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  resolve: vi.fn(),
  syncNow: vi.fn(),
}));
vi.mock('../src/features/sync/transport', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  discover,
}));
vi.mock('../src/features/sync/ConflictChoices', () => ({
  ConflictChoices: () => null,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('does not claim up to date with pending work and includes last sync', async () => {
  const t = await mount(
    <SyncStatus
      message="Up to date"
      busy={false}
      pending={2}
      lastSync={1000}
      onSync={() => {}}
    />,
  );
  expect(t.host.textContent).not.toContain('Up to date');
  expect(t.host.textContent).toContain('2 pending changes');
  expect(t.host.textContent).toContain('Last synced');
  await t.close();
});
it('shows explicit URL and Username and safely retries discovery failure', async () => {
  const t = await mount(<ServerSettings books={[]} />);
  expect(t.host.querySelector('details input[type=url]')).toBeNull();
  const inputs = t.host.querySelectorAll('input');
  const set = async (i: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(i, value);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
  expect(t.host.textContent).toContain('Username');
  await set(inputs[0], 'alice');
  await set(
    t.host.querySelector('input[type=url]')!,
    'https://books.example.com',
  );
  await act(async () =>
    t.host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(discover).toHaveBeenCalledWith('https://books.example.com');
  expect(t.host.textContent).toContain('Retry');
  await t.close();
});

it.each(['alice@books.example.com', 'alice'])(
  'supports combined or explicit addresses and rejects invalid origins for %s',
  async (username) => {
    discover.mockClear();
    const t = await mount(<ServerSettings books={[]} />);
    const set = async (i: HTMLInputElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!.call(i, value);
        i.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const submit = () =>
      act(async () =>
        t.host
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          ),
      );
    await set(t.host.querySelector('input')!, username);
    if (username === 'alice')
      await set(
        t.host.querySelector('input[type=url]')!,
        'http://unsafe.example.com',
      );
    await submit();
    if (username === 'alice') {
      expect(discover).not.toHaveBeenCalled();
      expect(t.host.textContent).toContain('valid server origin');
    } else expect(discover).toHaveBeenCalledWith('https://books.example.com');
    await t.close();
  },
);
it('offers sign in again on session expiry', async () => {
  const t = await mount(
    <SyncStatus
      message="Sign in again; this session expired or was revoked."
      busy={false}
      pending={1}
      onSync={() => {}}
    />,
  );
  expect(t.host.querySelector('button')?.textContent).toBe('Sign in again');
  await t.close();
});

it('retains shared sync context without directions to the current settings page', async () => {
  const t = await mount(
    <SyncStatus
      message="2 changes need review in Settings → Sync"
      busy={false}
      pending={0}
      onSync={() => {}}
    />,
  );
  expect(t.host.textContent).toContain('2 changes need review');
  expect(t.host.textContent).not.toContain('Settings → Sync');
  await t.close();
});

it('focuses the password after discovery completes', async () => {
  discover.mockResolvedValueOnce({
    name: 'Quire',
    origin: 'https://books.example.com',
  });
  const t = await mount(<ServerSettings books={[]} />);
  await act(async () => {
    const i = t.host.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(i, 'alice@books.example.com');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    t.host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(document.activeElement).toBe(
    t.host.querySelector('input[type=password]'),
  );
  await t.close();
});

it('resumes the pending action only after successful sign-in, allowing retry', async () => {
  discover.mockResolvedValueOnce({
    name: 'Quire',
    origin: 'https://books.example.com',
  });
  const onConnected = vi.fn();
  const t = await mount(
    <ServerSettings books={[]} onConnected={onConnected} />,
  );
  const submit = () =>
    act(async () => {
      t.host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
  await act(async () => {
    const input = t.host.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'alice@books.example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await submit();
  vi.mocked(connect).mockRejectedValueOnce(new Error('Incorrect password'));
  await submit();
  expect(onConnected).not.toHaveBeenCalled();
  expect(t.host.textContent).toContain('Incorrect password');
  vi.mocked(connect).mockResolvedValueOnce(undefined);
  await submit();
  expect(onConnected).toHaveBeenCalledOnce();
  await t.close();
});
