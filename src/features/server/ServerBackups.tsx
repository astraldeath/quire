import { TaskError } from '../../components/TaskError';
import { useEffect, useRef, useState } from 'react';
import { Download, ArchiveRestore, LoaderCircle, Terminal } from 'lucide-react';
import type { Account } from '../sync/model';
import {
  downloadServerBackup,
  serverBackupStatus,
  type ServerBackupStatus,
} from '../sync/transport';
export function ServerBackups({ account }: { account: Account }) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<ServerBackupStatus | null>();
  const [statusError, setStatusError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    setStatus(undefined);
    setStatusError('');
    setError('');
    setSaved(false);
    void serverBackupStatus(account, abort.signal)
      .then((value) => {
        if (current === generation.current) setStatus(value);
      })
      .catch(() => {
        if (!abort.signal.aborted && current === generation.current)
          setStatusError(
            'Could not check backup size. Retry before downloading.',
          );
      });
    return () => {
      generation.current++;
      abort.abort();
    };
  }, [account.origin, account.username, account.sessionId, attempt]);
  const tooLarge = status?.fitsBrowser === false;
  const limit = status?.browserLimitBytes ?? 512 * 1048576;
  async function download() {
    if (status === undefined || statusError || tooLarge) return;
    const current = generation.current;
    setBusy(true);
    setSaved(false);
    setError('');
    setProgress('Preparing backup…');
    try {
      const blob = await downloadServerBackup(account, (bytes, total) =>
        setProgress(
          `Downloading ${(bytes / 1048576).toFixed(1)} MB${total ? ' of ' + (total / 1048576).toFixed(1) + ' MB' : ''}`,
        ),
      );
      if (generation.current !== current) return;
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `quire-server-${new Date().toISOString().slice(0, 10)}.quire-server-backup`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setSaved(true);
    } catch (e) {
      if (generation.current === current)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not download the backup. Retry or use the server backup command.',
        );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  return (
    <div className="server-backups">
      <h2>Server backups</h2>
      <section className="backup-card">
        <h3>
          <Download /> Download backup
        </h3>
        <p>
          Includes accounts, library access, book files, notes, highlights,
          progress, settings, and watched-folder registrations.
        </p>
        <p className="muted">
          Watched books are included as cached copies. The archive is
          unencrypted and contains everyone’s private reading data. Store it
          securely.
        </p>
        <p className="muted">
          Browser limit: {(limit / 1048576).toFixed(0)} MiB.{' '}
          {tooLarge
            ? 'This backup exceeds the limit. Use the command below.'
            : status === null
              ? 'This server cannot estimate backup size; downloads stop at the limit.'
              : status === undefined
                ? 'Checking backup size…'
                : status.fitsBrowser === null
                  ? 'Final archive size is not yet known; downloads stop at the limit.'
                  : 'The server reports this backup fits the browser limit.'}
        </p>
        {statusError && (
          <TaskError
            summary={statusError}
            detail=""
            onRetry={() => setAttempt((value) => value + 1)}
          />
        )}
        <button
          className="primary"
          disabled={busy || status === undefined || !!statusError || tooLarge}
          onClick={() => void download()}
        >
          {busy ? <LoaderCircle className="spinning" /> : <Download />}
          {busy ? 'Creating backup…' : 'Download server backup'}
        </button>
        {progress && <p role="status">{progress}</p>}
        {saved && (
          <p role="status">
            Download started. Keep the archive somewhere separate from your
            server.
          </p>
        )}
        {error && (
          <TaskError
            summary={error}
            detail=""
            onRetry={() => void download()}
            busy={busy}
          />
        )}
      </section>
      <details className="backup-card">
        <summary>
          <ArchiveRestore /> Restore a server
        </summary>
        <p>
          Restore to a new directory. Current server data is not overwritten.
        </p>
        <ol>
          <li>Copy the archive to the server machine.</li>
          <li>Run the restore command below.</li>
          <li>
            Stop your current server and start it with{' '}
            <code>-data ./restored-data</code>.
          </li>
        </ol>
        <pre>
          <code>
            quire-server restore -input ./server.quire-server-backup -data
            ./restored-data
          </code>
        </pre>
        <p className="muted">
          Everyone signs in again after a restore. Automatic scans stay paused
          until you check the watched-folder paths and enable scanning in
          Settings. Network, TLS, and environment configuration are managed
          separately.
        </p>
      </details>
      <details className="backup-card" open={tooLarge}>
        <summary>
          <Terminal /> Command-line backups
        </summary>
        <p>
          Browser downloads support up to 512 MiB. For larger libraries, stop
          the server and run:
        </p>
        <pre>
          <code>
            quire-server backup -data ./data -output
            ./server.quire-server-backup
          </code>
        </pre>
        <p className="muted">
          Choose a new archive filename; existing backups are never overwritten.
          Restore supports archives with up to 100 GiB of unpacked data.
        </p>
      </details>
    </div>
  );
}
