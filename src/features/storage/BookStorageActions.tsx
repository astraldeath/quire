import { useEffect, useState } from 'react';
import { CloudUpload, Download, Pin, PinOff } from 'lucide-react';
import type { Book } from '../../domain/models';
import { listBooks, loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { readPolicy, setBooksPinned } from './policy';
import { keepDownloaded } from './keepDownloaded';
import { uploadBooks } from './manager';
import { ActionMenuItem } from '../../components/ActionMenuItem';
import { TaskError } from '../../components/TaskError';

export function BookStorageActions({
  books,
  onClose,
}: {
  books: Book[];
  onClose(): void;
}) {
  const [account, setAccount] = useState<Account>();
  const [pinned, setPinned] = useState(false);
  const [localIds, setLocalIds] = useState(() =>
    books.filter((b) => b.local).map((b) => b.id),
  );
  const [busy, setBusy] = useState<'upload' | 'keep' | null>(null);
  const [error, setError] = useState('');
  const [failedIds, setFailedIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadSync()
      .then((s) => {
        if (!alive || !s.enabled || !s.account) return;
        setAccount(s.account);
        setPinned(
          books.every((b) => readPolicy(s.account!).pinned.includes(b.id)),
        );
        setLocalIds(books.filter((b) => b.local).map((b) => b.id));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [books]);
  if (!account) return null;
  const keep = async (ids: string[]) => {
    setBusy('keep');
    setError('');
    try {
      const result = await keepDownloaded(ids, account);
      setFailedIds(result.failed.map((f) => f.id));
      setPinned(books.every((b) => readPolicy(account).pinned.includes(b.id)));
      setLocalIds((await listBooks()).filter((b) => b.local).map((b) => b.id));
      if (result.failed.length) {
        const count = result.failed.length;
        setError(
          `${count === 1 ? '1 book' : `${count} books`} could not be kept on this device.`,
        );
      } else onClose();
    } catch {
      setFailedIds(ids);
      setError('Could not keep these books on this device.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {books.some((b) => localIds.includes(b.id)) && (
        <ActionMenuItem
          type="button"
          menuId="upload"
          disabled={!!busy}
          onClick={() => {
            setBusy('upload');
            setError('');
            setFailedIds([]);
            void uploadBooks(books.map((b) => b.id))
              .then(onClose)
              .catch(() =>
                setError(
                  'Could not upload these books. Check your server connection and try again.',
                ),
              )
              .finally(() => setBusy(null));
          }}
        >
          <CloudUpload />
          {busy === 'upload' ? 'Uploading…' : 'Upload to server'}
        </ActionMenuItem>
      )}
      <ActionMenuItem
        type="button"
        menuId="pin"
        disabled={!!busy}
        onClick={() => {
          if (!pinned) {
            void keep(books.map((b) => b.id));
            return;
          }
          setBusy('keep');
          setError('');
          setFailedIds([]);
          void setBooksPinned(
            books.map((b) => b.id),
            account,
            false,
          )
            .then(onClose)
            .catch(() =>
              setError(
                'Could not change offloading. Reopen the book actions and try again.',
              ),
            )
            .finally(() => setBusy(null));
        }}
      >
        {pinned ? (
          <PinOff />
        ) : books.some((b) => !localIds.includes(b.id)) ? (
          <Download />
        ) : (
          <Pin />
        )}
        {busy === 'keep'
          ? 'Updating downloads…'
          : pinned
            ? 'Allow automatic offloading'
            : books.some((b) => !localIds.includes(b.id))
              ? 'Download and keep'
              : 'Keep downloaded'}
      </ActionMenuItem>
      {error && (
        <>
          <TaskError summary={error} detail="" />
          {!!failedIds.length && (
            <>
              <p className="muted">
                Successful downloads are kept. Check your server connection or
                reopen the actions if your account changed.
              </p>
              <ActionMenuItem
                type="button"
                menuId="retry-download"
                disabled={!!busy}
                onClick={() => void keep(failedIds)}
              >
                Retry
              </ActionMenuItem>
            </>
          )}
        </>
      )}
    </>
  );
}
