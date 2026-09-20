import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrackingDialog } from '../src/features/tracking/TrackingDialog';
import { emptyEntry } from '../src/features/tracking/entry';
import { requestNavigation } from '../src/features/navigation/blockers';
import {
  trackingRequest,
  trackingSession,
} from '../src/features/tracking/client';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/sync/engine', () => ({
  syncNow: vi.fn(async () => {}),
}));
vi.mock('../src/features/tracking/client', () => ({
  trackingSession: vi.fn(),
  trackingRequest: vi.fn(),
  connectTracking: vi.fn(),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const book = {
  id: 'book',
  title: 'Novel',
  author: '',
  series: '',
  volume: null,
  addedAt: 1,
  cover: '',
  local: true,
};
const match = {
  id: 1,
  title: 'Matched novel',
  author: '',
  type: '',
  status: '',
  description: '',
  cover: '',
  sources: [],
};
const status = {
  connected: false,
  oauthAvailable: false,
  accountId: '',
  links: [],
};
let host: HTMLDivElement, root: Root;
const close = vi.fn();
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find(
    (b) =>
      b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
};
const mount = async () =>
  act(async () => root.render(<TrackingDialog book={book} onClose={close} />));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(trackingSession).mockResolvedValue({
    kind: 'hosted',
    account: {
      origin: 'http://localhost',
      username: 'reader',
      sessionId: 'one',
    },
  });
  vi.mocked(trackingRequest).mockImplementation(async (_session, path) =>
    path.includes('/search') ? { matches: [match] } : status,
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('searches once only after deliberate Add tracker entry and explains Save match without OAuth', async () => {
  await mount();
  expect(
    vi
      .mocked(trackingRequest)
      .mock.calls.filter(([, p]) => p.includes('/search')),
  ).toHaveLength(0);
  await click('Add tracker');
  expect(
    vi
      .mocked(trackingRequest)
      .mock.calls.filter(([, p]) => p.includes('/search')),
  ).toHaveLength(1);
  await click('Matched novel');
  expect(host.textContent).toContain('sign-in is not configured');
  expect(host.querySelector('button.primary')?.textContent).toContain(
    'Save match',
  );
  expect(host.textContent).not.toContain('Set to 0');
});

it.each(['native', 'hosted'] as const)(
  'ignores an older %s search after query change and can close while searching',
  async (kind) => {
    vi.mocked(trackingSession).mockResolvedValue(
      kind === 'native'
        ? { kind }
        : {
            kind,
            account: {
              origin: 'http://localhost',
              username: 'reader',
              sessionId: 'one',
            },
          },
    );
    const old = deferred(),
      newer = deferred(),
      pending = deferred();
    let searches = 0;
    vi.mocked(trackingRequest).mockImplementation(async (_session, path) =>
      path.includes('/search')
        ? ++searches === 1
          ? old.promise
          : searches === 2
            ? newer.promise
            : pending.promise
        : status,
    );
    await mount();
    await click('Add tracker');
    const input = host.querySelector<HTMLInputElement>('input[placeholder]')!;
    expect(input.disabled).toBe(false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'New title');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Search');
    await act(async () =>
      newer.resolve({ matches: [{ ...match, title: 'New match' }] }),
    );
    await act(async () =>
      old.resolve({ matches: [{ ...match, title: 'Stale match' }] }),
    );
    expect(host.textContent).toContain('New match');
    expect(host.textContent).not.toContain('Stale match');
    await click('Search');
    expect(host.textContent).toContain('Searching');
    await click('Close dialog');
    expect(close).toHaveBeenCalledOnce();
    const signals = vi
      .mocked(trackingRequest)
      .mock.calls.filter(([, p]) => p.includes('/search'))
      .map((call) => call[4]?.signal);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ matches: [{ ...match, title: 'Closed late result' }] }),
    );
    expect(host.textContent).not.toContain('Closed late result');
  },
);

it('guards submitted mutations and preserves selection and private choice after failure', async () => {
  const mutation = deferred();
  vi.mocked(trackingRequest).mockImplementation(
    async (_session, path, _body, method) =>
      method === 'PUT'
        ? mutation.promise
        : path.includes('/search')
          ? { matches: [match] }
          : { ...status, connected: true, accountId: 'reader' },
  );
  await mount();
  await click('Add tracker');
  await click('Matched novel');
  const privacy = host.querySelector<HTMLInputElement>(
    '[aria-label="Track privately on MangaBaka"]',
  )!;
  await act(async () => privacy.click());
  await click('Track');
  await click('Close dialog');
  expect(close).not.toHaveBeenCalled();
  await act(async () =>
    mutation.resolve(Promise.reject(new Error('Save failed'))),
  );
  expect(host.querySelector('h3')?.textContent).toBe('Matched novel');
  expect(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Track privately on MangaBaka"]',
    )?.checked,
  ).toBe(false);
  expect(host.textContent).toContain('Save failed');
});

it('does not reveal the old hosted account when it changes during initial loading', async () => {
  const old = deferred();
  vi.mocked(trackingRequest).mockImplementation(async (session) =>
    session.kind === 'hosted' && session.account.sessionId === 'one'
      ? old.promise
      : status,
  );
  await mount();
  vi.mocked(trackingSession).mockResolvedValue({
    kind: 'hosted',
    account: {
      origin: 'http://localhost',
      username: 'second',
      sessionId: 'two',
    },
  });
  await act(async () => window.dispatchEvent(new Event('quire-storage')));
  await act(async () =>
    old.resolve({
      ...status,
      links: [
        {
          bookId: 'book',
          title: 'Old private account title',
          seriesId: 2,
          seriesKey: '',
        },
      ],
    }),
  );
  expect(host.textContent).not.toContain('Old private account title');
  expect(host.textContent).toContain('Add tracker');
  expect(vi.mocked(trackingRequest).mock.calls[0][4]?.signal?.aborted).toBe(
    true,
  );
});

it('clears visible account data and pending search when the hosted session ends', async () => {
  await mount();
  await click('Add tracker');
  vi.mocked(trackingSession).mockRejectedValue(new Error('Sign in again.'));
  await act(async () => window.dispatchEvent(new Event('quire-storage')));
  expect(host.textContent).not.toContain('Matched novel');
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('Sign in again.');
});

it('stops a submitted match continuation when the hosted session changes', async () => {
  const mutation = deferred();
  vi.mocked(trackingRequest).mockImplementation(
    async (_session, path, _body, method) =>
      method === 'PUT'
        ? mutation.promise
        : path.includes('/search')
          ? { matches: [match] }
          : { ...status, connected: true, accountId: 'reader' },
  );
  await mount();
  await click('Add tracker');
  await click('Matched novel');
  await click('Track');
  vi.mocked(trackingSession).mockResolvedValue({
    kind: 'hosted',
    account: {
      origin: 'http://localhost',
      username: 'second',
      sessionId: 'two',
    },
  });
  await act(async () => window.dispatchEvent(new Event('quire-storage')));
  await act(async () => mutation.resolve(null));
  expect(
    vi
      .mocked(trackingRequest)
      .mock.calls.filter(
        ([, p, , method]) => p.includes('/entries') && method === 'POST',
      ),
  ).toHaveLength(0);
});

it('protects entry edits and a submitted status mutation from dialog dismissal', async () => {
  const mutation = deferred();
  vi.mocked(trackingRequest).mockImplementation(
    async (_session, path, _body, method) =>
      path.includes('/entries')
        ? method === 'PUT'
          ? mutation.promise
          : { accountId: 'reader', entry: emptyEntry() }
        : {
            ...status,
            connected: true,
            accountId: 'reader',
            links: [
              {
                bookId: 'book',
                title: 'Linked novel',
                seriesId: 1,
                seriesKey: '',
              },
            ],
          },
  );
  await mount();
  await click('Edit status');
  const select = host.querySelector<HTMLSelectElement>(
    '.tracker-entry select',
  )!;
  await act(async () => {
    select.value = 'reading';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Close dialog');
  expect(close).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Discard changes?');
  await click('Keep editing');
  await click('Save changes');
  await click('Close dialog');
  expect(close).not.toHaveBeenCalled();
  expect(
    [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Change match',
    )!.disabled,
  ).toBe(true);
  await act(async () =>
    mutation.resolve({
      accountId: 'reader',
      entry: { ...emptyEntry(), state: 'reading' },
    }),
  );
  await click('Close dialog');
  expect(close).toHaveBeenCalledOnce();
});

it('asks once before navigating away from an edited status', async () => {
  vi.mocked(trackingRequest).mockImplementation(async (_session, path) =>
    path.includes('/entries')
      ? { accountId: 'reader', entry: emptyEntry() }
      : {
          ...status,
          connected: true,
          accountId: 'reader',
          links: [
            {
              bookId: 'book',
              title: 'Linked novel',
              seriesId: 1,
              seriesKey: '',
            },
          ],
        },
  );
  await mount();
  await click('Edit status');
  const select = host.querySelector<HTMLSelectElement>(
    '.tracker-entry select',
  )!;
  await act(async () => {
    select.value = 'reading';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const navigate = vi.fn();
  await act(async () => requestNavigation(navigate));
  await click('Discard changes');
  expect(navigate).toHaveBeenCalledOnce();
});
