import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TrackingDialog } from '../src/features/tracking/TrackingDialog';
import { emptySync } from '../src/features/sync/model';
import { loadSync } from '../src/storage';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/storage', () => ({ loadSync: vi.fn() }));
vi.mock('../src/features/sync/engine', () => {
  const status = { busy: false, message: '', error: '' };
  return {
    syncNow: vi.fn(),
    subscribe: () => () => {},
    snapshot: () => status,
  };
});
vi.mock('../src/features/tracking/client', async (original) => ({
  ...(await original<typeof import('../src/features/tracking/client')>()),
  trackingRequest: vi.fn(async () => ({
    connected: false,
    oauthAvailable: false,
    links: [],
    name: '',
  })),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('opens server connection and returns to the same series after connecting', async () => {
  vi.mocked(loadSync).mockResolvedValue(emptySync());
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const click = async (text: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === text,
    );
    expect(button, text).toBeTruthy();
    await act(async () => button!.click());
  };
  try {
    await act(async () =>
      root.render(
        <TrackingDialog
          book={{
            id: 'one',
            title: 'Volume one',
            author: '',
            series: 'Original series',
            volume: 1,
            local: true,
            cover: '',
            addedAt: 0,
          }}
          series="Original series"
          onClose={() => {}}
        />,
      ),
    );
    await click('Connect server');
    expect(host.querySelector('input[autocomplete="username"]')).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>(
      'input[autocomplete="username"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'reader');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Back to tracking');
    expect(host.textContent).toContain('Discard changes?');
    await click('Keep editing');
    expect(input.value).toBe('reader');
    vi.mocked(loadSync).mockResolvedValue({
      ...emptySync(),
      enabled: true,
      account: {
        origin: 'https://books.test',
        username: 'reader',
        sessionId: 'session',
      },
    });
    await act(async () => window.dispatchEvent(new Event('quire-storage')));
    await click('Back to tracking');
    expect(host.textContent).toContain('Original series');
    expect(host.textContent).toContain('Track series');
    expect(host.querySelector('input[autocomplete="username"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
