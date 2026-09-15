import { describe, expect, it } from 'vitest';
import { entriesFor, restoreImport } from './library';
import { defaults, type Book } from './models';
const book = (id: string, series = '', volume: number | null = null): Book => ({
  id,
  title: id,
  author: 'Author',
  series,
  volume,
  cover: '',
  addedAt: 1,
  local: true,
});
describe('library organization', () => {
  it('orders volumes numerically, leaving unknown volumes last', () => {
    const entries = entriesFor(
      [
        book('ten', 'Series', 10),
        book('unknown', 'Series'),
        book('two', 'Series', 2),
      ],
      defaults,
      '',
      false,
      null,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].books.map((b) => b.id)).toEqual([
      'two',
      'ten',
      'unknown',
    ]);
  });
  it('finds a matching volume even inside a group and supports ungrouped views', () => {
    const books = [book('one', 'Series', 1), book('two', 'Series', 2)];
    expect(
      entriesFor(books, defaults, 'two', false, null)[0].books.map((b) => b.id),
    ).toEqual(['two']);
    expect(
      entriesFor(books, { ...defaults, groupSeries: false }, '', false, null),
    ).toHaveLength(2);
  });
  it('keeps unavailable reading records in Reading', () => {
    const b = {
      ...book('read'),
      local: false,
      position: { cfi: 'saved', fraction: 0.3, section: 'One', updatedAt: 2 },
    };
    expect(
      entriesFor([b, book('new')], defaults, '', true, null).map(
        (e) => e.books[0].id,
      ),
    ).toEqual(['read']);
  });
  it('reimport restores bytes availability but preserves manual metadata and position', () => {
    const existing = {
      ...book('same', 'My series', 3),
      local: false,
      title: 'My title',
      position: { cfi: 'saved', fraction: 0.4, section: 'Two', updatedAt: 10 },
    };
    expect(
      restoreImport(book('same', 'Publisher series', 1), existing),
    ).toEqual({ ...existing, local: true });
  });
});
