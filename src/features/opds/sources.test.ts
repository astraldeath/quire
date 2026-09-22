import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../storage', () => ({
  loadSync: async () => ({ enabled: false }),
  devicePrivacyKey: () => 'test',
}));
import {
  listCatalogSources,
  saveCatalogSource,
  deleteCatalogSource,
  validateCatalogSources,
  mergeCatalogSources,
  catalogContext,
  sourceCredentials,
} from './sources';
const source = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Books',
  url: 'https://books.test/',
  revision: 0,
  deleted: false,
};
describe('saved catalogs', () => {
  it('rejects a stale editor context before storing its source or password', async () => {
    await expect(
      saveCatalogSource(
        source,
        { username: 'a', password: 'b' },
        { key: 'other-account' },
      ),
    ).rejects.toThrow('account changed');
  });
  it('persists metadata and deletion without embedding credentials', async () => {
    await saveCatalogSource(source);
    expect(await listCatalogSources()).toEqual([
      expect.objectContaining(source),
    ]);
    await deleteCatalogSource(source.id);
    expect((await listCatalogSources())[0].deleted).toBe(true);
  });
  it('validates backup metadata and strips unknown secret fields', () => {
    expect(
      validateCatalogSources([
        {
          ...source,
          password: 'secret',
          credentials: { username: 'x', password: 'secret' },
        },
      ]),
    ).toEqual([source]);
    expect(() =>
      validateCatalogSources([
        { ...source, url: 'https://user:secret@books.test/' },
      ]),
    ).toThrow();
  });
  it('retains offline changes and exposes a conflict instead of resurrecting deleted sources', () => {
    const local = { ...source, revision: 2, deleted: true, dirty: true };
    const remote = { ...source, revision: 3, name: 'Changed' };
    const merged = mergeCatalogSources([local], [remote]);
    expect(merged[0]).toMatchObject({
      deleted: true,
      dirty: true,
      conflict: remote,
    });
    expect(mergeCatalogSources([source], [remote])[0]).toEqual(remote);
  });
  it('binds explicitly replaced credentials to a newly edited origin', async () => {
    await saveCatalogSource(source, { username: 'first', password: 'old' });
    const changed = { ...source, url: 'https://new.test/' };
    await saveCatalogSource(changed, { username: 'second', password: 'new' });
    expect(await sourceCredentials(await catalogContext(), changed)).toEqual({
      username: 'second',
      password: 'new',
    });
  });
});
