import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { TaskError } from '../../components/TaskError';
import { LibraryActions } from './LibraryActions';
import { LibraryBooks } from './LibraryBooks';
import { SharedUpload } from './SharedUpload';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
export interface ManagedLibrary {
  id: string;
  name: string;
  members: string[];
  books: number;
}
export function CollectionManager({
  account,
  library,
  onChange,
  onClose,
}: {
  account: Account;
  library: ManagedLibrary;
  onChange(): Promise<void>;
  onClose(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [section, setSection] = useState<'Books' | 'Access' | 'Upload'>(
    'Books',
  );
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]),
    [query, setQuery] = useState(''),
    [pending, setPending] = useState<string[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void accountRequest(account, '/v1/admin/users')
      .then((value) => {
        if (active) setUsers(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [account]);
  async function member(id: string, checked: boolean) {
    if (pending.includes(id)) return;
    setPending((p) => [...p, id]);
    setError('');
    try {
      await accountRequest(
        account,
        `/v1/admin/libraries/${library.id}/members/${id}`,
        undefined,
        checked ? 'PUT' : 'DELETE',
      );
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update access.');
    } finally {
      setPending((p) => p.filter((v) => v !== id));
    }
  }
  return (
    <section className="collection-manager">
      <button onClick={onClose}>
        <ArrowLeft aria-hidden="true" /> Back to libraries
      </button>
      <div className="collection-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {library.name}
          </h2>
          <p className="muted">
            {library.books} books � {library.members.length} members
          </p>
        </div>
        <LibraryActions
          account={account}
          library={library}
          onChange={onChange}
        />
      </div>
      <nav aria-label={`${library.name} management`}>
        {(['Books', 'Access', 'Upload'] as const).map((s) => (
          <button
            key={s}
            aria-current={section === s ? 'page' : undefined}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      {error && (
        <TaskError
          summary="Could not update collection access."
          detail={error}
        />
      )}
      {section === 'Books' && (
        <LibraryBooks
          account={account}
          library={library.id}
          onChange={onChange}
        />
      )}
      {section === 'Upload' && (
        <SharedUpload
          account={account}
          library={library.id}
          onComplete={onChange}
        />
      )}
      {section === 'Access' && (
        <>
          <p className="muted">
            Members keep separate notes and reading progress.
          </p>
          <label className="admin-search">
            Find a member
            <input
              type="search"
              placeholder="Search usernames"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="admin-access" role="group" aria-label="Members">
            {users
              .filter((u) =>
                u.username.toLowerCase().includes(query.toLowerCase()),
              )
              .map((u) => (
                <label className="admin-member" key={u.id}>
                  <input
                    type="checkbox"
                    checked={library.members.includes(u.id)}
                    disabled={pending.includes(u.id)}
                    onChange={(e) => void member(u.id, e.target.checked)}
                  />
                  <span className="access-check" aria-hidden="true">
                    <Check />
                  </span>
                  <span>{u.username}</span>
                </label>
              ))}
          </div>
          {!users.some((u) =>
            u.username.toLowerCase().includes(query.toLowerCase()),
          ) && <p>No matching members.</p>}
        </>
      )}
    </section>
  );
}
