import { describe, expect, it } from 'vitest';
import {
  inferSeriesVolume,
  buildBookStructure,
  completedChapterAt,
} from './book-structure';

describe('explicit book structure', () => {
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
