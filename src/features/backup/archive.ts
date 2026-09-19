import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  BlobReader,
  BlobWriter,
  type FileEntry,
} from '@zip.js/zip.js';
import type { Book, Preferences } from '../../domain/models';
import { validateActivity, type ReadingActivity } from '../statistics/model';
import { validateBook, validatePreferences } from './validation';
import { validatePrivacy, type SharedPrivacy } from '../privacy/shared';
export interface BackupRecord<File = Uint8Array | Blob> {
  book: Book;
  file?: File;
}
export interface BackupSource {
  book: Book;
  file?: Uint8Array | Blob | (() => Promise<Uint8Array | Blob>);
}
export interface Backup<File = Uint8Array | Blob> {
  createdAt: number;
  kind: 'full' | 'data';
  preferences: Preferences;
  records: BackupRecord<File>[];
  activities?: ReadingActivity[];
  privacy?: SharedPrivacy;
}
// Allow large stored archives while retaining a bounded decompression budget.
const MAX_EXPANSION_BYTES = 512 * 1024 * 1024;
const MANIFEST_MAX = 32 * 1024 * 1024;
const hash = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
const hashFile = (file: Uint8Array | Blob) =>
  file instanceof Uint8Array
    ? hash(file)
    : file.arrayBuffer().then((buffer) => hash(new Uint8Array(buffer)));

async function extractBlob(entry: FileEntry): Promise<Blob> {
  const output = new BlobWriter();
  const sink = output.writable.getWriter();
  let size = 0;
  try {
    await entry.getData!(
      new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.length;
          if (size > entry.uncompressedSize)
            throw new Error('Backup exceeds the size limit.');
          return sink.write(chunk);
        },
        close: () => sink.close(),
        abort: (reason) => sink.abort(reason),
      }),
      { checkSignature: true },
    );
    if (size !== entry.uncompressedSize)
      throw new Error('Invalid backup entry size.');
    return await output.getData();
  } catch (error) {
    await sink.abort(error).catch(() => {});
    throw error;
  }
}
async function extract(entry: FileEntry, limit: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(entry.uncompressedSize);
  let size = 0;
  await entry.getData!(
    new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.length;
        if (size > limit || size > bytes.length)
          throw new Error('Backup exceeds the size limit.');
        bytes.set(chunk, size - chunk.length);
      },
    }),
    { checkSignature: true },
  );
  if (size !== bytes.length) throw new Error('Invalid backup entry size.');
  return bytes;
}
export async function createBackup(
  records: BackupRecord[],
  preferences: Preferences,
  kind: Backup['kind'],
  activities: ReadingActivity[] = [],
  privacy?: SharedPrivacy,
): Promise<Uint8Array> {
  return new Uint8Array(
    await (
      await createBackupBlob(records, preferences, kind, activities, privacy)
    ).arrayBuffer(),
  );
}

export async function createBackupBlob(
  records: BackupSource[],
  preferences: Preferences,
  kind: Backup['kind'],
  activities: ReadingActivity[] = [],
  privacy?: SharedPrivacy,
): Promise<Blob> {
  const files = kind === 'full' ? records.filter((r) => r.file) : [];
  const manifest = {
    format: 'quire-backup',
    version: 1,
    createdAt: Date.now(),
    kind,
    preferences,
    books: records.map((r) => validateBook(r.book)),
    files: files.map((r) => r.book.id),
    activities: validateActivities(activities),
    ...(privacy ? { privacy: validatePrivacy(privacy) } : {}),
  };
  const data = new TextEncoder().encode(JSON.stringify(manifest));
  if (data.length > MANIFEST_MAX || records.length > 5000)
    throw new Error('Backup contains too much library data.');
  records.forEach((r) => validateBook(r.book));
  validatePreferences(preferences);
  const writer = new ZipWriter(new BlobWriter(), {
    useWebWorkers: false,
    level: 0,
  });
  await writer.add('manifest.json', new Uint8ArrayReader(data));
  for (const { book, file: source } of files) {
    const file = typeof source === 'function' ? await source() : source!;
    if ((await hashFile(file)) !== book.id)
      throw new Error(
        'A book file does not match its identity. Reimport that book before backing up.',
      );
    await writer.add(
      `books/${book.id}.${book.format ?? 'epub'}`,
      file instanceof Uint8Array
        ? new Uint8ArrayReader(file)
        : new BlobReader(file),
    );
  }
  return writer.close();
}
export function readBackup(bytes: Uint8Array): Promise<Backup<Uint8Array>>;
export function readBackup(bytes: Blob): Promise<Backup<Blob>>;
export function readBackup(bytes: Uint8Array | Blob): Promise<Backup>;
export async function readBackup(bytes: Uint8Array | Blob): Promise<Backup> {
  const archiveSize = bytes instanceof Uint8Array ? bytes.length : bytes.size;
  const reader = new ZipReader(
    bytes instanceof Uint8Array
      ? new Uint8ArrayReader(bytes)
      : new BlobReader(bytes),
    {
      useWebWorkers: false,
    },
  );
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
        !/^(manifest\.json|books\/[a-f0-9]{64}\.(epub|cbz|fb2|fbz|mobi|azw3))$/.test(
          e.filename,
        )
      )
        throw new Error('Invalid backup archive.');
      names.add(e.filename);
      total += e.uncompressedSize;
      if (
        !Number.isSafeInteger(e.uncompressedSize) ||
        e.uncompressedSize < 0 ||
        (e.filename === 'manifest.json' && e.uncompressedSize > MANIFEST_MAX) ||
        total > archiveSize + MAX_EXPANSION_BYTES
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
      let file: Uint8Array | Blob | undefined;
      if (fileIds.has(book.id)) {
        const e = entries.find(
          (e) => e.filename === `books/${book.id}.${book.format ?? 'epub'}`,
        );
        if (!e || e.directory || !e.getData)
          throw new Error('A book file is missing from this backup.');
        file =
          bytes instanceof Uint8Array
            ? await extract(e, e.uncompressedSize)
            : await extractBlob(e);
        if ((await hashFile(file)) !== book.id)
          throw new Error('A book file is damaged or has the wrong identity.');
      }
      records.push({ book: { ...book, local: !!file }, file });
    }
    return {
      createdAt: manifest.createdAt,
      kind: manifest.kind,
      preferences,
      records,
      activities: validateActivities(manifest.activities ?? []),
      ...(manifest.privacy !== undefined
        ? { privacy: validatePrivacy(manifest.privacy) }
        : {}),
    };
  } finally {
    await reader.close();
  }
}

function validateActivities(value: unknown): ReadingActivity[] {
  if (!Array.isArray(value))
    throw new Error('Invalid backup reading activity.');
  const items = value.map(validateActivity);
  const seen = new Map<string, string>();
  for (const item of items) {
    const encoded = JSON.stringify(item);
    const old = seen.get(item.id);
    if (old !== undefined && old !== encoded)
      throw new Error('Conflicting reading activity identity.');
    seen.set(item.id, encoded);
  }
  return [...new Map(items.map((a) => [a.id, a])).values()];
}
