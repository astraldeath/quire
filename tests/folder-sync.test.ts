import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
const remote = vi.hoisted(() => ({
  revision: 0,
  state: { library: [] as string[], hidden: [] as string[] },
  lost: false,
  supported: true,
  catalogConflict: false,
  hook: undefined as undefined | (() => Promise<void>),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../src/features/privacy/sync', () => ({
  syncPrivacy: async () => {},
  privacyChanged: 'privacy-changed',
}));
vi.mock('../src/features/statistics/sync', () => ({
  syncReadingActivity: async () => {},
}));
vi.mock('../src/features/sync/library', () => ({
  fetchCovers: async () => {},
}));
vi.mock('../src/features/sync/transport', () => ({
  supportsOpds: async () => remote.catalogConflict,
  supportsMultipleFolders: async () => true,
  supportsCurrentChapter: async () => true,
  call: async () => ({
    cursor: 1,
    changes: [
      {
        bookId: 'a'.repeat(64),
        kind: 'book',
        recordId: 'default',
        revision: 1,
        cursor: 1,
        candidates: [
          {
            operationId: 'remote',
            deleted: false,
            createdAt: 1,
            value: { title: 'Remote book' },
          },
        ],
      },
    ],
    results: [],
    hasMore: false,
  }),

  supportsFolderCatalog: async () => remote.supported,
  folderCall: async (_a: unknown, req: any) => {
    const hook = remote.hook;
    remote.hook = undefined;
    await hook?.();
    let accepted = true;
    if (req.state) {
      accepted =
        req.revision === remote.revision ||
        JSON.stringify(req.state) === JSON.stringify(remote.state);
      if (
        accepted &&
        JSON.stringify(req.state) !== JSON.stringify(remote.state)
      ) {
        remote.state = structuredClone(req.state);
        remote.revision++;
      }
      if (remote.lost) {
        remote.lost = false;
        throw new Error('lost response');
      }
    }
    return {
      revision: remote.revision,
      state: structuredClone(remote.state),
      accepted,
    };
  },
}));
vi.mock('../src/features/opds/sources', () => ({
  syncCatalogSources: async () => {
    if (remote.catalogConflict) throw new Error('Catalog changes need review');
  },
}));
let s: typeof import('../src/storage');
let sync: typeof import('../src/features/library/folderSync');
beforeEach(async () => {
  vi.resetModules();
  remote.catalogConflict = false;
  remote.revision = 0;
  remote.state = { library: [], hidden: [] };
  remote.lost = false;
  remote.supported = true;
  remote.hook = undefined;
  s = await import('../src/storage');
  s.useBrowserAccount(crypto.randomUUID());
  sync = await import('../src/features/library/folderSync');
});
const connect = async (origin = 'https://one.test') =>
  s.syncTransaction((x) => {
    x.account = { origin, username: 'alice', sessionId: origin };
    x.enabled = true;
    return { result: undefined };
  });
it('joins the first account after pulling and reopens original catalogs without cross-server copying', async () => {
  await s.editFolderCatalog((c) => {
    c.value.library = ['Device'];
  });
  await connect();
  remote.state.library = ['Server'];
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).value.library).toEqual([
    'Device',
    'Server',
  ]);
  await connect('https://two.test');
  remote.state = { library: [], hidden: [] };
  remote.revision = 0;
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).value.library).toEqual([]);
  await s.editFolderCatalog((c) => {
    c.value.library = ['Second'];
  });
  await s.syncTransaction((x) => {
    x.enabled = false;
    return { result: undefined };
  });
  expect((await s.loadFolderCatalog()).value.library).toEqual(['Second']);
  await connect();
  expect((await s.loadFolderCatalog()).value.library).toEqual([
    'Device',
    'Server',
  ]);
});
it('ignores a response after the account changes during its request', async () => {
  await connect();
  remote.state.library = ['Private'];
  remote.hook = () => connect('https://two.test');
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).value.library).toEqual([]);
});
it('retains pending edits after lost accepted responses and merges concurrent local edits', async () => {
  await connect();
  await s.editFolderCatalog((c) => {
    c.value.library = ['A'];
  });
  remote.lost = true;
  await expect(sync.syncFolderCatalog()).rejects.toThrow('lost');
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).sync?.revision).toBe(1);
  remote.hook = () =>
    s.editFolderCatalog((c) => {
      c.value.library.push('B');
    });
  await sync.syncFolderCatalog();
  expect(remote.state.library).toEqual(['A', 'B']);
});
it('preserves local catalogs after server rollback and old-server discovery', async () => {
  await connect();
  await s.editFolderCatalog((c) => {
    c.value.library = ['Saved'];
  });
  await sync.syncFolderCatalog();
  remote.revision = 0;
  remote.state = { library: [], hidden: [] };
  await sync.syncFolderCatalog();
  expect(remote.state.library).toEqual(['Saved']);
  remote.supported = false;
  await s.editFolderCatalog((c) => {
    c.value.library.push('Offline');
  });
  await expect(sync.syncFolderCatalog()).rejects.toThrow(/Update Quire Server/);
  expect((await s.loadFolderCatalog()).value.library).toEqual([
    'Offline',
    'Saved',
  ]);
});

it('keeps ordinary sync working when an old server has no folder capability', async () => {
  await connect();
  await s.editFolderCatalog((c) => {
    c.value.library = ['Local'];
  });
  remote.supported = false;
  const engine = await import('../src/features/sync/engine');
  await engine.syncNow();
  expect((await s.loadSync()).cursor).toBe(1);
  expect((await s.listBooks())[0].title).toBe('Remote book');
  expect(engine.snapshot().message).toContain('Update Quire Server');
  expect((await s.loadFolderCatalog()).value.library).toEqual(['Local']);
});
it('does not resurrect remote deletions when the local catalog is unchanged', async () => {
  await connect();
  remote.state.library = ['Old'];
  await sync.syncFolderCatalog();
  remote.state.library = [];
  remote.revision++;
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).value.library).toEqual([]);
  expect(remote.state.library).toEqual([]);
});
it('does not acknowledge an old session response into a replacement session', async () => {
  await connect();
  remote.state.library = ['Old session'];
  remote.hook = () =>
    s.syncTransaction((state) => {
      state.account!.sessionId = 'replacement';
      return { result: undefined };
    });
  await sync.syncFolderCatalog();
  expect((await s.loadFolderCatalog()).value.library).toEqual([]);
});

it('finishes library and folder sync when catalog sources need conflict review', async () => {
  await connect();
  remote.catalogConflict = true;
  await s.editFolderCatalog((c) => {
    c.value.library = ['Books'];
  });
  const engine = await import('../src/features/sync/engine');
  await engine.syncNow();
  expect((await s.loadSync()).cursor).toBe(1);
  expect(remote.state.library).toEqual(['Books']);
  expect(engine.snapshot().message).toContain('Catalog changes need review');
});
