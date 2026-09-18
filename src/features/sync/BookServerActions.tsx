import { useEffect, useState } from 'react';
import { CloudUpload, Trash2 } from 'lucide-react';
import type { Book } from '../../domain/models';
import { getFile, loadSync } from '../../storage';
import { syncNow } from './engine';
import { files, upload, deleteUpload, type ServerFile } from './transport';
import type { Account } from './model';
export function BookServerActions({ book }: { book: Book }) {
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account>();
  const [remote, setRemote] = useState<ServerFile>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setLoaded(false);
    void loadSync()
      .then(async (s) => {
        if (s.enabled && s.account) {
          setAccount(s.account);
          setRemote((await files(s.account)).find((f) => f.bookId === book.id));
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [book.id]);
  if (!account) return null;
  if (!loaded)
    return (
      <p className="muted" role="status">
        Checking server copy…
      </p>
    );
  if (error && !remote) return <p role="alert">{error}</p>;
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      setRemote((await files(account)).find((f) => f.bookId === book.id));
      window.dispatchEvent(new Event('quire-synced'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="book-server-actions">
      <h3>Server copy</h3>
      <p className="muted">
        {remote?.watched
          ? 'Available from a read-only watched folder'
          : remote?.uploaded
            ? 'Uploaded to your server'
            : 'No book file on your server'}
      </p>
      <div className="server-actions">
        {book.local && !remote && (
          <button
            type="button"
            className="text-action"
            disabled={!!busy}
            onClick={() =>
              void run('Uploading', async () => {
                const bytes = await getFile(book.id);
                if (!bytes) throw new Error('Local book file is unavailable.');
                await syncNow();
                await upload(account, book.id, bytes);
              })
            }
          >
            <CloudUpload />
            Upload book file
          </button>
        )}
        {remote?.uploaded && !confirm && (
          <button
            type="button"
            className="text-action danger"
            disabled={!!busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 />
            Remove server upload
          </button>
        )}
      </div>
      {confirm && (
        <div className="removal">
          <p>
            Remove the uploaded book file from your server? Existing downloads,
            notes, and reading progress stay saved.
            {remote?.watched
              ? ' The watched-folder copy will remain available.'
              : ''}
          </p>
          <div className="button-row">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setConfirm(false)}
            >
              Keep upload
            </button>
            <button
              type="button"
              className="danger"
              disabled={!!busy}
              onClick={() =>
                void run('Removing upload', async () => {
                  await deleteUpload(account, book.id);
                  setConfirm(false);
                })
              }
            >
              Remove upload
            </button>
          </div>
        </div>
      )}
      {busy && <p role="status">{busy}…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
