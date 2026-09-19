import type { Book } from '../../domain/models';
import {
  bookFolders,
  normalizeFolders,
  migrateBookFolders,
} from '../library/folders';
export type Kind = 'book' | 'position' | 'annotation';
export type Value = Record<string, unknown> | null;
export interface Operation {
  id: string;
  bookId: string;
  kind: Kind;
  recordId: string;
  baseRevision: number;
  deleted: boolean;
  value: Value;
  frozen?: boolean;
  dependsOn?: string;
  blocked?: boolean;
  /** Persist the negotiated payload so a retry keeps the same operation identity. */
  wireValue?: Value;
}
export interface Candidate {
  operationId: string;
  deleted: boolean;
  value: Value;
  createdAt: number;
}
export interface RemoteRecord {
  bookId: string;
  kind: Kind;
  recordId: string;
  revision: number;
  candidates: Candidate[];
}
export interface SyncResponse {
  results: { id: string; revision: number; conflict: boolean }[];
  changes: (RemoteRecord & { cursor: number })[];
  cursor: number;
  hasMore: boolean;
}
export interface Account {
  origin: string;
  username: string;
  sessionId: string;
}
export interface SyncState {
  covers?: string[];
  account?: Account;
  enabled?: boolean;
  cursor: number;
  records: Record<string, RemoteRecord>;
  pending: Operation[];
  lastSync?: number;
  acknowledged?: Record<string, { revision: number; conflict: boolean }>;
}
export const emptySync = (): SyncState => ({
  cursor: 0,
  records: {},
  pending: [],
  acknowledged: {},
});
export const recordKey = (r: {
  bookId: string;
  kind: Kind;
  recordId: string;
}) => `${r.bookId}/${r.kind}/${r.recordId}`;
function values(
  book?: Book,
): Map<string, { kind: Kind; recordId: string; value: Value }> {
  const result = new Map<
    string,
    { kind: Kind; recordId: string; value: Value }
  >();
  if (!book) return result;
  result.set('book/default', {
    kind: 'book',
    recordId: 'default',
    value: {
      title: book.title,
      author: book.author,
      series: book.series,
      volume: book.volume,
      ...(book.format ? { format: book.format } : {}),
      ...(book.folder !== undefined || book.folders !== undefined
        ? { folders: bookFolders(book), folder: bookFolders(book)[0] ?? '' }
        : {}),
    },
  });
  if (book.position) {
    const { cfi, fraction, section, completedChapter } = book.position;
    result.set('position/default', {
      kind: 'position',
      recordId: 'default',
      value: {
        cfi,
        fraction,
        section,
        ...(completedChapter !== undefined ? { completedChapter } : {}),
      },
    });
  }
  for (const { id, kind, cfi, text, note, section } of book.annotations ?? [])
    result.set(`annotation/${id}`, {
      kind: 'annotation',
      recordId: id,
      value: { kind, cfi, text, note, section },
    });
  return result;
}
export function queueValue(
  s: SyncState,
  record: { bookId: string; kind: Kind; recordId: string },
  value: Value,
  resolving = false,
) {
  const key = recordKey(record);
  const previous = [...s.pending].reverse().find((p) => recordKey(p) === key);
  if (previous && !previous.frozen) {
    previous.value = value;
    previous.deleted = value === null;
    return;
  }
  const current = s.records[key],
    ack = s.acknowledged?.[key];
  const revision = Math.max(current?.revision ?? 0, ack?.revision ?? 0);
  const conflict = (current?.candidates.length ?? 0) > 1 || ack?.conflict;
  s.pending.push({
    bookId: record.bookId,
    kind: record.kind,
    recordId: record.recordId,
    id: crypto.randomUUID(),
    baseRevision: conflict && !resolving ? Math.max(0, revision - 1) : revision,
    deleted: value === null,
    value,
    ...(previous ? { dependsOn: previous.id } : {}),
  });
}
export function queueChanges(
  s: SyncState,
  before: Book | undefined,
  after: Book | undefined,
) {
  if (!s.account || (!before && !after)) return;
  const bookId = after?.id ?? before!.id;
  if (!/^[a-f0-9]{64}$/.test(bookId)) return;
  const old = values(before),
    next = values(after);
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(key),
      b = next.get(key);
    if (JSON.stringify(a?.value) === JSON.stringify(b?.value)) continue;
    const r = b ?? a!;
    queueValue(
      s,
      { bookId, kind: r.kind, recordId: r.recordId },
      b?.value ?? null,
    );
  }
}
export function prepareBatch(s: SyncState, multipleFolders = true) {
  const ready = sendableOperations(s).slice(0, 50);
  if (
    !multipleFolders &&
    ready.some(
      (p) =>
        p.kind === 'book' &&
        p.value?.folders !== undefined &&
        ((p.frozen && p.wireValue === undefined) ||
          bookFolders(p.value as { folders: string[] }).length > 1),
    )
  )
    throw new Error(
      'Update Quire Server to sync books in multiple folders. Local changes are saved.',
    );
  for (const p of ready)
    if (new TextEncoder().encode(JSON.stringify(p.value)).length > 32768)
      throw new Error(
        'A saved passage exceeds the server’s 32 KB limit. Shorten it before syncing; the local copy is saved.',
      );
  const operations = ready.map((p) => {
    if (
      !p.frozen &&
      !multipleFolders &&
      p.kind === 'book' &&
      p.value?.folders !== undefined
    ) {
      const { folders: _, ...legacy } = p.value;
      p.wireValue = legacy;
    }
    // Frozen operations created by older clients must also keep their original value.
    p.frozen = true;
    const { frozen: _, dependsOn: __, blocked: ___, wireValue, ...op } = p;
    return { ...op, value: wireValue === undefined ? op.value : wireValue };
  });
  return { cursor: s.cursor, operations };
}
export function sendableOperations(s: SyncState) {
  const blocked = new Set(s.pending.filter((p) => p.blocked).map(recordKey));
  return s.pending.filter((p) => !p.dependsOn && !blocked.has(recordKey(p)));
}

/** Include unsent local edits in the choice; never discard them to make a retry succeed. */
export function conflictsForReview(s: SyncState): RemoteRecord[] {
  const keys = new Set([
    ...Object.values(s.records)
      .filter((r) => r.candidates.length > 1)
      .map(recordKey),
    ...s.pending.filter((p) => p.blocked).map(recordKey),
  ]);
  return [...keys].map((key) => {
    const pending = s.pending.filter((p) => recordKey(p) === key);
    const local = pending.at(-1);
    const remote = s.records[key];
    const record = remote ?? {
      bookId: local!.bookId,
      kind: local!.kind,
      recordId: local!.recordId,
      revision: 0,
      candidates: [],
    };
    return {
      ...record,
      candidates: [
        ...record.candidates,
        ...(local && !record.candidates.some((c) => c.operationId === local.id)
          ? [
              {
                operationId: local.id,
                deleted: local.deleted,
                value: local.value,
                createdAt: 0,
              },
            ]
          : []),
      ],
    };
  });
}

export function resolveConflict(
  s: SyncState,
  record: RemoteRecord,
  candidate: Candidate,
  currentBook?: Book,
) {
  const key = recordKey(record);
  const latest = conflictsForReview(s).find((r) => recordKey(r) === key);
  if (
    JSON.stringify(latest) !== JSON.stringify(record) ||
    !latest?.candidates.some(
      (c) => JSON.stringify(c) === JSON.stringify(candidate),
    )
  )
    throw new Error('This conflict changed. Review the latest choices.');
  if (
    s.pending.some((p) => recordKey(p) === key) &&
    !s.pending.some((p) => recordKey(p) === key && p.blocked)
  )
    throw new Error('Sync pending edits before resolving this conflict.');
  let value = candidate.deleted ? null : candidate.value;
  if (record.kind === 'book' && value && value.folders === undefined) {
    let existing: string[];
    if (currentBook?.id === record.bookId) existing = bookFolders(currentBook);
    else {
      // A fresh device has no book until this conflict is settled. Recover its
      // membership baseline from candidate metadata rather than inventing [].
      const live = record.candidates.filter((c) => !c.deleted && c.value);
      const canonical = live.filter((c) => c.value!.folders !== undefined);
      const baselines = canonical.length
        ? canonical.map((c) => normalizeFolders(c.value!.folders as string[]))
        : value.folder !== undefined
          ? [normalizeFolders(value.folder ? [String(value.folder)] : [])]
          : live
              .filter((c) => c.value!.folder !== undefined)
              .map((c) =>
                normalizeFolders(
                  c.value!.folder ? [String(c.value!.folder)] : [],
                ),
              );
      const distinct = new Set(
        baselines.map((folders) => JSON.stringify(folders)),
      );
      if (distinct.size > 1)
        throw new Error(
          'Folder memberships differ between these versions. Choose a version with folder information.',
        );
      existing = baselines[0] ?? [];
    }
    // Resolution is an explicit, one-time write: replace the chosen legacy
    // primary while preserving secondary memberships from the known baseline.
    const folders =
      value.folder === undefined
        ? existing
        : normalizeFolders([
            ...(value.folder ? [String(value.folder)] : []),
            ...existing.slice(1),
          ]);
    value = { ...value, folders, folder: folders[0] ?? '' };
  }
  // Explicit user choice replaces this record's rejected operation and dependent edits only.
  s.pending = s.pending.filter((p) => recordKey(p) !== key);
  queueValue(s, record, value, true);
}
export function acceptResponse(s: SyncState, response: SyncResponse) {
  for (const result of response.results) {
    const sent = s.pending.find((p) => p.id === result.id);
    if (!sent?.frozen) throw new Error('Unexpected sync acknowledgement.');
    (s.acknowledged ??= {})[recordKey(sent)] = {
      revision: result.revision,
      conflict: result.conflict,
    };
    for (const child of s.pending.filter((p) => p.dependsOn === result.id)) {
      if (!result.conflict) child.baseRevision = result.revision;
      delete child.dependsOn;
    }
    s.pending = s.pending.filter((p) => p.id !== result.id);
  }
  for (const { cursor: _, ...record } of response.changes) {
    const key = recordKey(record);
    if ((s.records[key]?.revision ?? 0) < record.revision)
      s.records[key] = record;
    if (record.revision >= (s.acknowledged?.[key]?.revision ?? Infinity))
      delete s.acknowledged![key];
  }
  s.cursor = response.cursor;
  s.lastSync = Date.now();
}
/** Apply only settled records. Pending local edits and conflicting candidates stay intact. */
export function applyRecords(s: SyncState, books: Book[]): Book[] {
  const map = new Map(books.map((b) => [b.id, structuredClone(b)]));
  const records = Object.values(s.records).sort(
    (a, b) => (a.kind === 'book' ? -1 : 0) - (b.kind === 'book' ? -1 : 0),
  );
  for (const r of records) {
    if (
      r.candidates.length !== 1 ||
      r.revision < (s.acknowledged?.[recordKey(r)]?.revision ?? 0) ||
      s.pending.some((p) => recordKey(p) === recordKey(r))
    )
      continue;
    const c = r.candidates[0];
    let book = map.get(r.bookId);
    if (r.kind === 'book') {
      // A library removal on another device must not erase an existing local EPUB.
      if (c.deleted) continue;
      if (!book) {
        book = {
          id: r.bookId,
          title: 'Untitled',
          author: '',
          series: '',
          volume: null,
          cover: '',
          addedAt: c.createdAt,
          local: false,
        };
        map.set(book.id, book);
      }
      const v = c.value!;
      Object.assign(book, {
        title: v.title,
        author: v.author ?? '',
        series: v.series ?? '',
        volume: v.volume ?? null,
        ...(v.format !== undefined ? { format: v.format } : {}),
        ...(v.folders !== undefined || v.folder !== undefined
          ? (() => {
              const existing = bookFolders(book!);
              // Legacy records cannot describe which memberships changed. Preserve
              // multi-folder organization; in particular, replaying folder: '' must
              // not repeatedly remove whichever folder is currently first.
              const folders =
                v.folders !== undefined
                  ? normalizeFolders(v.folders as string[])
                  : existing.length > 1
                    ? existing
                    : normalizeFolders(v.folder ? [String(v.folder)] : []);
              return { folders, folder: folders[0] ?? '' };
            })()
          : {}),
      });
    } else if (book && r.kind === 'position') {
      if (c.deleted) delete book.position;
      else
        book.position = {
          cfi: String(c.value!.cfi),
          fraction: Number(c.value!.fraction),
          section: String(c.value!.section ?? ''),
          ...(c.value!.completedChapter !== undefined
            ? { completedChapter: Number(c.value!.completedChapter) }
            : {}),
          updatedAt: c.createdAt,
        };
    } else if (book) {
      const existing = book.annotations?.find((a) => a.id === r.recordId);
      book.annotations = (book.annotations ?? []).filter(
        (a) => a.id !== r.recordId,
      );
      if (!c.deleted)
        book.annotations.push({
          text: String(c.value!.text ?? ''),
          note: String(c.value!.note ?? ''),
          section: String(c.value!.section ?? ''),
          cfi: String(c.value!.cfi),
          kind: c.value!.kind as 'bookmark' | 'highlight',
          id: r.recordId,
          createdAt: existing?.createdAt ?? c.createdAt,
          updatedAt: c.createdAt,
        } as NonNullable<Book['annotations']>[number]);
    }
  }
  return [...map.values()].map(migrateBookFolders);
}
