import { useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { adminConsequence } from './adminActions';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskError } from '../../components/TaskError';
import { accountRequest } from '../sync/transport';
import type { Account } from '../sync/model';
export interface Watch {
  id: string;
  username: string;
  path: string;
}
export interface Scan {
  id: string;
  lastAt: number;
  error: string;
  imported: number;
  existing: number;
  skipped: number;
  skippedFiles?: unknown;
  omittedSkippedFiles?: unknown;
}
function skipReasonLabel(reason: string) {
  switch (reason) {
    case 'unsupported-format':
      return 'Unsupported file format';
    case 'too-large':
      return 'File exceeds the size limit';
    case 'symlink':
      return 'Symbolic link';
    case 'not-regular':
      return 'Not a regular file';
    default:
      return reason;
  }
}
export function WatchRow({
  account,
  watch,
  scan,
  destination,
  onChange,
}: {
  account: Account;
  watch: Watch;
  scan?: Scan;
  destination: string;
  onChange(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef(false);
  const basename =
    watch.path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || watch.path;
  const details = Array.isArray(scan?.skippedFiles)
    ? scan.skippedFiles.filter(
        (v): v is { path: string; reason: string } =>
          v &&
          typeof v === 'object' &&
          typeof v.path === 'string' &&
          typeof v.reason === 'string',
      )
    : undefined;
  const omitted =
    typeof scan?.omittedSkippedFiles === 'number' &&
    Number.isSafeInteger(scan.omittedSkippedFiles) &&
    scan.omittedSkippedFiles > 0
      ? scan.omittedSkippedFiles
      : 0;
  async function run(remove: boolean) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await accountRequest(
        account,
        `/v1/admin/watches/${watch.id}${remove ? '' : '/scan'}`,
        remove ? undefined : {},
        remove ? 'DELETE' : 'POST',
      );
      setConfirm(false);
      await onChange();
      setNotice(remove ? 'Watch stopped.' : 'Scan complete.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="watch-row">
      <div>
        <strong>{basename}</strong>
        <p className="muted">
          {destination} · Watch {watch.id.slice(-8)}
        </p>
        <p>
          {scan
            ? scan.error
              ? 'Scan failed'
              : `${scan.imported} imported · ${scan.existing} existing · ${scan.skipped} skipped`
            : 'Not scanned yet'}
        </p>
        {scan?.lastAt ? (
          <p className="muted">
            Last scan {new Date(scan.lastAt * 1000).toLocaleString()}
          </p>
        ) : null}
        <details>
          <summary>Details</summary>
          <p className="watch-path">{watch.path}</p>
          {scan?.error && <p>{scan.error}</p>}
          {scan && (
            <p>
              {scan.imported} imported · {scan.existing} existing ·{' '}
              {scan.skipped} skipped
            </p>
          )}
          {details ? (
            <>
              <ul>
                {details.map((d, i) => (
                  <li key={i}>
                    <span>{d.path}</span>: {skipReasonLabel(d.reason)}
                  </li>
                ))}
              </ul>
              {omitted > 0 && (
                <p>{omitted} additional skipped files omitted.</p>
              )}
            </>
          ) : (
            scan && <p>This server does not provide skipped-file details.</p>
          )}
        </details>
        {error && (
          <TaskError
            summary="Could not complete this folder action."
            detail={error}
          />
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
      <div className="admin-actions">
        <button disabled={busy} onClick={() => void run(false)}>
          <RefreshCw />
          {busy ? 'Working…' : 'Scan now'}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setError('');
            setConfirm(true);
          }}
        >
          <Trash2 />
          Stop watching
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          {...adminConsequence('stop-watch', basename)}
          description={`${watch.path}. ${adminConsequence('stop-watch', basename).description}${error ? ' ' + error : ''}`}
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void run(true)}
        />
      )}
    </article>
  );
}
