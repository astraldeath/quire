import type { Account } from '../sync/model';
import { assertCurrentAccount } from '../sync/model';
import { loadSync } from '../../storage';
import { ensureBookFile } from '../sync/library';
import { setBooksPinned } from './policy';
export type KeepResult = {
  kept: string[];
  failed: { id: string; message: string }[];
};
export async function keepDownloaded(
  ids: string[],
  expected: Account,
): Promise<KeepResult> {
  const result: KeepResult = { kept: [], failed: [] };
  for (const id of new Set(ids)) {
    try {
      assertCurrentAccount(await loadSync(), expected);
      await ensureBookFile(id, expected);
      assertCurrentAccount(await loadSync(), expected);
      await setBooksPinned([id], expected, true);
      result.kept.push(id);
    } catch (error) {
      result.failed.push({
        id,
        message:
          error instanceof Error
            ? error.message
            : 'Could not download this book. Try again.',
      });
    }
  }
  return result;
}
