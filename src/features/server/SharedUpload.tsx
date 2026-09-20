import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { BOOK_ACCEPT } from '../../books';
import { TaskError } from '../../components/TaskError';
import { loadSync } from '../../storage';
import { assertCurrentAccount, type Account } from '../sync/model';
import { uploadSharedFile } from '../sync/transport';

export function SharedUpload({
  account,
  library,
  onComplete,
}: {
  account: Account;
  library: string;
  onComplete: () => void | Promise<void>;
}) {
  const identity = JSON.stringify([
    account.origin,
    account.username,
    account.sessionId,
    library,
  ]);
  const container = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const current = useRef(identity);
  current.current = identity;
  const active = useRef<AbortController | null>(null);
  const remaining = useRef<File[]>([]);
  const [progress, setProgress] = useState<{
    file: File;
    index: number;
    total: number;
  }>();
  const [error, setError] = useState<{ summary: string; detail: string }>();
  const [notice, setNotice] = useState('');
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (
      document.activeElement !== document.body &&
      !container.current?.contains(document.activeElement)
    )
      return;
    const target = progress
      ? container.current?.querySelector<HTMLButtonElement>(
          '.shared-upload-progress button',
        )
      : (container.current?.querySelector<HTMLButtonElement>(
          '.task-error button, [data-upload-retry]',
        ) ?? container.current?.querySelector<HTMLInputElement>('input'));
    target?.focus();
  }, [progress]);
  useEffect(() => {
    current.current = identity;
    setProgress(undefined);
    setError(undefined);
    setNotice('');
    remaining.current = [];
    return () => {
      current.current = '';
      active.current?.abort();
      active.current = null;
    };
  }, [identity]);
  async function run(files: File[]) {
    if (active.current) return;
    restoreFocus.current =
      container.current?.contains(document.activeElement) ?? false;
    const controller = new AbortController();
    active.current = controller;
    const valid = () =>
      current.current === identity && active.current === controller;
    let completed = 0;
    setError(undefined);
    setNotice('');
    remaining.current = files;
    try {
      for (let index = 0; index < files.length; index++) {
        controller.signal.throwIfAborted();
        assertCurrentAccount(await loadSync(), account);
        if (!valid()) return;
        const file = files[index];
        setProgress({ file, index: index + 1, total: files.length });
        await uploadSharedFile(account, library, file, controller.signal);
        controller.signal.throwIfAborted();
        if (!valid()) return;
        assertCurrentAccount(await loadSync(), account);
        completed++;
        remaining.current = files.slice(index + 1);
      }
      if (valid())
        setNotice(
          files.length
            ? `${completed} ${completed === 1 ? 'book' : 'books'} uploaded.`
            : 'Library refreshed.',
        );
    } catch (e) {
      if (!valid()) return;
      if (controller.signal.aborted)
        setNotice('Upload cancelled. Completed books were kept.');
      else
        setError({
          summary: `Could not upload ${remaining.current[0]?.name ?? 'book'}.`,
          detail: e instanceof Error ? e.message : 'Try again.',
        });
    } finally {
      if (valid()) {
        try {
          // A cancelled request may have committed just before the response was lost.
          assertCurrentAccount(await loadSync(), account);
          if (valid()) await onComplete();
        } catch {
          if (valid())
            setError({
              summary: 'Could not refresh the library.',
              detail: 'Could not refresh this library. Try again.',
            });
        }
        if (valid()) {
          restoreFocus.current =
            container.current?.contains(document.activeElement) ?? false;
          active.current = null;
          setProgress(undefined);
        }
      }
    }
  }
  return (
    <div className="shared-upload" ref={container}>
      <label className="admin-upload">
        <span>Upload books</span>
        <input
          type="file"
          multiple
          accept={BOOK_ACCEPT}
          disabled={!!progress}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void run(files);
          }}
        />
      </label>
      {progress && (
        <div role="status" className="shared-upload-progress">
          <p>
            <LoaderCircle size={16} aria-hidden="true" /> Uploading{' '}
            {progress.index} of {progress.total}
          </p>
          <p className="shared-upload-name">
            {progress.file.name} · {progress.file.size.toLocaleString()} bytes
          </p>
          <progress aria-label="Uploading book" />
          <button type="button" onClick={() => active.current?.abort()}>
            Cancel
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <TaskError
          summary={error.summary}
          detail={error.detail}
          busy={!!progress}
          onRetry={() => void run(remaining.current)}
        />
      )}
      {!progress && !error && remaining.current.length > 0 && (
        <button
          type="button"
          data-upload-retry
          onClick={() => void run(remaining.current)}
        >
          Retry remaining files
        </button>
      )}
    </div>
  );
}
