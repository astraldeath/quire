import type { Position, ReaderPreferences } from '../../domain/models';
export type ComicMode = NonNullable<ReaderPreferences['comicMode']>;
const clampPage = (page: number, count: number) =>
  Math.max(0, Math.min(count - 1, page));
export const comicCFI = (page: number) => `epubcfi(/6/${(page + 1) * 2})`;
export function comicPageAt(
  position: Pick<Position, 'cfi' | 'fraction'> | undefined,
  count: number,
) {
  const step = /^epubcfi\(\/6\/(\d+)(?:[!\[)/])/.exec(position?.cfi ?? '');
  const index =
    step && Number(step[1]) % 2 === 0
      ? Number(step[1]) / 2 - 1
      : Math.round((position?.fraction ?? 0) * (count - 1));
  return clampPage(Number.isFinite(index) ? index : 0, count);
}
export function comicSpread(
  page: number,
  count: number,
  mode: ComicMode,
): number[] {
  if (mode !== 'double' || page === 0) return [clampPage(page, count)];
  const start = page % 2 ? page : page - 1;
  return start + 1 < count ? [start, start + 1] : [start];
}
export function turnComicPage(
  page: number,
  count: number,
  mode: ComicMode,
  direction: 'next' | 'prev',
) {
  const spread = comicSpread(page, count, mode);
  return clampPage(
    direction === 'next' ? spread[spread.length - 1] + 1 : spread[0] - 1,
    count,
  );
}
