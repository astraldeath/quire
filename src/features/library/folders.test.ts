import { expect, it } from 'vitest';
import {
  normalizeFolder,
  folderPaths,
  childFolders,
  folderContains,
  importFolder,
  normalizeFolders,
  validFolders,
  bookFolders,
  bookInFolder,
  bookDirectlyInFolder,
} from './folders';
it('normalizes memberships and gives explicit empty lists precedence over legacy paths', () => {
  expect(
    normalizeFolders([' Fiction / Fantasy ', 'Fiction/Fantasy', 'Reading']),
  ).toEqual(['Fiction/Fantasy', 'Reading']);
  expect(bookFolders({ folder: 'Old' })).toEqual(['Old']);
  expect(bookFolders({ folder: 'Old', folders: [] })).toEqual([]);
  expect(validFolders(['A', 'B/C'])).toBe(true);
  for (const value of [
    null,
    '',
    [''],
    ['A', 'A'],
    [' A '],
    ['../B'],
    Array.from({ length: 33 }, (_, i) => String(i)),
  ])
    expect(validFolders(value)).toBe(false);
  expect(() => normalizeFolders([''])).toThrow();
  const book = { folders: ['Fiction/Fantasy', 'Reading'] };
  expect(folderPaths([book])).toEqual([
    'Fiction',
    'Fiction/Fantasy',
    'Reading',
  ]);
  expect(bookInFolder(book, 'Fiction')).toBe(true);
  expect(bookInFolder(book, 'Fictional')).toBe(false);
  expect(bookDirectlyInFolder(book, 'Fiction')).toBe(false);
  expect(bookDirectlyInFolder(book, 'Reading')).toBe(true);
  expect(bookDirectlyInFolder(book, '')).toBe(false);
  expect(bookDirectlyInFolder({ folders: [], folder: 'Old' }, '')).toBe(true);
});
it('normalizes nested names and rejects traversal or absolute paths', () => {
  expect(normalizeFolder(' Fiction / Fantasy ')).toBe('Fiction/Fantasy');
  for (const name of [
    '/root',
    '../secret',
    'A/../B',
    'A//B',
    'C:\\Books',
    'A\u0000B',
  ])
    expect(() => normalizeFolder(name)).toThrow();
  expect(normalizeFolder('')).toBe('');
});
it('derives parent folders without matching similar prefixes', () => {
  const paths = folderPaths([
    { folder: 'Fiction/Fantasy' },
    { folder: 'Fictional' },
    { folder: 'Fiction/Fantasy' },
  ]);
  expect(paths).toEqual(['Fiction', 'Fiction/Fantasy', 'Fictional']);
  expect(childFolders(paths, '')).toEqual(['Fiction', 'Fictional']);
  expect(childFolders(paths, 'Fiction')).toEqual(['Fiction/Fantasy']);
  expect(folderContains('Fiction', 'Fictional')).toBe(false);
  expect(folderContains('Fiction', 'Fiction/Fantasy')).toBe(true);
});
it('preserves imported directory structure within the current folder', () => {
  expect(importFolder('Books/Fantasy/One.epub', 'Reading')).toBe(
    'Reading/Books/Fantasy',
  );
  expect(importFolder('', 'Reading')).toBe('Reading');
});
