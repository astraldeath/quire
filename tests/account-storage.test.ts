import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
it('rejects a catalog import queued behind an account change', async () => {
  vi.resetModules();
  const storage = await import('../src/storage');
  storage.useBrowserAccount('catalog-import-race');
  const account = {
    origin: 'https://quire.test',
    username: 'first',
    sessionId: 'a',
  };
  await storage.syncTransaction((s) => {
    s.enabled = true;
    s.account = account;
    return { result: undefined };
  });
  const change = storage.syncTransaction((s) => {
    s.account = { ...account, username: 'second', sessionId: 'b' };
    return { result: undefined };
  });
  const importing = storage.putCatalogBook(
    {
      id: 'a'.repeat(64),
      title: 'Catalog book',
      author: '',
      series: '',
      volume: null,
      cover: '',
      addedAt: 1,
      local: true,
    },
    new Uint8Array([1]),
    account,
  );
  await change;
  await expect(importing).rejects.toThrow('account or session changed');
  expect(await storage.listBooks()).toEqual([]);
});
it('separates books and notes by authenticated server account', async () => {
  vi.resetModules();
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
