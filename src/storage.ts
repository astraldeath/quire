import {
  emptyFolderCatalog,
  validateFolderCatalog,
  type FolderCatalogState,
} from './features/library/folderCatalog';
import {
  deleteNativeFile,
  nativeFileId,
  readNativeFile,
  writeNativeFile,
} from './native-files';
import { invoke, isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  defaults,
  type Annotation,
  type Position,
  type Book,
  type Preferences,
} from './domain/models';
import {
  validateActivity,
  type ReadingActivity,
} from './features/statistics/model';
import {
  assertCurrentAccount,
  emptySync,
  queueChanges,
  type Account,
  type SyncState,
} from './features/sync/model';
import { migrateBookFolders } from './features/library/folders';
interface Record {
  id: string;
  metadata: Book;
  file?: Uint8Array | Blob;
}
interface LibraryDB extends DBSchema {
  activity: {
    key: string;
    value: ReadingActivity;
    indexes: { bookId: string };
  };
  activityAck: {
    key: string;
    value: { account: string; id: string };
    indexes: { account: string };
  };
  activityCursor: { key: string; value: number };
  books: { key: string; value: Record };
  preferences: {
    key: string;
    value: Preferences | SyncState | FolderCatalogStorage;
  };
  files: { key: string; value: Uint8Array | Blob };
}
let browserName = 'quire-library';
export const devicePrivacyKey = () => 'quire-privacy:' + browserName;
export function useBrowserAccount(id: string) {
  if (browserPromise)
    throw new Error(
      'Account storage is already open. Reload before changing account.',
    );
  browserName = 'quire-account-' + id;
}
const browser = (): Promise<IDBPDatabase<LibraryDB>> =>
  new Promise((resolve, reject) => {
    let blocked = false;
    const message =
      'Reload your other Quire tabs, then reload this tab to finish the library storage upgrade.';
    const timeout = setTimeout(() => {
      blocked = true;
      reject(new Error(message));
    }, 15000);
    void openDB<LibraryDB>(browserName, 3, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('books', { keyPath: 'id' });
          db.createObjectStore('preferences');
        }
        if (oldVersion < 3) {
          db.createObjectStore('activity', { keyPath: 'id' }).createIndex(
            'bookId',
            'bookId',
          );
          db.createObjectStore('activityAck').createIndex('account', 'account');
          db.createObjectStore('activityCursor');
        }
        if (oldVersion < 2) {
          const files = db.createObjectStore('files');
          let cursor = await tx.objectStore('books').openCursor();
          while (cursor) {
            const record = cursor.value;
            if (record.file !== undefined)
              await files.put(record.file, record.id);
            await cursor.update({
              id: record.id,
              metadata: {
                ...record.metadata,
                local: record.file !== undefined,
              },
            });
            cursor = await cursor.continue();
          }
        }
      },
      blocked() {
        blocked = true;
        clearTimeout(timeout);
        reject(new Error(message));
      },
      blocking() {
        void browserPromise?.then((db) => db.close());
        window.dispatchEvent(new Event('quire-database-upgraded'));
      },
    }).then(
      (db) => {
        clearTimeout(timeout);
        if (blocked) db.close();
        else resolve(db);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
let browserPromise: ReturnType<typeof browser> | undefined;
const idb = () => (browserPromise ??= browser());
let nativePromise: Promise<Database> | undefined;
const sql = () =>
  (nativePromise ??= invoke('prepare_library')
    .catch((error) => {
      nativePromise = undefined;
      throw error;
    })
    .then(() => Database.load('sqlite:quire.db')));
let queue: Promise<unknown> = Promise.resolve();
let activeFileReads = 0;
const retiredFiles = new Set<string>();
async function cleanRetiredFiles() {
  if (activeFileReads !== 0) return;
  for (const reference of retiredFiles) {
    retiredFiles.delete(reference);
    await deleteNativeFile(reference).catch(() => {});
  }
}
export async function flushStorage(): Promise<void> {
  await queue;
}
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
const mergePreferences = (p?: Partial<Preferences>): Preferences => ({
  ...defaults,
  ...p,
  reader: {
    ...defaults.reader,
    ...p?.reader,
    theme:
      (p?.reader?.theme as string) === 'sepia'
        ? 'app'
        : (p?.reader?.theme ?? defaults.reader.theme),
  },
});
export async function listBooks(): Promise<Book[]> {
  if (isTauri()) {
    const rows = await (
      await sql()
    ).select<{ metadata: string; local: number }[]>(
      'SELECT metadata, file IS NOT NULL AS local FROM books',
    );
    return rows.map((r) =>
      migrateBookFolders({
        ...JSON.parse(r.metadata),
        local: Boolean(r.local),
      }),
    );
  }
  return (await (await idb()).getAll('books')).map((r) =>
    migrateBookFolders({
      ...r.metadata,
      local: r.metadata.local,
    }),
  );
}
export async function loadSync(): Promise<SyncState> {
  if (isTauri()) {
    const rows = await (
      await sql()
    ).select<{ value: string }[]>('SELECT value FROM sync_state WHERE id = 1');
    return rows[0] ? JSON.parse(rows[0].value) : emptySync();
  }
  return (
    ((await (await idb()).get('preferences', 'sync')) as
      SyncState | undefined) ?? emptySync()
  );
}
interface FolderCatalogStorage {
  selected: string;
  states: { [key: string]: FolderCatalogState };
}
const folderAccountKey = (account: Account) =>
  JSON.stringify([account.origin, account.username]);
async function readFolderCatalogStorage(): Promise<FolderCatalogStorage> {
  if (isTauri()) {
    const rows = await (
      await sql()
    ).select<{ key: string; value: string }[]>(
      'SELECT key, value FROM folder_catalog_storage',
    );
    const states: FolderCatalogStorage['states'] = {};
    let selected = 'device';
    for (const row of rows) {
      if (row.key === 'selected') selected = row.value;
      else states[row.key] = JSON.parse(row.value);
    }
    return { selected, states };
  }
  return (
    ((await (await idb()).get('preferences', 'folders')) as
      FolderCatalogStorage | undefined) ?? { selected: 'device', states: {} }
  );
}
function selectFolderCatalog(
  sync: SyncState,
  folders: FolderCatalogStorage,
): FolderCatalogState {
  const owner =
    sync.enabled && sync.account ? folderAccountKey(sync.account) : undefined;
  if (owner) {
    if (!folders.states[owner]) {
      // A device-only catalog joins its first account; owned catalogs never cross accounts.
      folders.states[owner] = {
        value:
          folders.selected === 'device'
            ? (folders.states.device?.value ?? emptyFolderCatalog())
            : emptyFolderCatalog(),
        sync: { account: owner, revision: 0, baseline: emptyFolderCatalog() },
      };
      delete folders.states.device;
    }
    folders.selected = owner;
  }
  return (folders.states[folders.selected] ??= { value: emptyFolderCatalog() });
}
/** Select and persist the account's catalog without exposing a previous account's folders. */
export function loadFolderCatalog(): Promise<FolderCatalogState> {
  return serial(async () => {
    const sync = await loadSync(),
      folders = await readFolderCatalogStorage();
    const previous = JSON.stringify(folders);
    const state = selectFolderCatalog(sync, folders);
    if (previous !== JSON.stringify(folders))
      await commit(sync, [], [], [], folders);
    return structuredClone(state);
  });
}
/** Folder membership edits and catalog edits share the same outbox transaction. */
export function editFolderCatalog(
  update: (state: FolderCatalogState) => void,
  memberships?: (books: Book[]) => Book[],
): Promise<void> {
  return serial(async () => {
    const sync = await loadSync(),
      folders = await readFolderCatalogStorage();
    const state = selectFolderCatalog(sync, folders);
    update(state);
    state.value = validateFolderCatalog(state.value);
    const books = memberships ? await listBooks() : [];
    const writes = (memberships?.(books) ?? []).map((book) => ({
      book,
      fileMode: 'keep' as const,
    }));
    for (const w of writes)
      queueChanges(
        sync,
        books.find((b) => b.id === w.book.id),
        w.book,
      );
    await commit(sync, writes, [], [], folders);
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('quire-folders-changed'));
  });
}
/** The captured session is checked inside the serialized transaction before acknowledging a response. */
export function folderCatalogTransaction<T>(
  account: Account,
  update: (state: FolderCatalogState) => T,
): Promise<T | undefined> {
  return serial(async () => {
    const sync = await loadSync();
    if (
      !sync.enabled ||
      !sync.account ||
      folderAccountKey(sync.account) !== folderAccountKey(account) ||
      sync.account.sessionId !== account.sessionId
    )
      return;
    const folders = await readFolderCatalogStorage();
    const before = JSON.stringify(folders);
    const state = selectFolderCatalog(sync, folders);
    const result = update(state);
    state.value = validateFolderCatalog(state.value);
    if (before !== JSON.stringify(folders))
      await commit(sync, [], [], [], folders);
    return result;
  });
}
interface Write {
  book: Book;
  fileMode: 'keep' | 'set' | 'remove';
  file?: Uint8Array | Blob;
}
async function commit(
  sync: SyncState,
  writes: Write[] = [],
  deleted: string[] = [],
  activities: ReadingActivity[] = [],
  folders?: FolderCatalogStorage,
) {
  writes = writes.map((write) => ({
    ...write,
    book: migrateBookFolders(write.book),
  }));
  const history = uniqueActivity(activities);
  if (isTauri()) {
    if (history.length) await activitySQL();
    const db = await sql();
    const retired: string[] = [];
    for (const id of new Set([
      ...deleted,
      ...writes.filter((w) => w.fileMode !== 'keep').map((w) => w.book.id),
    ])) {
      const rows = await db.select<{ file: string | null }[]>(
        'SELECT file FROM books WHERE id = $1',
        [id],
      );
      if (rows[0]?.file && nativeFileId(rows[0].file))
        retired.push(rows[0].file);
    }
    const storedWrites = [];
    for (const w of writes) {
      storedWrites.push({
        ...w,
        file: w.fileMode === 'set' ? await writeNativeFile(w.file!) : undefined,
      });
    }
    // A failed/ambiguous commit may leave a harmless orphan. Never delete a
    // finalized object before knowing that its replacement committed.
    await db.execute('INSERT INTO sync_commits (payload) VALUES ($1)', [
      JSON.stringify({
        sync,
        writes: storedWrites,
        deleted,
        activities: history,
        folders,
      }),
    ]);
    // A reader may have selected the previous reference before this commit.
    // Delay removing retired objects until all in-flight reads finish.
    for (const reference of retired) retiredFiles.add(reference);
    await cleanRetiredFiles();
  } else {
    const tx = (await idb()).transaction(
      ['books', 'files', 'preferences', 'activity'],
      'readwrite',
    );
    try {
      for (const id of deleted) {
        await tx.objectStore('books').delete(id);
        await tx.objectStore('files').delete(id);
      }
      for (const w of writes) {
        const old = await tx.objectStore('books').get(w.book.id);
        if (w.fileMode === 'set')
          await tx.objectStore('files').put(w.file!, w.book.id);
        else if (w.fileMode === 'remove')
          await tx.objectStore('files').delete(w.book.id);
        await tx.objectStore('books').put({
          id: w.book.id,
          metadata: {
            ...w.book,
            local:
              w.fileMode === 'set' ||
              (w.fileMode === 'keep' && !!old?.metadata.local),
          },
        });
      }
      for (const item of history) {
        const old = await tx.objectStore('activity').get(item.id);
        if (
          old &&
          JSON.stringify(canonicalActivity(old)) !== JSON.stringify(item)
        )
          throw new Error('Conflicting reading activity identity.');
        if (!old) await tx.objectStore('activity').put(item);
      }
      await tx.objectStore('preferences').put(sync, 'sync');
      if (folders) await tx.objectStore('preferences').put(folders, 'folders');
      await tx.done;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* transaction already aborted */
      }
      await tx.done.catch(() => {});
      throw e;
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('quire-storage'));
    if (history.length) window.dispatchEvent(new Event('quire-statistics'));
  }
}
/** The library edit and its sync outbox are one SQLite statement/IDB transaction. */
async function edit(
  fn: (books: Book[]) => {
    writes: Write[];
    deleted?: string[];
    activities?: ReadingActivity[];
  },
) {
  return serial(async () => {
    const books = await listBooks(),
      sync = await loadSync();
    const { writes, deleted = [], activities = [] } = fn(books);
    for (const w of writes)
      queueChanges(
        sync,
        books.find((b) => b.id === w.book.id),
        w.book,
      );
    for (const id of deleted)
      queueChanges(
        sync,
        books.find((b) => b.id === id),
        undefined,
      );
    await commit(sync, writes, deleted, activities);
  });
}
export const saveBook = (book: Book) =>
  edit(() => ({ writes: [{ book, fileMode: 'keep' }] }));
export const putBook = (book: Book, bytes: Uint8Array) =>
  edit((books) => ({
    writes: [
      {
        book: (() => {
          const old = books.find((b) => b.id === book.id);
          return old ? { ...old, cover: old.cover || book.cover } : book;
        })(),
        fileMode: 'set',
        file: bytes,
      },
    ],
  }));
export const removeFile = (id: string) =>
  edit((books) => ({
    writes: books
      .filter((b) => b.id === id)
      .map((book) => ({ book, fileMode: 'remove' as const })),
  }));
/** Validate the download owner inside the serialized file commit, retaining current metadata. */
export const putDownloadedFile = (
  id: string,
  bytes: Uint8Array,
  expected: Account,
) =>
  serial(async () => {
    const books = await listBooks(),
      sync = await loadSync();
    assertCurrentAccount(sync, expected);
    const book = books.find((b) => b.id === id);
    if (!book) throw new Error('This book is no longer in your library.');
    await commit(sync, [{ book, fileMode: 'set', file: bytes }]);
  });
/** Check offloading safeguards inside the same serialized edit as file removal. */
export const removeFileWhen = (
  id: string,
  allow: (book: Book, sync: SyncState) => boolean | Promise<boolean>,
) =>
  serial(async () => {
    const sync = await loadSync();
    const book = (await listBooks()).find((b) => b.id === id);
    if (book && (await allow(book, sync)))
      await commit(sync, [{ book, fileMode: 'remove' }]);
  });
export const deleteBooks = (ids: string[]) =>
  edit(() => ({ writes: [], deleted: ids }));
export const restoreBooks = (
  records: { book: Book; file?: Uint8Array | Blob }[],
  activities: ReadingActivity[] = [],
) =>
  edit((books) => ({
    activities,
    writes: records.map(({ book, file }) => ({
      book,
      fileMode:
        file && !books.find((b) => b.id === book.id)?.local ? 'set' : 'keep',
      file,
    })),
  }));
async function saveReadingField(
  id: string,
  field: 'position' | 'annotations',
  value: Position | Annotation[],
) {
  return edit((books) => {
    const book = books.find((b) => b.id === id);
    if (!book) throw new Error('Book is unavailable.');
    return {
      writes: [{ book: { ...book, [field]: value }, fileMode: 'keep' }],
    };
  });
}
export const saveReadingPosition = (id: string, position: Position) =>
  saveReadingField(id, 'position', position);
export const saveBookAnnotations = (id: string, annotations: Annotation[]) =>
  saveReadingField(id, 'annotations', annotations);
export async function getFile(id: string): Promise<Uint8Array | undefined> {
  activeFileReads++;
  try {
    return await readFile(id);
  } finally {
    activeFileReads--;
    await cleanRetiredFiles();
  }
}
export async function getNativeFileReference(
  id: string,
): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const rows = await (
    await sql()
  ).select<{ file: string | null }[]>('SELECT file FROM books WHERE id = $1', [
    id,
  ]);
  const value = rows[0]?.file;
  return value && nativeFileId(value) ? value : undefined;
}
async function readFile(id: string): Promise<Uint8Array | undefined> {
  if (isTauri()) {
    const rows = await (
      await sql()
    ).select<{ file: string | null }[]>(
      'SELECT file FROM books WHERE id = $1',
      [id],
    );
    const value = rows[0]?.file;
    if (value == null) return undefined;
    const fileId = nativeFileId(value);
    return fileId
      ? readNativeFile(fileId)
      : Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  }
  const value = await (await idb()).get('files', id);
  return value instanceof Blob
    ? new Uint8Array(await value.arrayBuffer())
    : value;
}
export async function loadPreferences(): Promise<Preferences> {
  if (isTauri()) {
    const rows = await (
      await sql()
    ).select<{ value: string }[]>('SELECT value FROM preferences WHERE id = 1');
    return mergePreferences(rows[0] ? JSON.parse(rows[0].value) : undefined);
  }
  return mergePreferences(
    (await (await idb()).get('preferences', 'device')) as
      Preferences | undefined,
  );
}
export async function savePreferences(p: Preferences): Promise<void> {
  if (isTauri()) {
    await (
      await sql()
    ).execute(
      'INSERT INTO preferences (id, value) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
      [JSON.stringify(p)],
    );
    return;
  }
  await (await idb()).put('preferences', p, 'device');
}
/** Remote changes, acknowledgements and the pull cursor commit together. */
export function syncTransaction<T>(
  fn: (sync: SyncState, books: Book[]) => { result: T; books?: Book[] },
): Promise<T> {
  return serial(async () => {
    const sync = await loadSync(),
      books = await listBooks();
    const out = fn(sync, books);
    const writes = (out.books ?? [])
      .filter(
        (book) =>
          JSON.stringify(book) !==
          JSON.stringify(books.find((b) => b.id === book.id)),
      )
      .map((book) => ({ book, fileMode: 'keep' as const }));
    const folders = await readFolderCatalogStorage();
    selectFolderCatalog(sync, folders);
    await commit(sync, writes, [], [], folders);
    return out.result;
  });
}

/** Update reading status atomically without overwriting concurrent metadata or annotations. */
export const markBooksRead = (ids: string[], finished: boolean) =>
  edit((books) => ({
    activities: finished
      ? books
          .filter(
            (b) => ids.includes(b.id) && b.volume !== null && b.volume > 0,
          )
          .map((book) => {
            const now = Date.now();
            return {
              id: crypto.randomUUID(),
              bookId: book.id,
              startedAt: now,
              endedAt: now,
              activeMs: 0,
              words: 0,
              sampledMs: 0,
              chapters: [],
              volume: book.volume,
              finished: true,
            };
          })
      : [],
    writes: books
      .filter((b) => ids.includes(b.id))
      .map((book) => {
        const next = { ...book };
        if (finished)
          next.position = {
            cfi: book.position?.cfi ?? '',
            section: book.position?.section ?? '',
            fraction: 1,
            updatedAt: Date.now(),
          };
        else delete next.position;
        return { book: next, fileMode: 'keep' as const };
      }),
  }));

// Statistics are independent of books: removing a book never removes its history.
let activitySchema: Promise<void> | undefined;
async function activitySQL() {
  const db = await sql();
  await (activitySchema ??= (async () => {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS reading_activity (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, payload TEXT NOT NULL)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS reading_activity_book ON reading_activity(book_id)',
    );
    await db.execute(
      'CREATE TABLE IF NOT EXISTS reading_activity_ack (account TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(account,id))',
    );
    await db.execute(
      'CREATE TABLE IF NOT EXISTS reading_activity_cursor (account TEXT PRIMARY KEY, cursor INTEGER NOT NULL)',
    );
    await db.execute(
      'CREATE TABLE IF NOT EXISTS reading_activity_commits (payload TEXT NOT NULL)',
    );
    await db.execute(`CREATE TRIGGER IF NOT EXISTS reading_activity_commit AFTER INSERT ON reading_activity_commits BEGIN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM json_each(NEW.payload, '$.items') j
        JOIN reading_activity a ON a.id = json_extract(j.value, '$.id')
        WHERE a.payload != j.value
      ) THEN RAISE(ABORT, 'Conflicting reading activity identity') END;
      INSERT OR IGNORE INTO reading_activity(id, book_id, payload)
        SELECT json_extract(value, '$.id'), json_extract(value, '$.bookId'), value FROM json_each(NEW.payload, '$.items');
      INSERT OR IGNORE INTO reading_activity_ack(account, id)
        SELECT json_extract(NEW.payload, '$.account'), value FROM json_each(NEW.payload, '$.ack');
      INSERT INTO reading_activity_cursor(account, cursor)
        SELECT json_extract(NEW.payload, '$.account'), json_extract(NEW.payload, '$.cursor')
        WHERE json_extract(NEW.payload, '$.account') IS NOT NULL
        ON CONFLICT(account) DO UPDATE SET cursor = MAX(cursor, excluded.cursor);
      DELETE FROM reading_activity_commits WHERE rowid = NEW.rowid;
    END`);
    await db.execute(`CREATE TRIGGER IF NOT EXISTS reading_activity_book_commit BEFORE INSERT ON sync_commits
      WHEN json_array_length(NEW.payload, '$.activities') > 0 BEGIN
      INSERT INTO reading_activity_commits(payload) VALUES (
        json_object('items', json_extract(NEW.payload, '$.activities'), 'account', NULL, 'cursor', 0, 'ack', json('[]'))
      );
    END`);
  })().catch((error) => {
    activitySchema = undefined;
    throw error;
  }));
  return db;
}
function canonicalActivity(value: ReadingActivity): ReadingActivity {
  const a = validateActivity(value);
  return {
    id: a.id,
    bookId: a.bookId,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    activeMs: a.activeMs,
    words: a.words,
    sampledMs: a.sampledMs,
    chapters: [...a.chapters].sort((x, y) => x - y),
    volume: a.volume,
    finished: a.finished,
    ...(a.baseline ? { baseline: true } : {}),
    ...(a.chapterThrough === undefined
      ? {}
      : { chapterThrough: a.chapterThrough }),
  };
}
function uniqueActivity(items: ReadingActivity[]) {
  const result = new Map<string, ReadingActivity>();
  for (const value of items) {
    const item = canonicalActivity(value),
      old = result.get(item.id);
    if (old && JSON.stringify(old) !== JSON.stringify(item))
      throw new Error('Conflicting reading activity identity.');
    result.set(item.id, item);
  }
  return [...result.values()];
}
export async function listReadingActivity(): Promise<ReadingActivity[]> {
  if (isTauri())
    return (
      await (
        await activitySQL()
      ).select<{ payload: string }[]>('SELECT payload FROM reading_activity')
    ).map((r) => validateActivity(JSON.parse(r.payload)));
  return (await (await idb()).getAll('activity')).map(validateActivity);
}
export async function readReadingActivitySync(
  account: string,
): Promise<{ cursor: number; pending: ReadingActivity[] }> {
  if (isTauri()) {
    const db = await activitySQL();
    const cursors = await db.select<{ cursor: number }[]>(
      'SELECT cursor FROM reading_activity_cursor WHERE account = $1',
      [account],
    );
    const rows = await db.select<{ payload: string }[]>(
      'SELECT a.payload FROM reading_activity a WHERE NOT EXISTS (SELECT 1 FROM reading_activity_ack k WHERE k.account = $1 AND k.id = a.id) LIMIT 100',
      [account],
    );
    return {
      cursor: cursors[0]?.cursor ?? 0,
      pending: rows.map((r) => validateActivity(JSON.parse(r.payload))),
    };
  }
  const tx = (await idb()).transaction([
    'activity',
    'activityAck',
    'activityCursor',
  ]);
  const [items, acknowledged, cursor] = await Promise.all([
    tx.objectStore('activity').getAllKeys(),
    tx.objectStore('activityAck').index('account').getAllKeys(account),
    tx.objectStore('activityCursor').get(account),
  ]);
  const ids = new Set(
    acknowledged.map((a) => (JSON.parse(a) as [string, string])[1]),
  );
  return {
    cursor: cursor ?? 0,
    pending: await Promise.all(
      items
        .filter((id) => !ids.has(id))
        .slice(0, 100)
        .map(async (id) => (await tx.objectStore('activity').get(id))!),
    ),
  };
}
export function commitReadingActivitySync(
  items: ReadingActivity[],
  sync?: { account: string; cursor: number; acknowledged: string[] },
): Promise<void> {
  return serial(async () => {
    const validated = uniqueActivity(items);
    if (isTauri()) {
      await (
        await activitySQL()
      ).execute('INSERT INTO reading_activity_commits(payload) VALUES ($1)', [
        JSON.stringify({
          items: validated,
          account: sync?.account ?? null,
          cursor: sync?.cursor ?? 0,
          ack: sync
            ? [...sync.acknowledged, ...validated.map((a) => a.id)]
            : [],
        }),
      ]);
    } else {
      const tx = (await idb()).transaction(
        ['activity', 'activityAck', 'activityCursor'],
        'readwrite',
      );
      try {
        for (const item of validated) {
          const old = await tx.objectStore('activity').get(item.id);
          if (
            old &&
            JSON.stringify(canonicalActivity(old)) !== JSON.stringify(item)
          )
            throw new Error('Conflicting reading activity identity.');
          if (!old) await tx.objectStore('activity').put(item);
        }
        if (sync) {
          for (const id of new Set([
            ...sync.acknowledged,
            ...validated.map((a) => a.id),
          ]))
            await tx
              .objectStore('activityAck')
              .put(
                { account: sync.account, id },
                JSON.stringify([sync.account, id]),
              );
          const previous =
            (await tx.objectStore('activityCursor').get(sync.account)) ?? 0;
          await tx
            .objectStore('activityCursor')
            .put(Math.max(previous, sync.cursor), sync.account);
        }
        await tx.done;
      } catch (e) {
        try {
          tx.abort();
        } catch {
          /* already aborted */
        }
        await tx.done.catch(() => {});
        throw e;
      }
    }
    if (typeof window !== 'undefined' && validated.length)
      window.dispatchEvent(new Event('quire-statistics'));
  });
}
export const saveReadingActivity = (items: ReadingActivity[]) =>
  commitReadingActivitySync(items);
