import type { Book } from '../../domain/models';
import { readingStatus } from '../../domain/library';

export interface ReadingActivity {
  id: string;
  bookId: string;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  words: number;
  sampledMs: number;
  chapters: number[];
  volume: number | null;
  finished: boolean;
  baseline?: boolean;
  chapterThrough?: number;
}
export type StatisticsPeriod = 'all' | 'year' | 'month';
const integer = (v: unknown, max: number, min = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
export function validateActivity(value: unknown): ReadingActivity {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid reading history.');
  const a = value as ReadingActivity;
  if (
    typeof a.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      a.id,
    ) ||
    typeof a.bookId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(a.bookId) ||
    !integer(a.startedAt, 8640000000000000) ||
    !integer(a.endedAt, 8640000000000000) ||
    a.endedAt < a.startedAt ||
    a.endedAt - a.startedAt > 300000 ||
    !integer(a.activeMs, a.endedAt - a.startedAt) ||
    !integer(a.sampledMs, a.activeMs) ||
    !integer(a.words, 100000) ||
    (a.sampledMs === 0 && a.words !== 0) ||
    !Array.isArray(a.chapters) ||
    a.chapters.length > 1000 ||
    !a.chapters.every((n) => integer(n, 100000, 1)) ||
    new Set(a.chapters).size !== a.chapters.length ||
    (a.volume !== null &&
      (typeof a.volume !== 'number' ||
        !Number.isFinite(a.volume) ||
        a.volume <= 0 ||
        a.volume > 100000)) ||
    typeof a.finished !== 'boolean' ||
    (a.baseline !== undefined && typeof a.baseline !== 'boolean') ||
    (a.chapterThrough !== undefined &&
      (!a.baseline || !integer(a.chapterThrough, 100000, 1))) ||
    (a.baseline &&
      (a.startedAt !== a.endedAt ||
        a.activeMs !== 0 ||
        a.words !== 0 ||
        a.sampledMs !== 0))
  )
    throw new Error('Invalid reading history.');
  return {
    id: a.id,
    bookId: a.bookId,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    activeMs: a.activeMs,
    words: a.words,
    sampledMs: a.sampledMs,
    chapters: [...a.chapters].sort((a, b) => a - b),
    volume: a.volume,
    finished: a.finished,
    ...(a.baseline ? { baseline: true } : {}),
    ...(a.chapterThrough !== undefined
      ? { chapterThrough: a.chapterThrough }
      : {}),
  };
}

/** Existing progress contributes only undated completion estimates, never time. */
export function progressBaseline(book: Book): ReadingActivity | null {
  const chapter = book.position?.completedChapter ?? 0;
  const finished = readingStatus(book) === 'finished';
  if (!chapter && !finished) return null;
  return validateActivity({
    id: crypto.randomUUID(),
    bookId: book.id,
    startedAt: 0,
    endedAt: 0,
    activeMs: 0,
    words: 0,
    sampledMs: 0,
    chapters: [],
    volume: book.volume,
    finished,
    baseline: true,
    ...(chapter > 0 ? { chapterThrough: chapter } : {}),
  });
}

export function aggregateStatistics(
  books: Book[],
  records: ReadingActivity[],
  period: StatisticsPeriod = 'all',
  now = Date.now(),
) {
  const date = new Date(now);
  const since =
    period === 'all'
      ? 0
      : new Date(
          date.getFullYear(),
          period === 'year' ? 0 : date.getMonth(),
          1,
        ).getTime();
  const seen = new Set<string>();
  const completed = new Set<string>();
  const chapters = new Map<string, Set<number>>();
  const baselines = new Map<string, number>();
  const timeEdges: { at: number; rate: number; delta: number }[] = [];
  let activeMs = 0,
    words = 0,
    sampledMs = 0;
  for (const a of records) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (
      (a.baseline && period !== 'all') ||
      a.endedAt < since ||
      a.startedAt > now
    )
      continue;
    // Apportion a checkpoint that crosses a period boundary; completions belong to its end.
    const proportion =
      a.endedAt === a.startedAt
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              (Math.min(now, a.endedAt) - Math.max(since, a.startedAt)) /
                (a.endedAt - a.startedAt),
            ),
          );
    if (a.activeMs > 0 && a.endedAt > a.startedAt) {
      const rate = a.activeMs / (a.endedAt - a.startedAt);
      timeEdges.push(
        { at: Math.max(since, a.startedAt), rate, delta: 1 },
        { at: Math.min(now, a.endedAt), rate, delta: -1 },
      );
    }
    words += a.words * proportion;
    sampledMs += a.sampledMs * proportion;
    if (a.endedAt > now) continue;
    if (a.finished && a.volume !== null) completed.add(a.bookId);
    if (a.baseline && a.chapterThrough)
      baselines.set(
        a.bookId,
        Math.max(baselines.get(a.bookId) ?? 0, a.chapterThrough),
      );
    const set = chapters.get(a.bookId) ?? new Set<number>();
    for (const n of a.chapters) set.add(n);
    chapters.set(a.bookId, set);
  }
  let totalChapters = 0;
  for (const [id, set] of chapters) {
    const through = baselines.get(id) ?? 0;
    totalChapters += through + [...set].filter((n) => n > through).length;
    baselines.delete(id);
  }
  for (const through of baselines.values()) totalChapters += through;
  // Concurrent tabs/devices describe overlapping attention, not extra hours.
  const rates = new Map<number, number>();
  let previous = 0;
  for (const edge of timeEdges.sort((a, b) => a.at - b.at)) {
    activeMs += (edge.at - previous) * Math.max(0, ...rates.keys());
    const count = (rates.get(edge.rate) ?? 0) + edge.delta;
    if (count) rates.set(edge.rate, count);
    else rates.delete(edge.rate);
    previous = edge.at;
  }
  const status = { unread: 0, reading: 0, finished: 0 };
  for (const book of books) status[readingStatus(book)]++;
  return {
    books: books.length,
    series: new Set(
      books.map((b) => b.series.trim().toLocaleLowerCase()).filter(Boolean),
    ).size,
    ...status,
    chapters: totalChapters,
    volumes: completed.size,
    activeMs: Math.round(activeMs),
    wordsPerMinute:
      sampledMs >= 60000 && words > 0
        ? Math.round((words * 60000) / sampledMs)
        : null,
  };
}
