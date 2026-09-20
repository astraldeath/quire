import type { SyncResponse, Value, Kind } from './model';
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const text = (v: unknown, max = 32768) =>
  typeof v === 'string' && v.length <= max;
export function validateResponse(
  v: unknown,
  cursor: number,
  ids: string[],
): SyncResponse {
  const r = v as SyncResponse;
  const fail = () => {
    throw new Error(
      'The server returned invalid sync data. Local changes are saved.',
    );
  };
  if (
    !r ||
    !Array.isArray(r.results) ||
    !Array.isArray(r.changes) ||
    r.changes.length > 100 ||
    !integer(r.cursor) ||
    r.cursor < cursor ||
    typeof r.hasMore !== 'boolean'
  )
    return fail();
  if (
    r.results.length !== ids.length ||
    new Set(r.results.map((x) => x.id)).size !== ids.length
  )
    return fail();
  for (const a of r.results)
    if (
      !ids.includes(a.id) ||
      !integer(a.revision) ||
      a.revision < 1 ||
      typeof a.conflict !== 'boolean'
    )
      return fail();
  let last = cursor;
  for (const c of r.changes) {
    if (
      !c ||
      !text(c.bookId, 64) ||
      !/^[a-f0-9]{64}$/.test(c.bookId) ||
      !['book', 'position', 'annotation'].includes(c.kind) ||
      !text(c.recordId, 128) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.recordId) ||
      (c.kind !== 'annotation' && c.recordId !== 'default') ||
      !integer(c.revision) ||
      c.revision < 1 ||
      !integer(c.cursor) ||
      c.cursor <= last ||
      !Array.isArray(c.candidates) ||
      !c.candidates.length ||
      c.candidates.length > 16
    )
      return fail();
    last = c.cursor;
    for (const a of c.candidates) {
      if (
        !a ||
        typeof a.deleted !== 'boolean' ||
        !integer(a.createdAt) ||
        !text(a.operationId, 128)
      )
        return fail();
      if (a.deleted) {
        if (a.value !== null) return fail();
      } else if (!validValue(c.kind, a.value)) return fail();
    }
  }
  if (last !== r.cursor || (r.hasMore && r.changes.length === 0)) return fail();
  return r;
}
function validValue(kind: Kind, v: Value) {
  if (
    !v ||
    Array.isArray(v) ||
    new TextEncoder().encode(JSON.stringify(v)).length > 32768
  )
    return false;
  if (kind === 'book')
    return (
      text(v.title, 2048) &&
      !!v.title &&
      (v.author === undefined || text(v.author, 2048)) &&
      (v.series === undefined || text(v.series, 2048)) &&
      (v.folder === undefined || validFolder(v.folder)) &&
      (v.folders === undefined || validFolders(v.folders)) &&
      (v.format === undefined ||
        (typeof v.format === 'string' &&
          [
            'epub',
            'cbz',
            'cbr',
            'cb7',
            'fb2',
            'fbz',
            'mobi',
            'azw3',
            'pdf',
          ].includes(v.format as string))) &&
      (v.volume == null ||
        (typeof v.volume === 'number' && Number.isFinite(v.volume)))
    );
  if (!text(v.cfi, 8192) || (v.section !== undefined && !text(v.section, 2048)))
    return false;
  if (kind === 'position')
    return (
      (v.currentChapter === undefined ||
        (Number.isInteger(v.currentChapter) &&
          Number(v.currentChapter) >= 1 &&
          Number(v.currentChapter) <= 100000)) &&
      (v.completedChapter === undefined ||
        (Number.isInteger(v.completedChapter) &&
          Number(v.completedChapter) >= 0 &&
          Number(v.completedChapter) <= 100000)) &&
      typeof v.fraction === 'number' &&
      v.fraction >= 0 &&
      v.fraction <= 1 &&
      (!!v.cfi || v.fraction === 1)
    );
  return (
    !!v.cfi &&
    ['highlight', 'bookmark'].includes(String(v.kind)) &&
    (v.text === undefined || text(v.text)) &&
    (v.note === undefined || text(v.note))
  );
}
import { validFolder, validFolders } from '../library/folders';
