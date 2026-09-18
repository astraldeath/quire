import { expect, it } from 'vitest';
import {
  normalizeFolder,
  folderPaths,
  childFolders,
  folderContains,
  importFolder,
} from './folders';
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
