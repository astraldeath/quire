import { useState } from 'react';
import { Download, ArchiveRestore, LoaderCircle, Terminal } from 'lucide-react';
import type { Account } from '../sync/model';
import { downloadServerBackup } from '../sync/transport';
export function ServerBackups({ account }: { account: Account }) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function download() {
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
      setError(e instanceof Error ? e.message : String(e));
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
        <button
          className="primary"
          disabled={busy}
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
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="backup-card">
        <h3>
          <ArchiveRestore /> Restore a server
        </h3>
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
      </section>
      <details className="backup-card">
        <summary>
          <Terminal /> Command-line backups
        </summary>
        <p>
          Browser downloads support up to 512 MB. For larger libraries, stop the
          server and run:
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
