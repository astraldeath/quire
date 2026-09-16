import { useWebPath, parseWebRoute, navigateWeb } from '../navigation/routes';
import { ServerBackups } from './ServerBackups';
import { Management } from './Management';
import { useEffect, useState, useRef } from 'react';
import {
  Archive,
  Check,
  X,
  Plus,
  Users,
  Ticket,
  LayoutDashboard,
  Library,
  FolderOpen,
  Settings,
} from 'lucide-react';
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
}
export function AdminPanel({
  account,
  onClose,
}: {
  account: Account;
  onClose(): void;
}) {
  const panel = useRef<HTMLElement>(null);
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
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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
          if (e.key === 'Escape') onClose();
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
        <nav aria-label="Administration">
          {(['overview', 'libraries', 'folders', 'settings'] as const).map(
            (t) => (
              <button
                key={t}
                aria-current={tab === t ? 'page' : undefined}
                onClick={() => {
                  setTab(t);
                  void refresh().catch((e) => setError(e.message));
                }}
              >
                {t === 'overview' ? (
                  <LayoutDashboard />
                ) : t === 'libraries' ? (
                  <Library />
                ) : t === 'folders' ? (
                  <FolderOpen />
                ) : (
                  <Settings />
                )}
                {t === 'overview'
                  ? 'Overview'
                  : t === 'libraries'
                    ? 'Libraries'
                    : t === 'folders'
                      ? 'Watched folders'
                      : 'Settings'}
              </button>
            ),
          )}
          <button
            aria-current={tab === 'accounts' ? 'page' : undefined}
            onClick={() => setTab('accounts')}
          >
            <Users /> Accounts
          </button>
          <button
            aria-current={tab === 'invites' ? 'page' : undefined}
            onClick={() => {
              setTab('invites');
              void refresh().catch((e) => setError(e.message));
            }}
          >
            <Ticket /> Invitations
          </button>
          <button
            aria-current={tab === 'backups' ? 'page' : undefined}
            onClick={() => setTab('backups')}
          >
            <Archive /> Backups
          </button>
        </nav>
        {error && <p role="alert">{error}</p>}
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
                <article key={u.id}>
                  <div>
                    <strong>{u.username}</strong>
                    <p className="muted">
                      {u.admin ? 'Administrator' : 'Member'}
                      {u.disabled ? ' · Disabled' : ''}
                    </p>
                  </div>
                  <div className="admin-actions">
                    {u.username !== account.username && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              accountRequest(
                                account,
                                '/v1/admin/users/' + u.id,
                                { admin: u.admin, disabled: !u.disabled },
                                'PUT',
                              ),
                            )
                          }
                        >
                          {u.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              accountRequest(
                                account,
                                '/v1/admin/users/' + u.id,
                                { admin: !u.admin, disabled: u.disabled },
                                'PUT',
                              ),
                            )
                          }
                        >
                          {u.admin ? 'Make member' : 'Make admin'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              accountRequest(
                                account,
                                '/v1/admin/users/' + u.id + '/sessions',
                                undefined,
                                'DELETE',
                              ),
                            )
                          }
                        >
                          Sign out devices
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>Invite someone</h2>
            <p className="muted">
              Invites are single-use and expire after seven days.
            </p>
            <fieldset className="admin-access">
              <legend>Shared library access</legend>
              {libraries.map((l) => (
                <label className="admin-member" key={l.id}>
                  <input
                    type="checkbox"
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
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await accountRequest(
                    account,
                    '/v1/admin/invites',
                    {},
                    'POST',
                  );
                  for (const id of grants)
                    await accountRequest(
                      account,
                      `/v1/admin/invites/${v.id}/libraries/${id}`,
                      undefined,
                      'PUT',
                    );
                  setLink(location.origin + '/#invite=' + v.code);
                })
              }
            >
              <Plus /> Create invite
            </button>
            {link && (
              <label>
                Invitation link
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            <div className="admin-rows">
              {invites.map((i) => (
                <article key={i.id}>
                  <div>
                    <strong>{i.status}</strong>
                    <p className="muted">
                      Expires {new Date(i.expiresAt * 1000).toLocaleString()}
                    </p>
                  </div>
                  {i.status === 'pending' && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          accountRequest(
                            account,
                            '/v1/admin/invites/' + i.id,
                            undefined,
                            'DELETE',
                          ),
                        )
                      }
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
