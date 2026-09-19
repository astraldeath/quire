import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import type { Book } from '../../domain/models';
import { loadSync } from '../../storage';
import { files } from '../sync/transport';
import { subscribe } from '../sync/engine';

// One inventory request for the library, never one per book card.
export function useServerFiles() {
  const [remote, setRemote] = useState<ReadonlySet<string>>();
  useEffect(() => {
    let live = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const request = ++revision;
      try {
        const state = await loadSync();
        if (!live || request !== revision) return;
        if (!state.enabled || !state.account) {
          setRemote(undefined);
          return;
        }
        const account = state.account;
        const inventory = await files(account);
        const current = await loadSync();
        if (!live || request !== revision) return;
        if (
          !current.enabled ||
          current.account?.origin !== account.origin ||
          current.account?.username !== account.username ||
          current.account?.sessionId !== account.sessionId
        ) {
          setRemote(undefined);
          return;
        }
        setRemote(new Set(inventory.map((file) => file.bookId)));
      } catch {
        if (live && request === revision) setRemote(undefined);
      }
    };
    const schedule = () => {
      // Invalidate in-flight results immediately, including account switches.
      ++revision;
      setRemote(undefined);
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 50);
    };
    void refresh();
    const stop = subscribe(schedule);
    window.addEventListener('quire-synced', schedule);
    window.addEventListener('online', schedule);
    return () => {
      live = false;
      clearTimeout(timer);
      stop();
      window.removeEventListener('quire-synced', schedule);
      window.removeEventListener('online', schedule);
    };
  }, []);
  return remote;
}

export function LocalOnlyBadge({
  books,
  remote,
}: {
  books: Pick<Book, 'id' | 'local'>[];
  remote: ReadonlySet<string> | undefined;
}) {
  if (!remote) return null;
  const count = books.filter(
    (book) => book.local && !remote.has(book.id),
  ).length;
  if (!count) return null;
  const label =
    books.length === 1
      ? 'Only on this device'
      : `${count} ${count === 1 ? 'book' : 'books'} only on this device`;
  return (
    <span
      className="book-local-badge"
      title={label}
      aria-label={label}
      role="img"
    >
      <HardDrive aria-hidden="true" />
    </span>
  );
}
