import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useSharedLibraries } from '../src/features/library/LocalOnlyBadge';

const { invoke, state } = vi.hoisted(() => ({
  invoke: vi.fn(),
  state: {
    enabled: true,
    account: {
      origin: 'https://quire.test',
      username: 'native',
      sessionId: 'device',
    },
    libraries: [],
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }));
vi.mock('../src/storage', () => ({
  loadSync: async () => structuredClone(state),
  syncTransaction: async (fn: any) => fn(state).result,
}));
vi.mock('../src/features/sync/engine', () => ({ subscribe: () => () => {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('discovers native shared libraries using saved native credentials without a browser token', async () => {
  const libraries = [
    { id: 'shared', name: 'Family books', bookIds: ['a'.repeat(64)] },
  ];
  invoke.mockResolvedValue(libraries);
  function Probe() {
    return (
      <div>
        {useSharedLibraries()
          .map((library) => library.name)
          .join(',')}
      </div>
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    expect(host.textContent).toBe('Family books');
    expect(invoke).toHaveBeenCalledWith('sync_libraries', {
      server: 'https://quire.test',
      username: 'native',
    });
    expect(state.libraries).toEqual(libraries);
  } finally {
    await act(async () => root.unmount());
  }
});
