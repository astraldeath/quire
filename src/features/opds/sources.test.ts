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
} from './sources';
const source = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Books',
  url: 'https://books.test/',
  revision: 0,
  deleted: false,
};
describe('saved catalogs', () => {
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
});
