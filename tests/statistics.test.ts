import { describe, expect, it } from 'vitest';
import {
  aggregateStatistics,
  validateActivity,
  progressBaseline,
  type ReadingActivity,
} from '../src/features/statistics/model';
import type { Book } from '../src/domain/models';
const book: Book = {
  id: 'a'.repeat(64),
  title: 'Book',
  author: '',
  series: 'Series',
  volume: 5,
  cover: '',
  addedAt: 0,
  local: true,
};
const activity = (fields: Partial<ReadingActivity> = {}): ReadingActivity => ({
  id: crypto.randomUUID(),
  bookId: book.id,
  startedAt: 1000,
  endedAt: 61000,
  activeMs: 60000,
  sampledMs: 60000,
  words: 240,
  chapters: [1, 2],
  volume: 5,
  finished: true,
  ...fields,
});
describe('reading statistics', () => {
  it('does not include future time or completions from a clock-ahead device', () => {
    const stats = aggregateStatistics([], [activity()], 'all', 31000);
    expect(stats.activeMs).toBe(30000);
    expect(stats.chapters).toBe(0);
    expect(stats.volumes).toBe(0);
  });
  it('deduplicates sessions and completion identities without adding volume numbers', () => {
    const first = activity();
    const stats = aggregateStatistics(
      [book],
      [
        first,
        first,
        activity({ chapters: [2, 3], startedAt: 61000, endedAt: 121000 }),
      ],
    );
    expect(stats.activeMs).toBe(120000);
    expect(stats.chapters).toBe(3);
    expect(stats.volumes).toBe(1);
    expect(stats.wordsPerMinute).toBe(240);
  });
  it('does not count overlapping time from two devices twice', () => {
    const stats = aggregateStatistics(
      [],
      [activity(), activity({ startedAt: 31000, endedAt: 91000 })],
    );
    expect(stats.activeMs).toBe(90000);
  });
  it('keeps history after books are removed and derives current counts separately', () => {
    const stats = aggregateStatistics([], [activity()]);
    expect(stats.books).toBe(0);
    expect(stats.volumes).toBe(1);
    expect(stats.activeMs).toBe(60000);
  });
  it('excludes undated baselines from periods and never invents time', () => {
    const baseline = progressBaseline({
      ...book,
      position: {
        cfi: '',
        fraction: 1,
        section: '',
        completedChapter: 259,
        updatedAt: 100,
      },
    })!;
    const all = aggregateStatistics([book], [baseline]);
    expect(all.chapters).toBe(259);
    expect(all.volumes).toBe(1);
    expect(all.activeMs).toBe(0);
    expect(all.wordsPerMinute).toBeNull();
    expect(aggregateStatistics([book], [baseline], 'month').chapters).toBe(0);
  });
  it('uses dates for measured history but not current library counts', () => {
    const now = new Date(2026, 8, 16).getTime();
    const stats = aggregateStatistics(
      [
        book,
        {
          ...book,
          id: 'b'.repeat(64),
          series: 'series',
          position: { cfi: 'x', fraction: 0.5, section: '', updatedAt: now },
        },
      ],
      [activity()],
      'month',
      now,
    );
    expect(stats.activeMs).toBe(0);
    expect(stats.books).toBe(2);
    expect(stats.series).toBe(1);
    expect(stats.unread).toBe(1);
    expect(stats.reading).toBe(1);
  });
  it('rejects impossible measurements and duplicate chapters', () => {
    expect(() => validateActivity(activity({ activeMs: 60001 }))).toThrow();
    expect(() => validateActivity(activity({ sampledMs: 61000 }))).toThrow();
    expect(() => validateActivity(activity({ chapters: [1, 1] }))).toThrow();
    expect(() => validateActivity(activity({ baseline: true }))).toThrow();
    expect(() => validateActivity(activity({ chapterThrough: 10 }))).toThrow();
    expect(validateActivity(activity()).words).toBe(240);
  });
});
