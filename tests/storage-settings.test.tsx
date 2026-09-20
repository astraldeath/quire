import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StorageSettings } from '../src/features/storage/StorageSettings';
const { state, summary } = vi.hoisted(() => ({
  state: {
    enabled: false,
    account: { origin: 'https://server.test', username: 'a', sessionId: 's' },
  },
  summary: vi.fn(async () => ({ books: 2, bytes: 1073741824 })),
}));
vi.mock('../src/storage', () => ({
  loadSync: async () => state,
  localFileSummary: summary,
}));
vi.mock('../src/features/storage/manager', () => ({
  storageMessage: () => '',
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('measures original files and connects to Sync; preserves custom limits', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const connect = vi.fn();
  await act(async () => root.render(<StorageSettings onConnect={connect} />));
  expect(host.textContent).toContain('2 downloaded books');
  expect(host.textContent).toContain('1.00 GiB');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent === 'Connect server')!
      .click(),
  );
  expect(connect).toHaveBeenCalledOnce();
  state.enabled = true;
  localStorage.setItem(
    'quire-storage-policy:a@https://server.test',
    JSON.stringify({ offload: true, maxMB: 1536 }),
  );
  await act(async () =>
    window.dispatchEvent(new Event('quire-storage-policy')),
  );
  expect((host.querySelector('select') as HTMLSelectElement).value).toBe(
    'custom',
  );
  expect(
    (host.querySelector('input[max="1024"]') as HTMLInputElement).value,
  ).toBe('1.5');
  await act(async () => {
    const select = host.querySelector('select')!;
    select.value = '2048';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(
    JSON.parse(
      localStorage.getItem('quire-storage-policy:a@https://server.test')!,
    ).maxMB,
  ).toBe(2048);
  await act(async () => root.unmount());
  host.remove();
});
