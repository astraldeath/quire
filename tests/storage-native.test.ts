// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { Book } from '../src/domain/models';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => {
  const database = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8').match(/sql: "([^"]+)"/)![1];
  database.exec(migration);
  return {
    execute: async (query: string, bindings: SQLInputValue[] = []) => database.prepare(query).run(Object.fromEntries(bindings.map((value, index) => [`$${index + 1}`, value]))),
    select: async (query: string, bindings: SQLInputValue[] = []) => database.prepare(query).all(Object.fromEntries(bindings.map((value, index) => [`$${index + 1}`, value]))),
  };
} } }));

it('native SQL statements preserve metadata and roundtrip binary bytes', async () => {
  const storage = await import('../src/storage');
  const book: Book = { id: 'native', title: 'A book', author: '', series: '', volume: null, cover: '', addedAt: 1, local: true };
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
  await storage.putBook(book, bytes);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const updated = { ...book, series: 'Manual', position: { cfi: 'epubcfi(/6/2)', fraction: .5, section: 'one', updatedAt: 2 } };
  await storage.saveBook(updated);
  await storage.removeFile(book.id);
  expect(await storage.getFile(book.id)).toBeUndefined();
  expect(await storage.listBooks()).toEqual([{ ...updated, local: false }]);
  await storage.putBook(book, bytes);
  expect(await storage.listBooks()).toEqual([updated]);
  expect(await storage.getFile(book.id)).toEqual(bytes);
  const preferences = await storage.loadPreferences();
  preferences.reader.size = 31;
  await storage.savePreferences(preferences);
  expect((await storage.loadPreferences()).reader.size).toBe(31);
});
