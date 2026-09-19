import { expect, it } from 'vitest';
import {
  comicPageAt,
  comicSpread,
  turnComicPage,
  comicCFI,
} from '../src/features/reader/comic-navigation';
it('restores existing Foliate comic locators before falling back to progress', () => {
  expect(comicPageAt({ cfi: 'epubcfi(/6/10!/4/2)', fraction: 0 }, 20)).toBe(4);
  expect(comicPageAt({ cfi: 'bad', fraction: 0.5 }, 11)).toBe(5);
  expect(comicPageAt({ cfi: 'epubcfi(/6/9998)', fraction: 0 }, 11)).toBe(10);
  expect(comicCFI(4)).toBe('epubcfi(/6/10)');
});
it('keeps the cover alone and the selected page in its spread', () => {
  expect(comicSpread(0, 6, 'double')).toEqual([0]);
  expect(comicSpread(2, 6, 'double')).toEqual([1, 2]);
  expect(comicSpread(5, 6, 'double')).toEqual([5]);
  expect(comicSpread(2, 6, 'single')).toEqual([2]);
});
it('turns complete spreads without skipping an unpaired final page', () => {
  expect(turnComicPage(0, 6, 'double', 'next')).toBe(1);
  expect(turnComicPage(2, 6, 'double', 'next')).toBe(3);
  expect(turnComicPage(3, 6, 'double', 'prev')).toBe(2);
  expect(turnComicPage(5, 6, 'double', 'next')).toBe(5);
  expect(turnComicPage(0, 6, 'single', 'prev')).toBe(0);
});
