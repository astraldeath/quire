import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SyncNotice } from '../src/features/sync/SyncNotice';
import { emptySync } from '../src/features/sync/model';
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  changed: undefined as (() => void) | undefined,
}));
vi.mock('../src/storage', () => ({ loadSync: mocks.load }));
vi.mock('../src/features/sync/engine', () => ({
  subscribe: (fn: () => void) => {
    mocks.changed = fn;
    return () => {
      mocks.changed = undefined;
    };
  },
}));
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('shows persisted conflicts, opens review and clears after resolution or disconnect', async () => {
  const state = { ...emptySync(), enabled: true };
  state.records['book/book/default'] = {
    bookId: 'book',
    kind: 'book',
    recordId: 'default',
    revision: 2,
    candidates: [
      {
        operationId: 'a',
        deleted: false,
        createdAt: 1,
        value: { title: 'Private title' },
      },
      {
        operationId: 'b',
        deleted: false,
        createdAt: 2,
        value: { title: 'Other private title' },
      },
    ],
  };
  mocks.load.mockImplementation(async () => state);
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  try {
    await act(async () => root.render(<SyncNotice onOpen={open} />));
    expect(host.textContent).toContain('1 sync conflict');
    expect(host.textContent).not.toContain('Private title');
    await act(async () => host.querySelector('button')!.click());
    expect(open).toHaveBeenCalledOnce();
    state.enabled = false;
    await act(async () => mocks.changed?.());
    expect(host.textContent).toBe('');
    state.enabled = true;
    await act(async () => mocks.changed?.());
    expect(host.textContent).toContain('1 sync conflict');
    state.records = {};
    await act(async () => mocks.changed?.());
    expect(host.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
  }
  expect(mocks.changed).toBeUndefined();
});
