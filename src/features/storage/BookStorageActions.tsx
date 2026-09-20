import { useEffect, useState } from 'react';
import { CloudUpload, Pin, PinOff } from 'lucide-react';
import type { Book } from '../../domain/models';
import { loadSync } from '../../storage';
import type { Account } from '../sync/model';
import { readPolicy, writePolicy } from './policy';
import { uploadBooks } from './manager';
import { ActionMenuItem } from '../../components/ActionMenuItem';

export function BookStorageActions({
  books,
  onClose,
}: {
  books: Book[];
  onClose(): void;
}) {
  const [account, setAccount] = useState<Account>();
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void loadSync()
      .then((s) => {
        if (!alive || !s.enabled || !s.account) return;
        setAccount(s.account);
        setPinned(
          books.every((b) => readPolicy(s.account!).pinned.includes(b.id)),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [books]);
  if (!account) return null;
  return (
    <>
      {books.some((b) => b.local) && (
        <ActionMenuItem
          menuId="upload"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void uploadBooks(books.map((b) => b.id))
              .then(onClose)
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          <CloudUpload />
          {busy ? 'Uploading…' : 'Upload to server'}
        </ActionMenuItem>
      )}
      <ActionMenuItem
        menuId="pin"
        disabled={busy}
        onClick={() => {
          const ids = books.map((b) => b.id),
            old = readPolicy(account).pinned;
          writePolicy(account, {
            pinned: pinned
              ? old.filter((id) => !ids.includes(id))
              : [...new Set([...old, ...ids])],
          });
          onClose();
        }}
      >
        {pinned ? <PinOff /> : <Pin />}
        {pinned ? 'Allow automatic offloading' : 'Keep downloaded'}
      </ActionMenuItem>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
