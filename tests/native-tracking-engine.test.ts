import { beforeEach, expect, it, vi } from 'vitest';
import type { LocalTracking } from '../src/features/tracking/local-model';
import { newLink } from '../src/features/tracking/local-model';
import { nativeTrackingRequest } from '../src/features/tracking/native';

const fixture = vi.hoisted(() => ({
  state: {} as LocalTracking,
  who: { connected: true, name: 'Reader', accountId: 'reader' },
  provider: vi.fn(),
  books: [] as any[],
}));
vi.mock('../src/features/tracking/local-store', () => ({
  readTracking: async () => structuredClone(fixture.state),
  writeTracking: async (state: LocalTracking) => {
    fixture.state = structuredClone(state);
  },
}));
vi.mock('../src/storage', () => ({ listBooks: async () => fixture.books }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (command: string, args?: any) => {
    if (command === 'tracking_status') return fixture.who;
    if (command === 'tracking_provider') return fixture.provider(args);
    if (command === 'tracking_disconnect') {
      fixture.who.connected = false;
      return;
    }
    throw new Error(command);
  },
}));
beforeEach(() => {
  vi.useRealTimers();
  fixture.who = { connected: true, name: 'Reader', accountId: 'reader' };
  fixture.state = {
    accountId: 'reader',
    links: [
      newLink({
        bookId: 'book',
        seriesId: 1,
        seriesKey: '',
        title: 'A novel',
        volume: 1,
        auto: true,
        completeEntry: true,
      }),
    ],
  };
  fixture.books = [{ id: 'book', position: { fraction: 1 } }];
  fixture.provider.mockReset();
});
it('keeps a failed update pending and retries after the backoff', async () => {
  fixture.provider.mockRejectedValueOnce(new Error('Offline'));
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.state.links[0]).toMatchObject({
    lastStep: 0,
    error: 'Offline',
  });
  expect(fixture.state.links[0].nextAttempt).toBeGreaterThan(Date.now());
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).toHaveBeenCalledTimes(1);
  fixture.state.links[0].nextAttempt = 0;
  fixture.provider
    .mockResolvedValueOnce({
      status: 200,
      data: { state: 'reading', progress_volume: 0 },
    })
    .mockResolvedValueOnce({ status: 200, data: {} });
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.state.links[0]).toMatchObject({
    lastStep: 2,
    error: '',
    nextAttempt: 0,
  });
  expect(fixture.provider).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedAccountId: 'reader',
      method: 'PUT',
      body: { state: 'completed', progress_volume: 1 },
    }),
  );
});
it('does not reapply an acknowledged completion', async () => {
  fixture.state.links[0].lastStep = 2;
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).not.toHaveBeenCalled();
});
it('sends later chapters after reading status was acknowledged and remembers them', async () => {
  Object.assign(fixture.state.links[0], {
    volume: 0,
    lastStep: 1,
    lastChapter: 3,
  });
  fixture.books = [
    { id: 'book', position: { fraction: 0.5, completedChapter: 4 } },
  ];
  fixture.provider
    .mockResolvedValueOnce({
      status: 200,
      data: { state: 'reading', progress_volume: 0, progress_chapter: 3 },
    })
    .mockResolvedValueOnce({ status: 200, data: {} });
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'PUT', body: { progress_chapter: 4 } }),
  );
  expect(fixture.state.links[0].lastChapter).toBe(4);
  fixture.provider.mockClear();
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).not.toHaveBeenCalled();
});
it('disables automatic links when a different MangaBaka account connects', async () => {
  fixture.who.accountId = 'other';
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).not.toHaveBeenCalled();
  expect(fixture.state).toMatchObject({
    accountId: 'other',
    links: [{ auto: false, lastStep: 0 }],
  });
});
it('rejects a stale auto-track edit after the OAuth account changes', async () => {
  const oldLink = fixture.state.links[0];
  fixture.who.accountId = 'other';
  await expect(
    nativeTrackingRequest(
      '/v1/tracking/books/book',
      { ...oldLink, expectedAccountId: 'reader' },
      'PUT',
    ),
  ).rejects.toThrow('account changed');
  expect(fixture.state.links[0].auto).toBe(false);
  expect(fixture.provider).not.toHaveBeenCalled();
});
it('does not let recurring failures starve unattempted books', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const template = fixture.state.links[0];
  fixture.state.links = Array.from({ length: 5 }, (_, i) => ({
    ...template,
    bookId: String(i),
    seriesId: i + 1,
  }));
  fixture.books = fixture.state.links.map((l) => ({
    id: l.bookId,
    position: { fraction: 0.5 },
  }));
  fixture.provider.mockRejectedValue(new Error('Unavailable'));
  for (let i = 0; i < 4; i++) {
    await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
    vi.setSystemTime(Date.now() + 15000);
  }
  fixture.provider.mockResolvedValue({
    status: 200,
    data: { state: 'reading', progress_volume: 0 },
  });
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/v1/my/library/5' }),
  );
  expect(fixture.state.links[4].lastStep).toBe(1);
  vi.useRealTimers();
});
it('disconnects locally without unlinking or updating the remote entry', async () => {
  await nativeTrackingRequest('/v1/tracking/account', undefined, 'DELETE');
  expect(fixture.state.links).toHaveLength(1);
  expect(fixture.state.links[0].auto).toBe(false);
  expect(fixture.provider).not.toHaveBeenCalled();
});
it('creates missing entries privately and skips books removed from the library', async () => {
  fixture.books = [];
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).not.toHaveBeenCalled();
  fixture.books = [{ id: 'book', position: { fraction: 0.5 } }];
  fixture.provider
    .mockResolvedValueOnce({ status: 404, data: null })
    .mockResolvedValueOnce({ status: 200, data: {} });
  await nativeTrackingRequest('/v1/tracking/sync', {}, 'POST');
  expect(fixture.provider).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      body: { state: 'reading', is_private: true },
    }),
  );
  expect(fixture.state.links[0].lastStep).toBe(1);
});
