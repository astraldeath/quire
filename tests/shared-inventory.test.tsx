import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useSharedLibraries } from '../src/features/library/LocalOnlyBadge';
const { state, request } = vi.hoisted(() => ({
  state: {
    enabled: true,
    account: {
      origin: 'https://quire.test',
      username: 'one',
      sessionId: 'one',
    },
    libraries: [{ id: 'shared', name: 'Cached library', bookIds: ['a'] }],
  },
  request: vi.fn(),
}));
vi.mock('../src/storage', () => ({
  loadSync: async () => structuredClone(state),
  syncTransaction: async (fn: any) => fn(state).result,
}));
vi.mock('../src/features/sync/engine', () => ({ subscribe: () => () => {} }));
vi.mock('../src/features/sync/transport', () => ({ sharedLibraries: request }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function Probe() {
  return (
    <div>
      {useSharedLibraries()
        .map((l) => l.name)
        .join(',')}
    </div>
  );
}
it('retains cached shared browsing offline/disconnected and rejects a late prior-session catalog', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  request.mockRejectedValue(new Error('offline'));
  await act(async () => root.render(<Probe />));
  expect(host.textContent).toBe('Cached library');
  state.enabled = false;
  await act(async () => {
    window.dispatchEvent(new Event('quire-synced'));
    await new Promise((r) => setTimeout(r, 70));
  });
  expect(host.textContent).toBe('Cached library');
  expect(request).toHaveBeenCalledTimes(1);
  state.enabled = true;
  let resolve!: (v: any) => void;
  request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () => {
    window.dispatchEvent(new Event('quire-synced'));
    await new Promise((r) => setTimeout(r, 70));
  });
  state.account = { ...state.account, sessionId: 'two' };
  state.libraries = [];
  await act(async () =>
    resolve([{ id: 'old', name: 'Previous account', bookIds: [] }]),
  );
  expect(host.textContent).toBe('');
  expect(state.libraries).toEqual([]);
  await act(async () => root.unmount());
  host.remove();
});
