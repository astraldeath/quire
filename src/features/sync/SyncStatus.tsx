import { RefreshCw } from 'lucide-react';
import { TaskError } from '../../components/TaskError';
export function SyncStatus({
  message,
  busy,
  lastSync,
  pending,
  onSync,
  error,
}: {
  message: string;
  busy: boolean;
  lastSync?: number;
  pending: number;
  onSync(): void;
  error?: string;
}) {
  const expired = message.startsWith('Sign in');
  return (
    <section className="sync-status">
      <div className="server-sync-status" role="status">
        <div>
          <strong>
            {pending > 0 && /up to date/i.test(message)
              ? 'Changes waiting to sync'
              : message.replace(/ in Settings → Sync\.?$/, '')}
          </strong>
          <span className="muted">
            {lastSync
              ? `Last synced ${new Date(lastSync).toLocaleString()}`
              : 'Not synced yet'}{' '}
            · {pending} pending changes
          </span>
        </div>
      </div>
      <button disabled={busy} onClick={onSync}>
        <RefreshCw aria-hidden="true" />
        {expired ? 'Sign in again' : busy ? 'Syncing…' : 'Sync now'}
      </button>
      {error && (
        <TaskError summary={error} detail="" onRetry={onSync} busy={busy} />
      )}
    </section>
  );
}
