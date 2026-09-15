import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TrackingDialog } from '../src/features/tracking/TrackingDialog';
const bridge = vi.hoisted(() =>
  vi.fn(async (command: string) => {
    if (command === 'tracking_status')
      return { connected: false, name: '', accountId: '' };
    if (command === 'tracking_connect') return null;
    throw new Error(command);
  }),
);
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: bridge,
}));
vi.mock('../src/features/tracking/local-store', () => ({
  readTracking: async () => ({ accountId: '', links: [] }),
  writeTracking: vi.fn(),
}));
vi.mock('../src/storage', () => ({
  listBooks: async () => [],
  loadSync: () => {
    throw new Error('Standalone tracking must not load server account');
  },
}));
vi.mock('../src/features/sync/transport', () => ({
  accountRequest: () => {
    throw new Error('Standalone tracking must not contact Quire Server');
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('opens tracking and starts native authorization without a Quire account', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <TrackingDialog
          book={{
            id: 'one',
            title: 'Book',
            author: '',
            series: '',
            volume: null,
            addedAt: 1,
            cover: '',
            local: true,
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(document.body.textContent).not.toContain(
      'Sign in to your Quire server',
    );
    const connect = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Connect MangaBaka',
    );
    expect(connect).toBeTruthy();
    await act(async () => connect!.click());
    expect(bridge).toHaveBeenCalledWith('tracking_connect');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
