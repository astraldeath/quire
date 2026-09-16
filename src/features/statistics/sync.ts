import {
  loadSync,
  readReadingActivitySync,
  commitReadingActivitySync,
} from '../../storage';
import { statsCall } from '../sync/transport';
import { validateActivity } from './model';
import type { Account } from '../sync/model';

const key = (a: Account) => JSON.stringify([a.origin, a.username]);
let running: Promise<void> | undefined;
/** Failed requests leave both the outbox and cursor intact for the next run. */
export function syncReadingActivity(): Promise<void> {
  return (running ??= run().finally(() => {
    running = undefined;
  }));
}
async function run() {
  const initial = await loadSync();
  if (!initial.enabled || !initial.account) return;
  const account = initial.account,
    accountKey = key(account);
  const stillCurrent = async () => {
    const state = await loadSync();
    return (
      state.enabled &&
      state.account &&
      key(state.account) === accountKey &&
      state.account.sessionId === account.sessionId
    );
  };
  for (;;) {
    if (!(await stillCurrent())) return;
    const state = await readReadingActivitySync(accountKey);
    const response = (await statsCall(account, {
      cursor: state.cursor,
      activities: state.pending,
    })) as { cursor?: unknown; activities?: unknown; hasMore?: unknown } | null;
    if (!(await stillCurrent())) return;
    if (
      !response ||
      typeof response.cursor !== 'number' ||
      !Number.isSafeInteger(response.cursor) ||
      response.cursor < state.cursor ||
      typeof response.hasMore !== 'boolean' ||
      !Array.isArray(response.activities) ||
      response.activities.length > 100 ||
      (response.hasMore && response.cursor <= state.cursor)
    )
      throw new Error('Invalid reading statistics response.');
    const activities = response.activities.map(validateActivity);
    await commitReadingActivitySync(activities, {
      account: accountKey,
      cursor: response.cursor,
      acknowledged: state.pending.map((a) => a.id),
    });
    if (
      !response.hasMore &&
      !(await readReadingActivitySync(accountKey)).pending.length
    )
      return;
  }
}
