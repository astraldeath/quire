import type { ReadingActivity } from './model';

export interface ReadingPage {
  key: string;
  index: number;
  fraction: number;
  size: number;
  words: number;
  chapter: number | null;
  atEnd: boolean;
  reason?: string;
  forwardIntent?: boolean;
}

const IDLE_MS = 120000;
const MAX_RECORD_MS = 300000;
const MIN_DWELL_MS = 10000;
const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

/** Count only the visible range; segmentation also supports unspaced scripts. */
export function countVisibleWords(text: string): number {
  if (!wordSegmenter) return text.trim().split(/\s+/u).filter(Boolean).length;
  let words = 0;
  for (const segment of wordSegmenter.segment(text))
    if (segment.isWordLike) words++;
  return words;
}

/** A monotonic clock drives elapsed time; wall time is anchored once per opening. */
export class ReadingCollector {
  private last: number;
  private start: number;
  private interaction: number;
  private available = true;
  private page?: ReadingPage;
  private dwell = 0;
  private chapterDwell = 0;
  private unflushedDwell = 0;
  private sampleEligible = true;
  private active = 0;
  private words = 0;
  private sampled = 0;
  private chapters = new Set<number>();
  private completed = new Set<number>();
  private finished = false;
  private finishPending = false;
  private queued: ReadingActivity[] = [];

  constructor(
    private bookId: string,
    private volume: number | null,
    private epoch: number,
    private origin: number,
  ) {
    this.last = this.start = this.interaction = origin;
  }
  private advance(now: number) {
    now = Math.max(this.last, now);
    while (this.last < now) {
      const end = Math.min(now, this.start + MAX_RECORD_MS);
      const active =
        this.available && this.page
          ? Math.max(0, Math.min(end, this.interaction + IDLE_MS) - this.last)
          : 0;
      this.active += active;
      this.dwell += active;
      this.chapterDwell += active;
      this.unflushedDwell += active;
      this.last = end;
      if (this.page?.atEnd && this.dwell >= MIN_DWELL_MS && !this.finished) {
        this.finished = this.finishPending = true;
        this.complete(this.page.chapter);
      }
      if (end - this.start >= MAX_RECORD_MS) this.checkpoint(end);
    }
  }
  private complete(chapter: number | null) {
    if (chapter === null || this.completed.has(chapter)) return;
    this.completed.add(chapter);
    this.chapters.add(chapter);
  }
  interact(now: number) {
    this.advance(now);
    // Resuming after idle cannot make the interrupted page a speed sample.
    if (now - this.interaction > IDLE_MS) {
      this.dwell = this.unflushedDwell = 0;
      this.chapterDwell = 0;
      this.sampleEligible = false;
    }
    this.interaction = now;
  }
  setAvailable(available: boolean, now: number) {
    this.advance(now);
    if (this.available !== available) {
      this.dwell = this.unflushedDwell = 0;
      this.chapterDwell = 0;
      this.sampleEligible = false;
      if (available) this.interaction = now;
    }
    this.available = available;
  }
  relocate(next: ReadingPage, now: number) {
    this.advance(now);
    const previous = this.page;
    if (previous?.key === next.key && previous.size === next.size) {
      if (!['page', 'snap', 'scroll'].includes(next.reason ?? '')) {
        this.dwell = this.unflushedDwell = 0;
        this.sampleEligible = false;
      }
      this.page = next;
      return;
    }
    const sameSection = previous && next.index === previous.index;
    const singlePage =
      previous &&
      previous.size > 0 &&
      next.size > 0 &&
      Math.abs(next.size - previous.size) <
        Math.max(1e-8, previous.size * 0.001) &&
      Math.abs(next.fraction - previous.fraction - previous.size) <
        Math.max(1e-8, previous.size * 0.01);
    const boundary =
      previous &&
      next.index === previous.index + 1 &&
      previous.fraction + previous.size >= 0.99 &&
      next.fraction <= 0.01 &&
      next.forwardIntent;
    const forward =
      previous &&
      this.available &&
      ((sameSection &&
        singlePage &&
        ['page', 'snap'].includes(next.reason ?? '')) ||
        boundary);
    const continuousBoundary =
      previous &&
      previous.size === 0 &&
      next.size === 0 &&
      previous.chapter !== null &&
      next.chapter === previous.chapter + 1 &&
      ((sameSection &&
        next.reason === 'scroll' &&
        next.fraction > previous.fraction) ||
        (next.index === previous.index + 1 && next.forwardIntent));
    if (
      continuousBoundary &&
      this.available &&
      now - this.interaction <= IDLE_MS &&
      this.chapterDwell >= MIN_DWELL_MS
    )
      this.complete(previous.chapter);
    if (
      forward &&
      now - this.interaction <= IDLE_MS &&
      this.dwell >= MIN_DWELL_MS &&
      this.dwell <= IDLE_MS
    ) {
      const wpm = (previous.words * 60000) / this.dwell;
      if (
        this.sampleEligible &&
        previous.words >= 20 &&
        wpm >= 40 &&
        wpm <= 1000 &&
        this.unflushedDwell > 0
      ) {
        // Earlier checkpoints already own part of this page's active time.
        // Sample only the proportional words whose time is still in this record.
        this.words += Math.floor(
          (previous.words * this.unflushedDwell) / this.dwell,
        );
        this.sampled += this.unflushedDwell;
      }
      if (previous.chapter !== next.chapter) this.complete(previous.chapter);
    }
    if (
      previous?.chapter !== next.chapter ||
      (!['scroll', 'page', 'snap'].includes(next.reason ?? '') &&
        !next.forwardIntent)
    )
      this.chapterDwell = 0;
    this.page = next;
    this.dwell = this.unflushedDwell = 0;
    this.sampleEligible = this.available;
  }
  private checkpoint(now: number) {
    if (this.active > 0 || this.chapters.size > 0 || this.finishPending) {
      const startedAt = Math.round(this.epoch + this.start - this.origin);
      const endedAt = Math.round(this.epoch + now - this.origin);
      const activeMs = Math.min(endedAt - startedAt, Math.round(this.active));
      this.queued.push({
        id: crypto.randomUUID(),
        bookId: this.bookId,
        startedAt,
        endedAt,
        activeMs,
        words: this.words,
        sampledMs: Math.min(activeMs, Math.round(this.sampled)),
        chapters: [...this.chapters],
        volume: this.finishPending ? this.volume : null,
        finished: this.finishPending,
      });
    }
    this.start = now;
    this.active = this.words = this.sampled = this.unflushedDwell = 0;
    this.chapters.clear();
    this.finishPending = false;
  }
  flush(now: number): ReadingActivity[] {
    this.advance(now);
    this.checkpoint(Math.max(this.last, now));
    return this.queued.splice(0);
  }
}
