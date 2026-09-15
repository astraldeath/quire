import 'fake-indexeddb/auto';
import { it, vi, expect } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
it('lists metadata consistently with large downloaded EPUBs', async () => {
  const s = await import('../src/storage');
  s.useBrowserAccount('perf-fixture');
  for (let i = 0; i < 8; i++)
    await s.putBook(
      {
        id: String(i),
        title: 'Book',
        author: '',
        series: '',
        volume: null,
        cover: '',
        addedAt: 1,
        local: true,
      },
      new Uint8Array(4 * 1024 * 1024),
    );
  for (let i = 0; i < 20; i++) expect((await s.listBooks()).length).toBe(8);
});
