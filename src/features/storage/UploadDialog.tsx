import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloudUpload, LoaderCircle } from 'lucide-react';
import type { Book } from '../../domain/models';
import type { Account } from '../sync/model';
import { loadSync } from '../../storage';
import { files } from '../sync/transport';
import { ServerSettings } from '../sync/ServerSettings';
import { Modal } from '../../components/Modal';
import { uploadBooks, type UploadResult } from './manager';
import { useDraftGuard } from '../../components/useDraftGuard';
import { requestNavigation } from '../navigation/blockers';

export function UploadDialog({
  books: requestedBooks,
  onClose,
  canUpload,
}: {
  books: Book[];
  onClose(): void;
  canUpload(id: string): boolean;
}) {
  // A mounted dialog is one batch: parent rerenders must not retarget it.
  const [books] = useState(() => [...requestedBooks]);
  const permission = useRef(canUpload);
  useLayoutEffect(() => {
    permission.current = canUpload;
  }, [canUpload]);
  const [account, setAccount] = useState<Account>();
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([0, 0]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult>();
  useDraftGuard({ dirty: busy, busy });
  useEffect(() => {
    let live = true;
    if (connecting) return;
    setLoading(true);
    void (async () => {
      try {
        const state = await loadSync();
        if (!live) return;
        if (!state.enabled || !state.account) {
          setConnecting(true);
          return;
        }
        // Bind the entire batch and its retries to the destination presented here.
        setAccount(state.account);
        const remote = await files(state.account);
        if (live)
          setIds(
            books
              .filter((b) => b.local && !remote.some((f) => f.bookId === b.id))
              .map((b) => b.id),
          );
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : 'Could not check server copies.',
          );
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [books, connecting]);
  async function run(pending: string[]) {
    if (!account || busy) return;
    setBusy(true);
    setError('');
    setProgress([0, pending.length]);
    try {
      const next = await uploadBooks(pending, account, {
        manual: true,
        canUpload: (id) => permission.current(id),
        onProgress: (done, total) => setProgress([done, total]),
      });
      setResult((previous) => ({
        ...next,
        uploaded: [...(previous?.uploaded ?? []), ...next.uploaded],
        skipped: [...(previous?.skipped ?? []), ...next.skipped],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload books.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={connecting ? 'Connect server' : 'Upload to server'}
      onClose={() => {
        if (!busy) requestNavigation(onClose);
      }}
    >
      {connecting ? (
        <ServerSettings
          books={books}
          onConnected={() => setConnecting(false)}
        />
      ) : (
        <div className="book-actions">
          {account && (
            <p className="muted">
              {account.username} · {new URL(account.origin).host}
            </p>
          )}
          {loading ? (
            <p role="status">Checking server copies…</p>
          ) : (
            <>
              {busy && (
                <p role="status">
                  <LoaderCircle className="spinning" /> Uploading {progress[0]}{' '}
                  of {progress[1]}…
                </p>
              )}
              {result ? (
                <>
                  <p role="status">
                    {result.uploaded.length} uploaded
                    {result.skipped.length
                      ? ` · ${result.skipped.length} already on server`
                      : ''}
                    {result.failed.length
                      ? ` · ${result.failed.length} failed`
                      : ''}
                  </p>
                  {!!result.failed.length && (
                    <ul>
                      {result.failed.map((failure) => (
                        <li key={failure.id}>
                          {canUpload(failure.id)
                            ? books.find((b) => b.id === failure.id)?.title
                            : 'Private book'}
                          : {failure.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p>
                  {ids.length
                    ? `${ids.length} ${ids.length === 1 ? 'book' : 'books'} to upload`
                    : error
                      ? 'Server copies could not be checked.'
                      : 'These books are already on the server or have no file on this device.'}
                </p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="modal-footer">
                <button disabled={busy} onClick={onClose}>
                  {result ? 'Done' : 'Cancel'}
                </button>
                {(!result || result.failed.length > 0) && (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !account ||
                      !(result ? result.failed.length : ids.length)
                    }
                    onClick={() =>
                      void run(result ? result.failed.map((f) => f.id) : ids)
                    }
                  >
                    <CloudUpload />
                    {result ? 'Retry failed' : `Upload ${ids.length}`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
