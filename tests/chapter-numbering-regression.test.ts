import {
  buildBookStructure,
  currentChapterAt,
  completedChapterAt,
} from '../src/domain/book-structure';
import { expect, it } from 'vitest';
it('keeps valid chapters around an isolated mislabeled summary or chapter', () => {
  const labels = ['099_End', 'Chapter 3 Summary', '100_Next', '101_After'];
  const spine = labels.map((_, i) => `${i}.xhtml`);
  const s = buildBookStructure(
    labels.map((label, i) => ({ label, href: spine[i] })),
    spine,
  );
  expect(s.chapters.map((c) => c.number)).toEqual([99, 100, 101]);
  expect(currentChapterAt(s, { spineIndex: 2 })).toBe(100);
  expect(completedChapterAt(s, { spineIndex: 2 })).toBe(99);
});
it('accepts a damaged separator only with sequential chapter evidence', () => {
  const spine = ['a.xhtml', 'b.xhtml', 'c.xhtml'];
  expect(
    buildBookStructure(
      ['047_Before', '048\uFFFDNext', '049_After'].map((label, i) => ({
        label,
        href: spine[i],
      })),
      spine,
    ).chapters.map((c) => c.number),
  ).toEqual([47, 48, 49]);
});

it('ignores a summary across a gap and a short run of misnumbered entries', () => {
  const labels = [
    '072_Before',
    '073_Next',
    'Chapter 3 Summary',
    '098_Return',
    '099_Next',
    '114_Before',
    '115_Next',
    '121_Misnumbered',
    '122_Misnumbered',
    '118_Return',
    '119_Next',
    '120_End',
  ];
  const spine = labels.map((_, i) => `${i}.xhtml`);
  const structure = buildBookStructure(
    labels.map((label, i) => ({ label, href: spine[i] })),
    spine,
  );
  expect(structure.chapters.map((c) => c.number)).toEqual([
    72, 73, 98, 99, 114, 115, 118, 119, 120,
  ]);
});
