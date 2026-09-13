import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { openDB, type DBSchema } from 'idb';
import { defaults, type Book, type Preferences } from './domain/models';

interface Record { id: string; metadata: Book; file?: Uint8Array }
interface LibraryDB extends DBSchema {
  books: { key: string; value: Record };
  preferences: { key: string; value: Preferences };
}
const browser = () => openDB<LibraryDB>('quire-library', 1, {
  upgrade(db) { db.createObjectStore('books', { keyPath: 'id' }); db.createObjectStore('preferences'); },
});
let browserPromise: ReturnType<typeof browser> | undefined;
const idb = () => browserPromise ??= browser();
let nativePromise: Promise<Database> | undefined;
const sql = () => nativePromise ??= Database.load('sqlite:quire.db');
const mergePreferences = (p?: Partial<Preferences>): Preferences => ({ ...defaults, ...p, reader: { ...defaults.reader, ...p?.reader, theme: (p?.reader?.theme as string) === 'sepia' ? 'app' : p?.reader?.theme ?? defaults.reader.theme } });
function encode(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}

export async function listBooks(): Promise<Book[]> {
  if (isTauri()) {
    const rows = await (await sql()).select<{ metadata: string; local: number }[]>('SELECT metadata, file IS NOT NULL AS local FROM books');
    return rows.map(row => ({ ...JSON.parse(row.metadata), local: Boolean(row.local) }));
  }
  return (await (await idb()).getAll('books')).map(row => ({ ...row.metadata, local: row.file !== undefined }));
}

export async function saveBook(book: Book): Promise<void> {
  if (isTauri()) {
    await (await sql()).execute('INSERT INTO books (id, metadata) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata', [book.id, JSON.stringify(book)]);
    return;
  }
  const tx = (await idb()).transaction('books', 'readwrite');
  const existing = await tx.store.get(book.id);
  await tx.store.put({ id: book.id, metadata: book, file: existing?.file });
  await tx.done;
}

// A single statement / IndexedDB transaction commits both bytes and metadata.
// Identical reimport restores bytes while retaining manual organization and position.
export async function putBook(book: Book, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    await (await sql()).execute('INSERT INTO books (id, metadata, file) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET file = excluded.file', [book.id, JSON.stringify(book), encode(bytes)]);
    return;
  }
  const tx = (await idb()).transaction('books', 'readwrite');
  const existing = await tx.store.get(book.id);
  await tx.store.put({ id: book.id, metadata: existing?.metadata ?? book, file: bytes });
  await tx.done;
}

export async function getFile(id: string): Promise<Uint8Array | undefined> {
  if (isTauri()) {
    const rows = await (await sql()).select<{ file: string | null }[]>('SELECT file FROM books WHERE id = $1', [id]);
    return rows[0]?.file == null ? undefined : Uint8Array.from(atob(rows[0].file), c => c.charCodeAt(0));
  }
  return (await (await idb()).get('books', id))?.file;
}

export async function removeFile(id: string): Promise<void> {
  if (isTauri()) {
    await (await sql()).execute('UPDATE books SET file = NULL WHERE id = $1', [id]);
    return;
  }
  const tx = (await idb()).transaction('books', 'readwrite');
  const record = await tx.store.get(id);
  if (record) await tx.store.put({ id, metadata: record.metadata });
  await tx.done;
}

export async function loadPreferences(): Promise<Preferences> {
  if (isTauri()) {
    const rows = await (await sql()).select<{ value: string }[]>('SELECT value FROM preferences WHERE id = 1');
    return mergePreferences(rows[0] ? JSON.parse(rows[0].value) : undefined);
  }
  return mergePreferences(await (await idb()).get('preferences', 'device'));
}

export async function savePreferences(p: Preferences): Promise<void> {
  if (isTauri()) {
    await (await sql()).execute('INSERT INTO preferences (id, value) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET value = excluded.value', [JSON.stringify(p)]);
    return;
  }
  await (await idb()).put('preferences', p, 'device');
}
