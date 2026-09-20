import { useWebPath, parseWebRoute, navigateWeb } from '../navigation/routes';
import { AdminUserRow } from './AdminUserRow';
import { TaskError } from '../../components/TaskError';
import { ServerBackups } from './ServerBackups';
import { Management } from './Management';
import { useEffect, useState, useRef } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { AdminNavigation } from './AdminNavigation';
import './admin.css';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
interface User {
  id: string;
  username: string;
  admin: boolean;
  disabled: boolean;
}
interface Invite {
  id: string;
  status: string;
  expiresAt: number;
  libraries?: unknown;
}
export function AdminPanel({
  account,
  onClose,
}: {
  account: Account;
  onClose(): void;
}) {
  const panel = useRef<HTMLElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const creating = useRef(false);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  const path = useWebPath();
  const tab = (parseWebRoute(path).tab ?? 'overview') as
    | 'overview'
    | 'libraries'
    | 'folders'
    | 'settings'
    | 'accounts'
    | 'invites'
    | 'backups';
  const setTab = (value: typeof tab) => navigateWeb('/admin/' + value);
  const [users, setUsers] = useState<User[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(''),
    [copyResult, setCopyResult] = useState(''),
    [revoking, setRevoking] = useState<string[]>([]),
    [libraries, setLibraries] = useState<{ id: string; name: string }[]>([]),
    [grants, setGrants] = useState<string[]>([]);
  async function refresh() {
    const [u, i] = await Promise.all([
      accountRequest(account, '/v1/admin/users'),
      accountRequest(account, '/v1/admin/invites'),
    ]);
    setUsers(u);
    setInvites(i);
    setLibraries(await accountRequest(account, '/v1/admin/libraries'));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function run(action: () => Promise<unknown>) {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not complete this administration action. Try again.',
      );
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="admin-layer">
      <section
        ref={panel}
        tabIndex={-1}
        className="admin-shell"
        onKeyDown={(e) => {
          if (
            e.key === 'Escape' &&
            !e.defaultPrevented &&
            !(
              e.target instanceof Element &&
              e.target.closest('dialog,[role=dialog]')
            )
          )
            onClose();
        }}
      >
        <header>
          <div>
            <h1>Administration</h1>
          </div>
          <button
            className="icon"
            aria-label="Return to reader"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <AdminNavigation active={tab} onChange={setTab} />
        {error && (
          <TaskError
            summary="Could not complete this administration action."
            detail={error}
          />
        )}
        {tab === 'backups' ? (
          <ServerBackups account={account} />
        ) : tab === 'overview' ||
          tab === 'libraries' ||
          tab === 'folders' ||
          tab === 'settings' ? (
          <Management account={account} tab={tab} />
        ) : tab === 'accounts' ? (
          <>
            <h2>Accounts</h2>
            <div className="admin-rows">
              {users.map((u) => (
                <AdminUserRow
                  key={u.id}
                  account={account}
                  user={u}
                  onChange={refresh}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>Invite someone</h2>
            <p className="muted">
              Invites are single-use and expire after seven days.
            </p>
            {libraries.length > 0 ? (
              <fieldset className="admin-access">
                <legend>Shared library access</legend>
                {libraries.map((l) => (
                  <label className="admin-member" key={l.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={grants.includes(l.id)}
                      onChange={(e) =>
                        setGrants(
                          e.target.checked
                            ? [...grants, l.id]
                            : grants.filter((id) => id !== l.id),
                        )
                      }
                    />
                    <span className="access-check" aria-hidden="true">
                      <Check />
                    </span>
                    <span>{l.name}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="muted">
                New members have a personal library. No shared libraries are
                available.
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setLink('');
                  setCopyResult('');
                  const v = await accountRequest(
                    account,
                    '/v1/admin/invites',
                    {},
                    'POST',
                  );
                  try {
                    for (const id of grants)
                      await accountRequest(
                        account,
                        `/v1/admin/invites/${v.id}/libraries/${id}`,
                        undefined,
                        'PUT',
                      );
                  } catch (e) {
                    await refresh();
                    throw new Error(
                      `Invitation ${v.id.slice(-8)} was created, but shared access could not be saved. Revoke it and create another invite. ${e instanceof Error ? e.message : ''}`,
                    );
                  }
                  setLink(location.origin + '/#invite=' + v.code);
                  setCopyResult('');
                })
              }
            >
              <Plus /> Create invite
            </button>
            {link && (
              <label>
                Invitation link
                <input
                  ref={linkInput}
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            {link && (
              <>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopyResult('Link copied.');
                    } catch {
                      linkInput.current?.focus();
                      linkInput.current?.select();
                      setCopyResult(
                        'Could not copy automatically. Copy the selected link.',
                      );
                    }
                  }}
                >
                  Copy link
                </button>
                {copyResult && <p role="status">{copyResult}</p>}
              </>
            )}
            <div className="admin-rows">
              {invites.map((i) => (
                <article key={i.id}>
                  <div>
                    <strong>
                      {i.status} · {i.id.slice(-8)}
                    </strong>
                    <p className="muted">
                      {Array.isArray(i.libraries) &&
                      i.libraries.every(
                        (l) =>
                          l &&
                          typeof l.id === 'string' &&
                          typeof l.name === 'string',
                      )
                        ? i.libraries.length
                          ? 'Shared access: ' +
                            i.libraries.map((l) => l.name).join(', ')
                          : 'Personal library only'
                        : 'Access information unavailable from this server'}
                    </p>
                    <p className="muted">
                      Expires {new Date(i.expiresAt * 1000).toLocaleString()}
                    </p>
                  </div>
                  {i.status === 'pending' && (
                    <button
                      disabled={revoking.includes(i.id)}
                      onClick={async () => {
                        if (revoking.includes(i.id)) return;
                        setRevoking((ids) => [...ids, i.id]);
                        setError('');
                        try {
                          await accountRequest(
                            account,
                            '/v1/admin/invites/' + i.id,
                            undefined,
                            'DELETE',
                          );
                          await refresh();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : 'Could not revoke this invitation. Try again.',
                          );
                        } finally {
                          setRevoking((ids) => ids.filter((id) => id !== i.id));
                        }
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
