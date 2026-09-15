import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  type FileEntry,
} from '@zip.js/zip.js';
import type { Book, Preferences } from '../../domain/models';
import { validateBook, validatePreferences } from './validation';
export interface BackupRecord {
  book: Book;
  file?: Uint8Array;
}
export interface Backup {
  createdAt: number;
  kind: 'full' | 'data';
  preferences: Preferences;
  records: BackupRecord[];
}
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const MANIFEST_MAX = 32 * 1024 * 1024;
const hash = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
async function extract(entry: FileEntry, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  await entry.getData!(
    new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.length;
        if (size > limit) throw new Error('Backup exceeds the size limit.');
        chunks.push(chunk);
      },
    }),
    { checkSignature: true },
  );
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function createBackup(
  records: BackupRecord[],
  preferences: Preferences,
  kind: Backup['kind'],
): Promise<Uint8Array> {
  const files = kind === 'full' ? records.filter((r) => r.file) : [];
  const manifest = {
    format: 'quire-backup',
    version: 1,
    createdAt: Date.now(),
    kind,
    preferences,
    books: records.map((r) => r.book),
    files: files.map((r) => r.book.id),
  };
  const data = new TextEncoder().encode(JSON.stringify(manifest));
  if (
    data.length > MANIFEST_MAX ||
    records.length > 5000 ||
    files.reduce((sum, r) => sum + r.file!.length, data.length) >
      MAX_BACKUP_BYTES
  )
    throw new Error('Backup exceeds the 512 MB limit. Try a data-only backup.');
  records.forEach((r) => validateBook(r.book));
  validatePreferences(preferences);
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    level: 0,
  });
  await writer.add('manifest.json', new Uint8ArrayReader(data));
  for (const { book, file } of files) {
    if (file!.length > 128 * 1024 * 1024 || (await hash(file!)) !== book.id)
      throw new Error(
        'A book file does not match its identity. Reimport that book before backing up.',
      );
    await writer.add(`books/${book.id}.epub`, new Uint8ArrayReader(file!));
  }
  const result = await writer.close();
  if (result.length > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the 512 MB limit. Try a data-only backup.');
  return result;
}
export async function readBackup(bytes: Uint8Array): Promise<Backup> {
  if (bytes.length > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the 512 MB limit.');
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    const names = new Set<string>();
    let total = 0;
    if (entries.length > 5001)
      throw new Error('Too many files in this backup.');
    for (const e of entries) {
      if (
        e.directory ||
        e.encrypted ||
        names.has(e.filename) ||
        !/^(manifest\.json|books\/[a-f0-9]{64}\.epub)$/.test(e.filename)
      )
        throw new Error('Invalid backup archive.');
      names.add(e.filename);
      total += e.uncompressedSize;
      if (
        e.uncompressedSize >
          (e.filename === 'manifest.json' ? MANIFEST_MAX : 128 * 1024 * 1024) ||
        total > MAX_BACKUP_BYTES
      )
        throw new Error('Backup exceeds the size limit.');
    }
    const entry = entries.find((e) => e.filename === 'manifest.json');
    if (!entry || entry.directory || !entry.getData)
      throw new Error('This is not a Quire backup.');
    const manifest = JSON.parse(
      new TextDecoder().decode(await extract(entry, MANIFEST_MAX)),
    );
    if (manifest.format !== 'quire-backup' || manifest.version !== 1)
      throw new Error(
        'Unsupported backup version. Update Quire and try again.',
      );
    if (
      !['full', 'data'].includes(manifest.kind) ||
      !Number.isFinite(manifest.createdAt) ||
      manifest.createdAt < 0 ||
      manifest.createdAt > 8640000000000000 ||
      !Array.isArray(manifest.books) ||
      manifest.books.length > 5000 ||
      !Array.isArray(manifest.files)
    )
      throw new Error('Invalid backup manifest.');
    const books: Book[] = manifest.books.map(validateBook);
    const ids = new Set(books.map((b) => b.id));
    const fileIds = new Set(manifest.files);
    if (
      ids.size !== books.length ||
      fileIds.size !== manifest.files.length ||
      manifest.files.some(
        (id: unknown) => typeof id !== 'string' || !ids.has(id),
      ) ||
      entries.length !== fileIds.size + 1 ||
      (manifest.kind === 'data' && fileIds.size)
    )
      throw new Error('Invalid backup book list.');
    const preferences = validatePreferences(manifest.preferences);
    const records: BackupRecord[] = [];
    for (const book of books) {
      let file: Uint8Array | undefined;
      if (fileIds.has(book.id)) {
        const e = entries.find((e) => e.filename === `books/${book.id}.epub`);
        if (!e || e.directory || !e.getData)
          throw new Error('A book file is missing from this backup.');
        file = await extract(e, e.uncompressedSize);
        if ((await hash(file)) !== book.id)
          throw new Error('A book file is damaged or has the wrong identity.');
      }
      records.push({ book: { ...book, local: !!file }, file });
    }
    return {
      createdAt: manifest.createdAt,
      kind: manifest.kind,
      preferences,
      records,
    };
  } finally {
    await reader.close();
  }
}
