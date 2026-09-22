import type { ReadingActivity } from '../../statistics/model';
/** Only foreground token dwell is credited; configured WPM is never a sample. */
export class RsvpActivity {
  private milliseconds = 0;
  private completed = new Set<number>();
  private pending = new Set<number>();
  private finished = false;
  constructor(
    private bookId: string,
    private volume: number | null,
  ) {}
  add(milliseconds: number) {
    if (Number.isFinite(milliseconds) && milliseconds > 0)
      this.milliseconds += milliseconds;
  }
  complete(chapter: number | null) {
    if (chapter !== null && !this.completed.has(chapter)) {
      this.completed.add(chapter);
      this.pending.add(chapter);
    }
  }
  finish() {
    this.finished = true;
  }
  flush(now = Date.now()): ReadingActivity[] {
    let remaining = Math.round(this.milliseconds);
    const records: ReadingActivity[] = [];
    while (remaining > 0 || this.pending.size || this.finished) {
      const activeMs = Math.min(300000, remaining);
      const endedAt = now - remaining + activeMs;
      records.push({
        id: crypto.randomUUID(),
        bookId: this.bookId,
        startedAt: endedAt - activeMs,
        endedAt,
        activeMs,
        words: 0,
        sampledMs: 0,
        chapters: [...this.pending],
        volume: this.finished ? this.volume : null,
        finished: this.finished,
      });
      remaining -= activeMs;
      this.pending.clear();
      this.finished = false;
    }
    this.milliseconds = 0;
    return records;
  }
}
