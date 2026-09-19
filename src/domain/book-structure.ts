export interface DetectedChapter {
  number: number;
  label: string;
  hrefs: string[];
  startSpineIndex: number;
  endSpineIndex: number;
}
export interface BookStructure {
  chapters: DetectedChapter[];
}
export interface ChapterLink {
  label: string;
  href: string;
  semantic?: boolean;
}

const small =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' ',
  );
const tens = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');

/** A number at a chapter boundary, not an arbitrary number within prose. */
export function chapterLabel(
  label: string,
): { number: number; explicit: boolean } | null {
  let text = label.normalize('NFKC').trim();
  text = text.replace(
    /^vol(?:ume)?\.?\s+(?:\d+|[IVXLCDM]+)\s*[,.:–—-]?\s+(?=ch(?:apter|ap)?\b)/i,
    '',
  );
  const marker = text.match(/^(?:chapter|chap\.?|ch\.?)\s*[:#]?\s+/i);
  if (marker) text = text.slice(marker[0].length);
  let number: number;
  let consumed: number;
  const digits = text.match(/^\d+/);
  if (digits) {
    number = Number(digits[0]);
    consumed = digits[0].length;
  } else if (marker) {
    const roman = text.match(/^[IVXLCDM]+(?=$|[\s:.,(\[–—-])/i);
    if (roman) {
      const value = roman[0].toUpperCase();
      if (
        !/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(
          value,
        )
      )
        return null;
      const values: Record<string, number> = {
        I: 1,
        V: 5,
        X: 10,
        L: 50,
        C: 100,
        D: 500,
        M: 1000,
      };
      number = [...value].reduce(
        (sum, c, i) =>
          sum +
          (values[c] < (values[value[i + 1]] ?? 0) ? -values[c] : values[c]),
        0,
      );
      consumed = value.length;
    } else {
      const words = new RegExp(
        `^(${[...small, ...tens].join('|')})(?:[ -](${small.slice(1, 10).join('|')}))?(?=$|[\\s:.,(\\[–—-])`,
        'i',
      ).exec(text);
      if (!words) return null;
      const first = words[1].toLowerCase();
      number = small.includes(first)
        ? small.indexOf(first)
        : (tens.indexOf(first) + 2) * 10;
      if (words[2]) {
        if (number < 20) return null;
        number += small.indexOf(words[2].toLowerCase());
      }
      consumed = words[0].length;
    }
  } else return null;
  const rest = text.slice(consumed);
  if (/^\s+(?:hundred|thousand|million|and)\b/i.test(rest)) return null;
  if (rest && !/^[\s:.,(\[–—-]/.test(rest)) return null;
  if (/^\s*[.\-–—/]\s*\d/.test(rest)) return null;
  if (!Number.isSafeInteger(number) || number < 1 || number > 100000)
    return null;
  return { number, explicit: !!marker };
}

/** Only explicit volume markers are evidence; publication years and chapter counts are not. */
export function inferSeriesVolume(
  title: string,
  filename = '',
  metadata: { series?: string; volume?: number | null } = {},
): { series: string; volume: number | null } {
  const explicit = (value: string) => {
    const normalized = value
      .replace(/\.epub$/i, '')
      .replace(/_/g, ' ')
      .trim();
    const match = normalized.match(
      /^(.+?)\s*[,\-–—:]?\s+vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)(?=$|\s*[:(\[]|\s+[^\d\s–—-])/i,
    );
    if (!match || /\b(?:vol(?:ume)?\.?|chapters?)\b/i.test(match[1]))
      return null;
    const series = match[1].replace(/[\s,\-–—:]+$/, '').trim();
    const volume = Number(match[2]);
    return series && Number.isFinite(volume) && volume > 0
      ? { series, volume }
      : null;
  };
  const inferred = explicit(title) ?? explicit(filename);
  return {
    series: metadata.series?.trim() || inferred?.series || '',
    volume:
      metadata.volume != null && Number.isFinite(metadata.volume)
        ? metadata.volume
        : (inferred?.volume ?? null),
  };
}

/** TOC order must agree with spine order and chapter numbers must never restart. */
export function buildBookStructure(
  links: ChapterLink[],
  spine: string[],
): BookStructure {
  const chapters: DetectedChapter[] = [];
  const candidates = links
    .map((link) => ({ link, parsed: chapterLabel(link.label) }))
    .filter((c) => c.parsed && spine.includes(c.link.href.split('#')[0]));
  for (const [index, { link, parsed }] of candidates.entries()) {
    const { number, explicit } = parsed!;
    if (!explicit && !link.semantic) {
      const before = candidates[index - 1]?.parsed?.number;
      const after = candidates[index + 1]?.parsed?.number;
      if (
        (number >= 1900 && number <= 2099) ||
        (before !== number - 1 && after !== number + 1)
      )
        continue;
    }
    const spineIndex = spine.indexOf(link.href.split('#')[0]);
    if (!Number.isSafeInteger(number) || number < 1 || spineIndex < 0) continue;
    const previous = chapters.at(-1);
    if (
      previous &&
      (number < previous.number || spineIndex < previous.endSpineIndex)
    )
      return { chapters: [] };
    if (previous?.number === number) {
      if (!previous.hrefs.includes(link.href)) previous.hrefs.push(link.href);
      previous.endSpineIndex = spineIndex;
    } else {
      chapters.push({
        number,
        label: link.label,
        hrefs: [link.href],
        startSpineIndex: spineIndex,
        endSpineIndex: spineIndex,
      });
    }
  }
  // Untitled continuation documents belong to the preceding chapter until the
  // next numbered chapter. The final chapter is only completed at the book end.
  let lastReadableIndex = spine.length - 1;
  while (lastReadableIndex >= 0 && !spine[lastReadableIndex])
    lastReadableIndex--;
  chapters.forEach((chapter, index) => {
    chapter.endSpineIndex = Math.max(
      chapter.endSpineIndex,
      index + 1 < chapters.length
        ? chapters[index + 1].startSpineIndex - 1
        : lastReadableIndex,
    );
  });
  return { chapters };
}

/** Locate detected anchors using the visible document, independently of its TOC. */
export function chapterHrefAtRange(
  structure: BookStructure,
  spineIndex: number,
  range?: Range,
): string | undefined {
  if (!range) return;
  const doc = range.startContainer.ownerDocument;
  if (!doc) return;
  let result: string | undefined;
  for (const chapter of structure.chapters) {
    if (chapter.startSpineIndex !== spineIndex) continue;
    for (const href of chapter.hrefs) {
      const fragment = href.split('#')[1];
      if (!fragment) continue;
      let id: string;
      try {
        id = decodeURIComponent(fragment);
      } catch {
        continue;
      }
      const anchor = doc.getElementById(id);
      if (!anchor) continue;
      const boundary = doc.createRange();
      boundary.selectNodeContents(anchor);
      boundary.collapse(true);
      if (boundary.compareBoundaryPoints(0, range) <= 0) result = href;
    }
  }
  return result;
}

type ChapterLocation = { spineIndex: number; href?: string; atEnd?: boolean };

function chapterIndexAt(
  structure: BookStructure,
  location: ChapterLocation,
): number {
  if (!Number.isInteger(location.spineIndex) || location.spineIndex < 0)
    return -1;
  const chapters = structure.chapters;
  if (!chapters.length) return -1;
  const exact = location.href
    ? chapters.findIndex((c) => c.hrefs.includes(location.href!))
    : -1;
  return exact >= 0 &&
    chapters[exact].startSpineIndex <= location.spineIndex &&
    chapters[exact].endSpineIndex >= location.spineIndex
    ? exact
    : chapters.findIndex(
        (c) =>
          c.startSpineIndex <= location.spineIndex &&
          c.endSpineIndex >= location.spineIndex,
      );
}

/** The chapter at the saved reading location, independently of completion. */
export function currentChapterAt(
  structure: BookStructure,
  location: ChapterLocation,
): number | null {
  const current = chapterIndexAt(structure, location);
  return current < 0 ? null : structure.chapters[current].number;
}

/** Reports chapters passed in document order, never guesses from a percentage. */
export function completedChapterAt(
  structure: BookStructure,
  location: ChapterLocation,
): number | null {
  const chapters = structure.chapters;
  const current = chapterIndexAt(structure, location);
  if (current < 0) return null;
  if (location.atEnd && location.spineIndex === chapters.at(-1)!.endSpineIndex)
    return chapters.at(-1)!.number;
  return current > 0 ? chapters[current - 1].number : null;
}
