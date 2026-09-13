import type { Book, Preferences } from './models';
export interface LibraryEntry { key: string; title: string; series: boolean; books: Book[] }
export function restoreImport(imported: Book, existing?: Book): Book {
  return existing ? { ...existing, local: true } : imported;
}
export function entriesFor(books: Book[], preferences: Preferences, query: string, reading: boolean, group: string | null): LibraryEntry[] {
  const filtered = books.filter(b => (!reading || b.position) && (!group || b.series === group)
    && `${b.title} ${b.author} ${b.series}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const groups = new Map<string, Book[]>();
  for (const b of filtered) {
    const key = preferences.groupSeries && !group && b.series ? `series:${b.series}` : `book:${b.id}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const entries = [...groups.entries()].map(([key, members]) => {
    members.sort((a, b) => (a.volume ?? Infinity) - (b.volume ?? Infinity) || a.title.localeCompare(b.title));
    const series = key.startsWith('series:') && members.length > 1;
    return { key, series, title: series ? members[0].series : members[0].title, books: members };
  });
  return entries.sort((a, b) => {
    if (group) return (a.books[0].volume ?? Infinity) - (b.books[0].volume ?? Infinity) || a.title.localeCompare(b.title);
    if (preferences.sort === 'title') return a.title.localeCompare(b.title);
    if (preferences.sort === 'author') return a.books[0].author.localeCompare(b.books[0].author) || a.title.localeCompare(b.title);
    const recent = (e: LibraryEntry) => Math.max(...e.books.map(b => b.position?.updatedAt ?? b.addedAt));
    return recent(b) - recent(a) || a.title.localeCompare(b.title);
  });
}
