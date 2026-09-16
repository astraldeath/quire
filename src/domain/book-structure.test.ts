import { describe, expect, it } from 'vitest';
import {
  inferSeriesVolume,
  buildBookStructure,
  completedChapterAt,
  chapterHrefAtRange,
} from './book-structure';

describe('explicit book structure', () => {
  it('resolves in-book anchors even when the navigation has no chapter entries', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><section id="one"><h2>Chapter 1</h2></section><section id="two"><h2>Chapter 2</h2><p>Reading here</p></section></body></html>',
      'text/html',
    );
    const range = doc.createRange();
    range.selectNodeContents(doc.querySelector('p')!);
    const structure = buildBookStructure(
      [
        { label: 'Chapter 1', href: 'a.xhtml#one' },
        { label: 'Chapter 2', href: 'a.xhtml#two' },
      ],
      ['a.xhtml'],
    );
    expect(chapterHrefAtRange(structure, 0, range)).toBe('a.xhtml#two');
    expect(
      completedChapterAt(structure, {
        spineIndex: 0,
        href: chapterHrefAtRange(structure, 0, range),
      }),
    ).toBe(1);
  });
  it.each([
    'Ch. 001: Start',
    'Chapter One: Start',
    'Chapter I — Start',
    'Vol. 2 Chapter 01: Start',
    'Ｃｈａｐｔｅｒ ００１ Start',
  ])('recognizes %s', (label) => {
    expect(
      buildBookStructure([{ label, href: 'a.xhtml' }], ['a.xhtml']).chapters[0]
        ?.number,
    ).toBe(1);
  });
  it.each(['001 Start', '01 — Start', '0001: Start', '1. Start'])(
    'requires sequence evidence for %s',
    (label) => {
      expect(
        buildBookStructure([{ label, href: 'a.xhtml' }], ['a.xhtml']).chapters,
      ).toEqual([]);
      expect(
        buildBookStructure(
          [
            { label, href: 'a.xhtml' },
            { label: '002 Next', href: 'b.xhtml' },
          ],
          ['a.xhtml', 'b.xhtml'],
        ).chapters.map((c) => c.number),
      ).toEqual([1, 2]);
    },
  );
  it('rejects decimal chapters, dates, ranges and malformed Roman numbers', () => {
    for (const label of [
      'Chapter 1.5 Bonus',
      'Chapter 1-3',
      'Chapter IIX',
      '2025-01-01',
      '1984 A novel',
    ]) {
      expect(
        buildBookStructure([{ label, href: 'a.xhtml' }], ['a.xhtml']).chapters,
      ).toEqual([]);
    }
  });
  it('understands compound written and Roman chapter numbers', () => {
    const labels = [
      'Chapter Twenty-One',
      'Chapter XXII',
      'Chapter Twenty Three',
    ];
    expect(
      buildBookStructure(
        labels.map((label, i) => ({ label, href: `${i}.xhtml` })),
        ['0.xhtml', '1.xhtml', '2.xhtml'],
      ).chapters.map((c) => c.number),
    ).toEqual([21, 22, 23]);
  });
  it('uses explicit title volumes before filenames and preserves metadata', () => {
    expect(
      inferSeriesVolume(
        'That Time I Got Reincarnated as a Slime, Vol. 5',
        'other Vol. 8.epub',
      ),
    ).toEqual({ series: 'That Time I Got Reincarnated as a Slime', volume: 5 });
    expect(inferSeriesVolume('Title', 'My_Series_Volume_12.epub')).toEqual({
      series: 'My Series',
      volume: 12,
    });
    expect(
      inferSeriesVolume('Other Vol. 5', '', { series: 'Curated', volume: 2 }),
    ).toEqual({ series: 'Curated', volume: 2 });
  });
  it('does not invent volumes from arbitrary numbers, chapter ranges or years', () => {
    for (const title of [
      'Destiny Unchain Online Chapters 1-300',
      '86',
      'Release 2025',
      'Novel 5',
      'Novel Vol. 1-3',
    ]) {
      expect(inferSeriesVolume(title, title + '.epub')).toEqual({
        series: '',
        volume: null,
      });
    }
  });
  it('groups split chapters and excludes prologues and front matter', () => {
    const structure = buildBookStructure(
      [
        { label: 'Prologue 1', href: 'a.xhtml' },
        { label: 'Chapter 1: Start', href: 'b.xhtml' },
        { label: 'Chapter 2 (Part 1)', href: 'c.xhtml' },
        { label: 'Chapter 2 (Part 2)', href: 'd.xhtml' },
        { label: 'Chapter 3', href: 'e.xhtml' },
      ],
      ['a.xhtml', 'b.xhtml', 'c.xhtml', 'd.xhtml', 'e.xhtml'],
    );
    expect(structure.chapters.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(structure.chapters[1].hrefs).toEqual(['c.xhtml', 'd.xhtml']);
    expect(completedChapterAt(structure, { spineIndex: 0 })).toBeNull();
    expect(completedChapterAt(structure, { spineIndex: 3 })).toBe(1);
    expect(completedChapterAt(structure, { spineIndex: 4 })).toBe(2);
    expect(completedChapterAt(structure, { spineIndex: 4, atEnd: true })).toBe(
      3,
    );
  });
  it('requires exact TOC anchors to distinguish chapters sharing one document', () => {
    const structure = buildBookStructure(
      [
        { label: 'Chapter 1', href: 'a.xhtml#one' },
        { label: 'Chapter 2', href: 'a.xhtml#two' },
        { label: 'Chapter 3', href: 'b.xhtml' },
      ],
      ['a.xhtml', 'b.xhtml'],
    );
    expect(completedChapterAt(structure, { spineIndex: 0 })).toBeNull();
    expect(
      completedChapterAt(structure, { spineIndex: 0, href: 'a.xhtml#two' }),
    ).toBe(1);
    expect(completedChapterAt(structure, { spineIndex: 1 })).toBe(2);
  });
  it('declines ambiguous chapter numbering restarted across volumes', () => {
    expect(
      buildBookStructure(
        [
          { label: 'Chapter 1', href: 'a.xhtml' },
          { label: 'Chapter 2', href: 'b.xhtml' },
          { label: 'Chapter 1', href: 'c.xhtml' },
        ],
        ['a.xhtml', 'b.xhtml', 'c.xhtml'],
      ).chapters,
    ).toEqual([]);
  });
});
