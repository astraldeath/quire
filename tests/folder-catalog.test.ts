import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import {
  mergeFolderCatalog,
  validateFolderCatalog,
} from '../src/features/library/folderCatalog';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
const empty = { library: [], hidden: [] };
it('validates canonical bounded paths and deduplicates each independent scope', () => {
  expect(validateFolderCatalog(empty)).toEqual(empty);
  expect(
    validateFolderCatalog({ library: ['B', 'A', 'A'], hidden: ['A'] }),
  ).toEqual({ library: ['A', 'B'], hidden: ['A'] });
  for (const path of [
    '',
    ' A',
    'a//b',
    '..',
    'a\\b',
    'é'.repeat(128),
    Array(33).fill('a').join('/'),
  ])
    expect(() =>
      validateFolderCatalog({ library: [path], hidden: [] }),
    ).toThrow();
  expect(() =>
    validateFolderCatalog({ library: Array(5001).fill('a'), hidden: [] }),
  ).toThrow();
  expect(() =>
    validateFolderCatalog({
      library: Array.from({ length: 5000 }, (_, i) => 'x'.repeat(250) + i),
      hidden: [],
    }),
  ).toThrow();
});
it('retains remote deletions and unrelated offline additions without crossing scopes', () => {
  const base = { library: ['Old'], hidden: ['Private'] };
  expect(mergeFolderCatalog(base, base, empty)).toEqual(empty);
  expect(
    mergeFolderCatalog(
      base,
      { library: ['Old', 'Local'], hidden: [] },
      { library: ['Remote'], hidden: ['Private', 'New'] },
    ),
  ).toEqual({ library: ['Local', 'Remote'], hidden: ['New'] });
  expect(
    mergeFolderCatalog(
      { library: ['Old'], hidden: [] },
      { library: ['Rename A'], hidden: [] },
      { library: ['Rename B'], hidden: [] },
    ),
  ).toEqual({ library: ['Rename A', 'Rename B'], hidden: [] });
});
it('persists empty nested folders through browser restart and serializes edits', async () => {
  let s = await import('../src/storage');
  s.useBrowserAccount('folder-restart');
  await Promise.all([
    s.editFolderCatalog((c) => {
      c.value.library.push('Empty/Nested');
    }),
    s.editFolderCatalog((c) => {
      c.value.hidden.push('Secret');
    }),
  ]);
  vi.resetModules();
  s = await import('../src/storage');
  s.useBrowserAccount('folder-restart');
  expect((await s.loadFolderCatalog()).value).toEqual({
    library: ['Empty/Nested'],
    hidden: ['Secret'],
  });
});

it('rolls back catalog changes when a browser membership transaction fails', async () => {
  vi.resetModules();
  const s = await import('../src/storage');
  s.useBrowserAccount('folder-atomic');
  await s.editFolderCatalog((c) => {
    c.value.library = ['Before'];
  });
  await expect(
    s.editFolderCatalog(
      (c) => {
        c.value.library = ['After'];
      },
      () =>
        [
          {
            id: undefined,
            title: 'Invalid',
            author: '',
            series: '',
            volume: null,
            cover: '',
            addedAt: 1,
            local: false,
          },
        ] as any,
    ),
  ).rejects.toThrow();
  expect((await s.loadFolderCatalog()).value.library).toEqual(['Before']);
  expect(await s.listBooks()).toEqual([]);
});
