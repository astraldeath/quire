import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TrackerEntryPanel } from '../src/features/tracking/TrackerEntryPanel';
import { emptyEntry } from '../src/features/tracking/entry';
import { syncNow } from '../src/features/sync/engine';
import {
  trackingRequest,
  type TrackingSession,
} from '../src/features/tracking/client';

vi.mock('../src/features/tracking/client', () => ({
  trackingRequest: vi.fn(),
}));
vi.mock('../src/features/sync/engine', () => ({
  syncNow: vi.fn(async () => {}),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it.each(['native', 'hosted'] as const)(
  'shows remote fields and saves only edits on %s despite refreshing',
  async (kind) => {
    const account: TrackingSession =
      kind === 'native'
        ? { kind }
        : {
            kind,
            account: {
              origin: 'http://localhost',
              username: 'reader',
              sessionId: 'session',
            },
          };
    const entry = {
      ...emptyEntry(),
      state: 'reading',
      progress_chapter: 14,
      progress_volume: 2,
      rating: 75,
      start_date: '2025-04-12T00:00:00.000Z',
    };
    vi.mocked(trackingRequest).mockResolvedValue({
      accountId: 'reader',
      entry,
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const click = async (label: string) => {
      const button = [...host.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === label,
      )!;
      expect(button).toBeTruthy();
      await act(async () => button.click());
    };
    try {
      await act(async () =>
        root.render(
          <TrackerEntryPanel account={account} seriesId={1} refreshKey={0} />,
        ),
      );
      expect(host.textContent).toContain('Private tracking');
      expect(host.textContent).toContain('75 / 100');
      expect(host.querySelectorAll('dt')).toHaveLength(6);
      await click('Edit');
      const select = host.querySelector('select')!;
      await act(async () => {
        select.value = 'paused';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      vi.mocked(trackingRequest).mockResolvedValue({
        accountId: 'reader',
        entry: { ...entry, rating: 95 },
      });
      await act(async () =>
        root.render(
          <TrackerEntryPanel account={account} seriesId={1} refreshKey={1} />,
        ),
      );
      await click('Save changes');
      expect(trackingRequest).toHaveBeenLastCalledWith(
        account,
        '/v1/tracking/entries/1',
        { expectedAccountId: 'reader', changes: { state: 'paused' } },
        'PUT',
      );
      if (kind === 'hosted') {
        expect(syncNow).toHaveBeenCalledOnce();
        expect(vi.mocked(syncNow).mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(trackingRequest).mock.invocationCallOrder.at(-1)!,
        );
      } else expect(syncNow).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.clearAllMocks();
    }
  },
);

it('requires an explicit privacy choice when starting a missing tracker', async () => {
  const account: TrackingSession = { kind: 'native' };
  vi.mocked(trackingRequest).mockResolvedValue({
    accountId: 'reader',
    entry: null,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <TrackerEntryPanel account={account} seriesId={1} refreshKey={0} />,
      ),
    );
    const privacy = host.querySelector<HTMLInputElement>(
      'input[role="switch"]',
    )!;
    expect(privacy.checked).toBe(true);
    await act(async () => privacy.click());
    vi.mocked(trackingRequest).mockResolvedValue({
      accountId: 'reader',
      entry: { ...emptyEntry(), is_private: false },
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button.primary')!.click(),
    );
    expect(trackingRequest).toHaveBeenLastCalledWith(
      account,
      '/v1/tracking/entries/1',
      { expectedAccountId: 'reader', is_private: false },
      'POST',
    );
    expect(host.textContent).toContain('Public tracking');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
  }
});
