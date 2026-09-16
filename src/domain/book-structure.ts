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
  for (const link of links) {
    const match = link.label
      .trim()
      .match(/^chapter\s+(\d+)(?=$|[\s:.,(\[–—-])/i);
    if (!match) continue;
    const number = Number(match[1]);
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

/** Reports chapters passed in document order, never guesses from a percentage. */
export function completedChapterAt(
  structure: BookStructure,
  location: { spineIndex: number; href?: string; atEnd?: boolean },
): number | null {
  if (!Number.isInteger(location.spineIndex) || location.spineIndex < 0)
    return null;
  const chapters = structure.chapters;
  if (!chapters.length) return null;
  const exact = location.href
    ? chapters.findIndex((c) => c.hrefs.includes(location.href!))
    : -1;
  const current =
    exact >= 0 &&
    chapters[exact].startSpineIndex <= location.spineIndex &&
    chapters[exact].endSpineIndex >= location.spineIndex
      ? exact
      : chapters.findIndex(
          (c) =>
            c.startSpineIndex <= location.spineIndex &&
            c.endSpineIndex >= location.spineIndex,
        );
  if (current < 0) return null;
  if (location.atEnd && location.spineIndex === chapters.at(-1)!.endSpineIndex)
    return chapters.at(-1)!.number;
  return current > 0 ? chapters[current - 1].number : null;
}
