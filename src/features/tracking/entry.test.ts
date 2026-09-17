import { expect, it } from 'vitest';
import { parseEntry, entryPatch, emptyEntry } from './entry';
it('reads MangaBaka progress and calendar dates without timezone shifts', () => {
  expect(
    parseEntry({
      state: 'reading',
      progress_chapter: 14.5,
      progress_volume: 2,
      rating: 85,
      is_private: true,
      start_date: '2025-12-04T00:00:00.000Z',
      finish_date: null,
    }),
  ).toEqual({
    state: 'reading',
    progress_chapter: 14.5,
    progress_volume: 2,
    rating: 85,
    is_private: true,
    start_date: '2025-12-04',
    finish_date: null,
  });
});
it('sends only edited fields, including explicit clears and public visibility', () => {
  const old = { ...emptyEntry(), rating: 85, start_date: '2025-12-04' };
  expect(
    entryPatch(old, {
      ...old,
      rating: null,
      start_date: null,
      is_private: false,
    }),
  ).toEqual({ rating: null, start_date: null, is_private: false });
  expect(entryPatch(old, old)).toEqual({});
});
it('rejects malformed values and invalid calendar dates', () => {
  for (const patch of [
    { state: 'made_up' },
    { rating: 101 },
    { progress_chapter: -1 },
    { is_private: 'false' },
    { start_date: '2025-02-30' },
    { finish_date: '1960-nope' },
  ])
    expect(() => parseEntry({ ...emptyEntry(), ...patch })).toThrow();
});
