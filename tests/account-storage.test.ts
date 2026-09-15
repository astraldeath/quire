import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
it('separates books and notes by authenticated server account', async () => {
  const first = await import('../src/storage');
  first.useBrowserAccount('storage-user-a');
  await first.putBook(
    {
      id: 'private',
      title: 'Private book',
      author: '',
      series: '',
      volume: null,
      cover: '',
      addedAt: 1,
      local: true,
      annotations: [
        {
          id: 'note',
          kind: 'highlight',
          cfi: 'cfi',
          text: 'passage',
          note: 'Private note',
          section: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    new Uint8Array([1]),
  );
  expect(() => first.useBrowserAccount('storage-user-b')).toThrow();
  vi.resetModules();
  const second = await import('../src/storage');
  second.useBrowserAccount('storage-user-b');
  expect(await second.listBooks()).toEqual([]);
  vi.resetModules();
  const again = await import('../src/storage');
  again.useBrowserAccount('storage-user-a');
  expect((await again.listBooks())[0].annotations?.[0].note).toBe(
    'Private note',
  );
});
