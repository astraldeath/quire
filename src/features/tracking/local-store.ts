import Database from '@tauri-apps/plugin-sql';
import type { LocalTracking } from './local-model';

// Separate from reader backup data: restoring books never reconnects a tracker.
let connection: Promise<Database> | undefined;
async function db() {
  return (connection ??= Database.load('sqlite:tracking.db').then(
    async (database) => {
      await database.execute(
        'CREATE TABLE IF NOT EXISTS tracking_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)',
      );
      return database;
    },
  ));
}
export async function readTracking(): Promise<LocalTracking> {
  const rows = await (
    await db()
  ).select<{ value: string }[]>('SELECT value FROM tracking_state WHERE id=1');
  return rows[0] ? JSON.parse(rows[0].value) : { accountId: '', links: [] };
}
export async function writeTracking(state: LocalTracking) {
  await (
    await db()
  ).execute(
    'INSERT INTO tracking_state(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
    [JSON.stringify(state)],
  );
  window.dispatchEvent(new Event('quire-tracking'));
}
