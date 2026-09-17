import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TrackingDialog } from '../src/features/tracking/TrackingDialog';
import { trackingRequest } from '../src/features/tracking/client';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('../src/features/sync/engine', () => ({ syncNow: vi.fn() }));
vi.mock('../src/features/tracking/client', () => ({
  trackingSession: async () => ({ kind: 'native' }),
  trackingRequest: vi.fn(),
  connectTracking: vi.fn(),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it.each([
  {
    title: 'Web Novel Chapters 1-300',
    saved: undefined,
    volume: 0,
    completeEntry: false,
  },
  { title: 'Novel Vol. 5', saved: undefined, volume: 5, completeEntry: true },
  {
    title: 'Web Novel',
    saved: { volume: 7, completeEntry: true },
    volume: 7,
    completeEntry: true,
  },
])(
  'saves appropriate tracking defaults for $title',
  async ({ title, saved, volume, completeEntry }) => {
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
    vi.mocked(trackingRequest).mockImplementation(async (_account, path) => {
      if (path.startsWith('/v1/tracking/search')) return { matches: [match] };
      return {
        connected: false,
        oauthAvailable: true,
        accountId: '',
        links: saved
          ? [
              {
                ...saved,
                bookId: 'book',
                seriesId: 1,
                seriesKey: '',
                title: match.title,
                auto: false,
              },
            ]
          : [],
      };
    });
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const click = async (label: string) => {
      const button = [...host.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === label,
      );
      expect(button, label).toBeTruthy();
      await act(async () => button!.click());
    };
    try {
      await act(async () =>
        root.render(
          <TrackingDialog
            book={{
              id: 'book',
              title,
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
      await click(saved ? 'Match & auto-track' : 'Add tracker');
      if (!saved) {
        await click('Search');
        await click('Matched novel');
        expect(
          host.querySelector<HTMLInputElement>(
            'input[aria-label="Track privately on MangaBaka"]',
          )?.checked,
        ).toBe(true);
      }
      expect(
        host.querySelector<HTMLInputElement>('input[type="number"]')?.value,
      ).toBe(String(volume));
      await click(saved ? 'Save' : 'Track');
      expect(
        vi
          .mocked(trackingRequest)
          .mock.calls.some(
            ([, path, body]) =>
              path === '/v1/tracking/books/book' &&
              (body as { volume?: number })?.volume === volume &&
              (body as { completeEntry?: boolean })?.completeEntry ===
                completeEntry,
          ),
      ).toBe(true);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.clearAllMocks();
    }
  },
);
