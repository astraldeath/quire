import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskError } from '../../components/TaskError';
import { adminConsequence } from './adminActions';
import { Pencil, Trash2 } from 'lucide-react';
import { syncNow } from '../sync/engine';
import { useEffect, useRef, useState } from 'react';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
type Book = {
  id: string;
  title: string;
  author: string;
  series: string;
  volume: number | null;
  uploaded: boolean;
  watched: boolean;
};
export function LibraryBooks({
  account,
  library,
  onChange,
}: {
  account: Account;
  library: string;
  onChange(): Promise<void>;
}) {
  const [query, setQuery] = useState(''),
    [books, setBooks] = useState<Book[]>([]),
    [editing, setEditing] = useState<Book>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string[]>([]),
    [deleting, setDeleting] = useState<Book>();
  const active = useRef(new Set<string>());
  async function refresh() {
    setBooks(
      await accountRequest(account, `/v1/admin/libraries/${library}/books`),
    );
  }
  useEffect(() => {
    const update = () => {
      void refresh().catch((e) => setError(e.message));
    };
    update();
    window.addEventListener('quire-synced', update);
    return () => window.removeEventListener('quire-synced', update);
  }, [library]);
  async function run(id: string, action: () => Promise<unknown>) {
    if (active.current.has(id)) return;
    active.current.add(id);
    setBusy((ids) => [...ids, id]);
    setError('');
    try {
      await action();
      await refresh();
      await onChange();
      await syncNow();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update this book. Try again.',
      );
    } finally {
      active.current.delete(id);
      setBusy((ids) => ids.filter((v) => v !== id));
    }
  }
  return (
    <div>
      {deleting && (
        <ConfirmDialog
          {...adminConsequence('delete-upload', deleting.title || 'Untitled')}
          description={
            adminConsequence('delete-upload', deleting.title || 'Untitled')
              .description + (error ? ' ' + error : '')
          }
          busy={busy.includes(deleting.id)}
          onCancel={() => setDeleting(undefined)}
          onConfirm={() =>
            void run(deleting.id, async () => {
              await accountRequest(
                account,
                `/v1/admin/libraries/${library}/books/${deleting.id}`,
                undefined,
                'DELETE',
              );
              setDeleting(undefined);
            })
          }
        />
      )}
      {error && (
        <TaskError
          summary="Could not update this collection’s books."
          detail={error}
        />
      )}
      {
        <div>
          <label className="admin-search">
            Find a book
            <input
              type="search"
              placeholder="Search title or author"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {books
            .filter((b) =>
              (b.title + ' ' + b.author)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((b) => (
              <div className="admin-book" key={b.id}>
                {editing?.id === b.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(b.id, async () => {
                        const { title, author, series, volume } = editing;
                        await accountRequest(
                          account,
                          `/v1/admin/libraries/${library}/books/${b.id}/metadata`,
                          { title, author, series, volume },
                          'PUT',
                        );
                        setEditing(undefined);
                      });
                    }}
                  >
                    <label>
                      Title
                      <input
                        required
                        maxLength={1000}
                        value={editing.title}
                        onChange={(e) =>
                          setEditing({ ...editing, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Author
                      <input
                        maxLength={500}
                        value={editing.author}
                        onChange={(e) =>
                          setEditing({ ...editing, author: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Series
                      <input
                        maxLength={500}
                        value={editing.series}
                        onChange={(e) =>
                          setEditing({ ...editing, series: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Volume
                      <input
                        type="number"
                        min={0}
                        value={editing.volume ?? ''}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            volume:
                              e.target.value === ''
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <button className="primary" disabled={busy.includes(b.id)}>
                      Save metadata
                    </button>
                    <button type="button" onClick={() => setEditing(undefined)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <strong>{b.title || 'Untitled'}</strong>
                    <p className="muted">
                      {b.author} ·{' '}
                      {b.watched
                        ? b.uploaded
                          ? 'Uploaded and watched'
                          : 'Watched folder'
                        : 'Uploaded'}
                    </p>
                    <div className="admin-actions">
                      <button
                        disabled={busy.includes(b.id)}
                        onClick={() => setEditing(b)}
                      >
                        <Pencil /> Edit metadata
                      </button>
                      {b.uploaded && (
                        <button
                          disabled={busy.includes(b.id)}
                          onClick={() => {
                            setError('');
                            setDeleting(b);
                          }}
                        >
                          <Trash2 /> Delete uploaded file
                        </button>
                      )}
                    </div>
                    {b.watched && (
                      <p className="muted">
                        Watched originals are read-only. Use Watched folders to
                        stop sharing the folder.
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          {books.length > 0 &&
            !books.some((b) =>
              (b.title + ' ' + b.author)
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && <p className="muted">No matching books.</p>}
          {books.length === 0 && (
            <p className="muted">
              No books yet. Upload a book or add a watched folder.
            </p>
          )}
        </div>
      }
    </div>
  );
}
