import type { Book, Preferences } from './models';
export interface LibraryEntry {
  key: string;
  title: string;
  series: boolean;
  books: Book[];
}
export type ReadingStatus = 'unread' | 'reading' | 'finished';
export interface LibraryFilters {
  status?: 'all' | ReadingStatus;
  availability?: 'all' | 'downloaded' | 'cloud';
}
export function readingStatus(book: Book): ReadingStatus {
  const fraction = book.position?.fraction ?? 0;
  return fraction >= 0.999 ? 'finished' : fraction > 0 ? 'reading' : 'unread';
}
export function readingStatusLabel(book: Book): string {
  const status = readingStatus(book);
  if (status === 'unread') return 'Unread';
  if (status === 'finished') return 'Finished';
  return `${Math.round(book.position!.fraction * 100)}% read`;
}
export function continueBook(books: Book[]): Book | undefined {
  const recent = books
    .filter((b) => readingStatus(b) !== 'unread')
    .sort((a, b) => b.position!.updatedAt - a.position!.updatedAt);
  for (const book of recent) {
    if (readingStatus(book) === 'reading') return book;
    if (!book.series || book.volume === null) continue;
    const next = books
      .filter(
        (b) =>
          b.series === book.series &&
          b.volume !== null &&
          b.volume > book.volume! &&
          readingStatus(b) === 'unread',
      )
      .sort(
        (a, b) => a.volume! - b.volume! || a.title.localeCompare(b.title),
      )[0];
    if (next) return next;
  }
  return undefined;
}
export function restoreImport(imported: Book, existing?: Book): Book {
  return existing
    ? {
        ...existing,
        local: true,
        ...(existing.inLibrary === false ? { inLibrary: true } : {}),
      }
    : imported;
}
export function naturalSortDirection(
  sort: Preferences['sort'],
): 'asc' | 'desc' {
  return ['title', 'author', 'volume'].includes(sort) ? 'asc' : 'desc';
}
export function entriesFor(
  books: Book[],
  preferences: Preferences,
  query: string,
  reading: boolean,
  group: string | null,
  filters: LibraryFilters = {},
): LibraryEntry[] {
  const status = filters.status ?? (reading ? 'reading' : 'all');
  const filtered = books.filter(
    (b) =>
      (status === 'all' || readingStatus(b) === status) &&
      (!group || b.series === group) &&
      (filters.availability === 'downloaded'
        ? b.local
        : filters.availability === 'cloud'
          ? !b.local
          : true) &&
      `${b.title} ${b.author} ${b.series}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const groups = new Map<string, Book[]>();
  for (const b of filtered) {
    const key =
      preferences.groupSeries && !group && b.series
        ? `series:${b.series}`
        : `book:${b.id}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const entries = [...groups.entries()].map(([key, members]) => {
    members.sort(
      (a, b) =>
        (a.volume ?? Infinity) - (b.volume ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
    const series = key.startsWith('series:') && members.length > 1;
    return {
      key,
      series,
      title: series ? members[0].series : members[0].title,
      books: members,
    };
  });
  const sort =
    group && preferences.sort === 'recent' ? 'volume' : preferences.sort;
  const direction = preferences.sortDirection ?? naturalSortDirection(sort);
  const factor = direction === 'asc' ? 1 : -1;
  const compareNumber = (a?: number, b?: number) => {
    const aMissing = a === undefined;
    const bMissing = b === undefined;
    if (aMissing || bMissing)
      return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    return (a - b) * factor;
  };
  const entryDate = (entry: LibraryEntry) => {
    const values = entry.books
      .map((book) =>
        sort === 'added' ? book.addedAt : book.position?.updatedAt,
      )
      .filter((value): value is number => value !== undefined && value > 0);
    return values.length ? Math.max(...values) : undefined;
  };
  return entries.sort((a, b) => {
    const tie = a.title.localeCompare(b.title);
    if (sort === 'volume')
      return (
        compareNumber(
          a.books[0].volume ?? undefined,
          b.books[0].volume ?? undefined,
        ) || tie
      );
    if (sort === 'title') return tie * factor;
    if (sort === 'author')
      return a.books[0].author.localeCompare(b.books[0].author) * factor || tie;
    return compareNumber(entryDate(a), entryDate(b)) || tie;
  });
}
