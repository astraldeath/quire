import { describe, expect, it } from 'vitest';
import {
  continueBook,
  entriesFor,
  readingStatus,
  readingStatusLabel,
} from '../src/domain/library';
import { defaults, type Book } from '../src/domain/models';
import { validatePreferences } from '../src/features/backup/validation';
const book = (id: string, props: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: 'Author',
  series: '',
  volume: null,
  cover: '',
  addedAt: 1,
  local: false,
  ...props,
});
const position = (fraction: number, updatedAt = 1) => ({
  fraction,
  updatedAt,
  cfi: '',
  section: '',
});
describe('library controls', () => {
  it('distinguishes unread, active, and finished using the completion threshold', () => {
    expect(readingStatus(book('a'))).toBe('unread');
    expect(readingStatus(book('a', { position: position(0) }))).toBe('unread');
    expect(readingStatus(book('a', { position: position(0.998) }))).toBe(
      'reading',
    );
    expect(readingStatus(book('a', { position: position(0.999) }))).toBe(
      'finished',
    );
    expect(readingStatusLabel(book('a'))).toBe('Unread');
    expect(readingStatusLabel(book('a', { position: position(0.426) }))).toBe(
      '43% read',
    );
    expect(readingStatusLabel(book('a', { position: position(0.999) }))).toBe(
      'Finished',
    );
  });
  it('filters reading by unfinished progress, with explicit status and availability overrides', () => {
    const books = [
      book('unread'),
      book('active', { local: true, position: position(0.5) }),
      book('done', { position: position(1) }),
    ];
    expect(
      entriesFor(books, defaults, '', true, null).map((e) => e.key),
    ).toEqual(['book:active']);
    expect(
      entriesFor(books, defaults, '', true, null, {
        status: 'finished',
        availability: 'cloud',
      }).map((e) => e.key),
    ).toEqual(['book:done']);
    expect(
      entriesFor(books, defaults, '', true, null, {
        status: 'all',
        availability: 'downloaded',
      }).map((e) => e.key),
    ).toEqual(['book:active']);
  });
  it('continues newest unfinished book and advances a recently finished series to its next unread volume', () => {
    const older = book('older', { position: position(0.4, 10) });
    const done = book('done', {
      series: 'S',
      volume: 2,
      position: position(1, 20),
    });
    const previous = book('previous', { series: 'S', volume: 1 });
    const next = book('next', { series: 'S', volume: 3 });
    expect(continueBook([older, done, previous, next])?.id).toBe('next');
    expect(continueBook([older, done, previous])?.id).toBe('older');
    expect(continueBook([done, previous])).toBeUndefined();
    expect(continueBook([next])).toBeUndefined();
  });
  it('sorts last read separately from newly added books', () => {
    const books = [
      book('new', { addedAt: 100 }),
      book('read', { position: position(0.2, 10) }),
      book('old', { addedAt: 2 }),
    ];
    expect(
      entriesFor(
        books,
        { ...defaults, sort: 'last-read' },
        '',
        false,
        null,
      ).map((e) => e.title),
    ).toEqual(['read', 'new', 'old']);
    expect(
      entriesFor(books, { ...defaults, sort: 'added' }, '', false, null).map(
        (e) => e.title,
      ),
    ).toEqual(['new', 'old', 'read']);
  });
  it('allows explicit sorting inside series, retaining default volume order', () => {
    const books = [
      book('Z', { series: 'S', volume: 1 }),
      book('A', { series: 'S', volume: 2 }),
    ];
    expect(
      entriesFor(books, defaults, '', false, 'S').map((e) => e.title),
    ).toEqual(['Z', 'A']);
    expect(
      entriesFor(books, { ...defaults, sort: 'title' }, '', false, 'S').map(
        (e) => e.title,
      ),
    ).toEqual(['A', 'Z']);
    expect(
      entriesFor(books, { ...defaults, sort: 'volume' }, '', false, 'S').map(
        (e) => e.title,
      ),
    ).toEqual(['Z', 'A']);
  });
  it.each([
    ['title', 'asc', ['Alpha', 'Bravo', 'Zulu']],
    ['title', 'desc', ['Zulu', 'Bravo', 'Alpha']],
    ['author', 'asc', ['Bravo', 'Zulu', 'Alpha']],
    ['author', 'desc', ['Alpha', 'Zulu', 'Bravo']],
  ] as const)('sorts %s %s', (sort, sortDirection, expected) => {
    const books = [
      book('Alpha', { author: 'Zulu' }),
      book('Bravo', { author: 'Alpha' }),
      book('Zulu', { author: 'Bravo' }),
    ];
    expect(
      entriesFor(
        books,
        { ...defaults, sort, sortDirection },
        '',
        false,
        null,
      ).map((entry) => entry.title),
    ).toEqual(expected);
  });
  it('sorts volume and dates in either direction while leaving missing values last', () => {
    const books = [
      book('Missing', { volume: null, addedAt: 0 }),
      book('Two', {
        volume: 2,
        addedAt: 20,
        position: position(0.2, 20),
      }),
      book('One', {
        volume: 1,
        addedAt: 10,
        position: position(0.2, 10),
      }),
      book('Absent', { volume: null, addedAt: 0 }),
    ];
    const sorted = (
      sort: 'volume' | 'added' | 'last-read',
      direction: 'asc' | 'desc',
    ) =>
      entriesFor(
        books,
        { ...defaults, sort, sortDirection: direction },
        '',
        false,
        null,
      ).map((entry) => entry.title);
    expect(sorted('volume', 'asc')).toEqual([
      'One',
      'Two',
      'Absent',
      'Missing',
    ]);
    expect(sorted('volume', 'desc')).toEqual([
      'Two',
      'One',
      'Absent',
      'Missing',
    ]);
    expect(sorted('last-read', 'asc')).toEqual([
      'One',
      'Two',
      'Absent',
      'Missing',
    ]);
    expect(sorted('last-read', 'desc')).toEqual([
      'Two',
      'One',
      'Absent',
      'Missing',
    ]);
    expect(sorted('added', 'asc')).toEqual(['One', 'Two', 'Absent', 'Missing']);
    expect(sorted('added', 'desc')).toEqual([
      'Two',
      'One',
      'Absent',
      'Missing',
    ]);
  });
  it('keeps old preference directions natural and validates optional direction', () => {
    expect(
      entriesFor(
        [book('Zulu'), book('Alpha')],
        { ...defaults, sort: 'title' },
        '',
        false,
        null,
      ).map((entry) => entry.title),
    ).toEqual(['Alpha', 'Zulu']);
    expect(validatePreferences(defaults).sortDirection).toBeUndefined();
    expect(
      validatePreferences({ ...defaults, sortDirection: 'desc' }).sortDirection,
    ).toBe('desc');
    expect(() =>
      validatePreferences({ ...defaults, sortDirection: 'sideways' }),
    ).toThrow();
  });
});
