import { expect, it } from 'vitest';
import {
  progressMode,
  trackingVolume,
} from '../src/features/tracking/progressMode';
import { rankMatches } from '../src/features/tracking/matching';

it('names chapter mode and rejects an invalid volume mapping', () => {
  expect(progressMode(0)).toBe('chapters');
  expect(progressMode(7)).toBe('volumes');
  expect(trackingVolume('chapters', null)).toBe(0);
  expect(trackingVolume('volumes', 5)).toBe(5);
  for (const value of [null, 0, -1, NaN, Infinity])
    expect(() => trackingVolume('volumes', value)).toThrow();
});

it('ranks exact and alternate titles before weak format hints without hiding matches', () => {
  const matches = [
    { id: 1, title: 'Unrelated manhwa', author: '', type: 'manhwa' },
    { id: 2, title: 'The Novel', author: '', type: 'novel' },
    {
      id: 3,
      title: 'Other title',
      alternateTitles: ['The Novel'],
      author: '',
      type: '',
    },
  ];
  expect(rankMatches(matches, 'The Novel', 'cbz').map((m) => m.id)).toEqual([
    2, 3, 1,
  ]);
  expect(matches.map((m) => m.id)).toEqual([1, 2, 3]);
});

it('normalizes punctuation, tolerates missing type and keeps equal scores stable', () => {
  const matches = [
    { id: 1, title: 'A: Novel!', author: '', type: '' },
    { id: 2, title: 'A Novel', author: '', type: '' },
    { id: 3, title: 'Elsewhere', author: '', type: 'novel' },
  ];
  expect(rankMatches(matches, 'a novel', 'epub').map((m) => m.id)).toEqual([
    1, 2, 3,
  ]);
});
