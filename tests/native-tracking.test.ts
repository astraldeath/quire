import { describe, expect, it } from 'vitest';
import {
  applySeries,
  progressPatch,
  searchPath,
  type TrackingLink,
} from '../src/features/tracking/local-model';
import type { Book } from '../src/domain/models';

const book = (id: string, volume: number | null): Book => ({
  id,
  volume,
  series: 'Series',
  title: id,
  author: '',
  cover: '',
  addedAt: 1,
  local: true,
});
const link: TrackingLink = {
  bookId: 'one',
  seriesId: 12,
  seriesKey: '',
  title: 'Match',
  volume: 1,
  auto: true,
  completeEntry: true,
  lastStep: 0,
  lastSync: 0,
  error: '',
  nextAttempt: 0,
};
describe('standalone tracker policy', () => {
  it('advances numbered chapters independently of reading status without lowering progress', () => {
    const chapterLink = { ...link, volume: 0 };
    const remote = {
      state: 'reading',
      progress_volume: 0,
      progress_chapter: 3,
    };
    expect(progressPatch(chapterLink, 1, remote, 4)).toEqual({
      progress_chapter: 4,
    });
    expect(progressPatch(chapterLink, 1, remote, 2)).toEqual({});
    expect(progressPatch(link, 1, remote, 4)).toEqual({});
    for (const invalid of [-1, 1.5, Infinity, 10001])
      expect(progressPatch(chapterLink, 1, remote, invalid)).toEqual({});
  });
  it('starts reading, advances a finished volume, and never lowers remote progress', () => {
    expect(
      progressPatch(link, 1, { state: 'plan_to_read', progress_volume: 0 }),
    ).toEqual({ state: 'reading' });
    expect(
      progressPatch({ ...link, completeEntry: false }, 2, {
        state: 'reading',
        progress_volume: 4,
      }),
    ).toEqual({});
    expect(
      progressPatch(link, 2, { state: 'reading', progress_volume: 0 }),
    ).toEqual({ state: 'completed', progress_volume: 1 });
  });
  it('does not resume paused or dropped entries', () => {
    for (const state of ['paused', 'dropped'])
      expect(progressPatch(link, 1, { state, progress_volume: 0 })).toEqual({});
  });
  it('applies series matches while keeping individual overrides and unknown volumes', () => {
    const links = applySeries(
      [link],
      [book('one', 1), book('two', 2), book('unknown', null)],
      { seriesKey: 'Series', seriesId: 24, title: 'Series match', auto: true },
    );
    expect(links[0]).toEqual(link);
    expect(links.find((l) => l.bookId === 'two')).toMatchObject({
      seriesId: 24,
      volume: 2,
      completeEntry: false,
    });
    expect(links.find((l) => l.bookId === 'unknown')?.volume).toBe(0);
  });
  it('accepts search terms and provider links without accepting arbitrary URLs', () => {
    expect(searchPath('Slime novel')).toBe('/v1/series/search?q=Slime%20novel');
    expect(searchPath('https://mangabaka.org/123')).toBe('/v1/series/123');
    for (const value of [
      '',
      'https://evil.example/123',
      'https://mangabaka.org@evil.example/123',
    ])
      expect(() => searchPath(value)).toThrow();
  });
});
