import type { Book } from '../../domain/models';
import { listReadingActivity, saveReadingActivity } from '../../storage';
import { progressBaseline, type ReadingActivity } from './model';

/** Snapshot older progress once; dated activity is recorded by the reader. */
export async function preserveExistingProgress(books: Book[]) {
  const known = new Set((await listReadingActivity()).map((a) => a.bookId));
  const baselines: ReadingActivity[] = [];
  for (const book of books) {
    if (known.has(book.id)) continue;
    const baseline = progressBaseline(book);
    if (baseline) baselines.push(baseline);
  }
  if (baselines.length) await saveReadingActivity(baselines);
}
