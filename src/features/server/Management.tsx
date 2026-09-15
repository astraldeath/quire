import { LibraryActions } from './LibraryActions';
import { syncNow } from '../sync/engine';
import { LibraryBooks } from './LibraryBooks';
import { useEffect, useState } from 'react';
import { Check, Plus, RefreshCw, FolderOpen, Trash2 } from 'lucide-react';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
interface Library {
  id: string;
  name: string;
  members: string[];
  books: number;
}
interface Watch {
  id: string;
  username: string;
  path: string;
}
interface User {
  id: string;
  username: string;
}
export function Management({
  account,
  tab,
}: {
  account: Account;
  tab: 'overview' | 'libraries' | 'folders' | 'settings';
}) {
  const [libraries, setLibraries] = useState<Library[]>([]),
    [watches, setWatches] = useState<Watch[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [overview, setOverview] = useState<{
      users: number;
      books: number;
      bytes: number;
      status: string;
    }>();
  const [memberQuery, setMemberQuery] = useState(''),
    [scanning, setScanning] = useState(''),
    [name, setName] = useState(''),
    [path, setPath] = useState(''),
    [target, setTarget] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [config, setConfig] = useState({ name: 'Quire', scanSeconds: 300 }),
    [scans, setScans] = useState<
      {
        id: string;
        lastAt: number;
        error: string;
        imported: number;
        existing: number;
        skipped: number;
      }[]
    >([]);
  async function refresh() {
    const [l, w, u, o] = await Promise.all(
      ['/libraries', '/watches', '/users', '/overview'].map((p) =>
        accountRequest(account, '/v1/admin' + p),
      ),
    );
    setLibraries(l);
    setWatches(w);
    setUsers(u);
    setOverview(o);
    setConfig(await accountRequest(account, '/v1/admin/settings'));
    setScans(await accountRequest(account, '/v1/admin/scans'));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      await syncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
      setScanning('');
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {scanning && (
        <p role="status" className="scan-progress">
          <RefreshCw /> Scanning EPUBs… The current library stays available.
        </p>
      )}
      {tab === 'settings' && (
        <>
          <h2>Server settings</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await accountRequest(
                  account,
                  '/v1/admin/settings',
                  config,
                  'PUT',
                );
                setNotice('Settings saved.');
              });
            }}
          >
            <label>
              Server name
              <input
                required
                maxLength={100}
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
            </label>
            <label>
              Scan interval
              <select
                value={config.scanSeconds}
                onChange={(e) =>
                  setConfig({ ...config, scanSeconds: Number(e.target.value) })
                }
              >
                <option value={0}>Manual scans only</option>
                <option value={60}>Every minute</option>
                <option value={300}>Every 5 minutes</option>
                <option value={900}>Every 15 minutes</option>
                <option value={3600}>Every hour</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Save settings
            </button>
          </form>
        </>
      )}
      {tab === 'overview' && (
        <>
          <h2>Your server</h2>
          <div className="admin-stats">
            <article>
              <span>Status</span>
              <strong>{overview?.status ?? 'Loading'}</strong>
            </article>
            <article>
              <span>Accounts</span>
              <strong>{overview?.users ?? '—'}</strong>
            </article>
            <article>
              <span>Book copies</span>
              <strong>{overview?.books ?? '—'}</strong>
            </article>
            <article>
              <span>Active book storage</span>
              <strong>
                {((overview?.bytes ?? 0) / 1048576).toFixed(1)} MB
              </strong>
            </article>
          </div>
          <h2>Backups</h2>
          <p className="muted">
            Use the Backups tab to download a complete server archive and view
            restore instructions. Personal reader backups remain available in
            Settings.
          </p>
        </>
      )}
      {tab === 'libraries' && (
        <>
          <h2>Shared libraries</h2>
          <p className="muted">
            Grant access to a collection. Each member keeps their own notes and
            reading progress.
          </p>
          <form
            className="admin-create"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await accountRequest(account, '/v1/admin/libraries', { name });
                setName('');
              });
            }}
          >
            <input
              aria-label="Library name"
              placeholder="Library name"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              <Plus /> Create library
            </button>
          </form>
          <label className="admin-search">
            Find a member
            <input
              type="search"
              placeholder="Search usernames"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
          </label>
          <div className="admin-rows">
            {libraries.map((l) => (
              <article key={l.id}>
                <div>
                  <div className="library-card-heading">
                    <strong>{l.name}</strong>
                    <LibraryActions
                      account={account}
                      library={l}
                      onChange={async () => {
                        await refresh();
                        await syncNow();
                      }}
                    />
                  </div>
                  <p className="muted">
                    {l.books} books · {l.members.length} members
                  </p>
                  <div
                    className="admin-access"
                    role="group"
                    aria-label="Members"
                  >
                    {users
                      .filter((u) =>
                        u.username
                          .toLowerCase()
                          .includes(memberQuery.toLowerCase()),
                      )
                      .map((u) => (
                        <label className="admin-member" key={u.id}>
                          <input
                            type="checkbox"
                            checked={l.members.includes(u.id)}
                            disabled={busy}
                            onChange={(e) =>
                              void run(() =>
                                accountRequest(
                                  account,
                                  `/v1/admin/libraries/${l.id}/members/${u.id}`,
                                  undefined,
                                  e.target.checked ? 'PUT' : 'DELETE',
                                ),
                              )
                            }
                          />
                          <span className="access-check" aria-hidden="true">
                            <Check />
                          </span>
                          <span>{u.username}</span>
                        </label>
                      ))}
                  </div>
                  <label className="admin-upload">
                    <span>Upload EPUB</span>
                    <input
                      type="file"
                      accept=".epub"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file)
                          void run(async () => {
                            const bytes = await file.arrayBuffer();
                            if (bytes.byteLength > 128 * 1024 * 1024)
                              throw new Error(
                                'EPUB must be smaller than 128 MB.',
                              );
                            const hash = Array.from(
                              new Uint8Array(
                                await crypto.subtle.digest('SHA-256', bytes),
                              ),
                              (x) => x.toString(16).padStart(2, '0'),
                            ).join('');
                            await uploadShared(account, l.id, hash, bytes);
                            setNotice('Book uploaded.');
                          });
                      }}
                    />
                  </label>
                  <LibraryBooks
                    account={account}
                    library={l.id}
                    onChange={refresh}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === 'folders' && (
        <>
          <h2>Watched folders</h2>
          <p className="muted">
            Use a folder path on the server. Quire reads EPUBs without changing
            the originals.
          </p>
          <form
            className="admin-create"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setScanning('new');
                const [kind, id] = target.split(':');
                const result = await accountRequest(
                  account,
                  '/v1/admin/watches',
                  {
                    path,
                    ...(kind === 'library'
                      ? { library: id }
                      : { username: id }),
                  },
                );
                setPath('');
                setNotice(
                  result.scanError
                    ? 'Folder added, but the first scan failed: ' +
                        result.scanError
                    : 'Folder added and scanned. Books are ready in the library.',
                );
              });
            }}
          >
            <label>
              Library
              <select
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose a library</option>
                <optgroup label="Shared">
                  {libraries.map((l) => (
                    <option key={l.id} value={'library:' + l.id}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personal">
                  {users.map((u) => (
                    <option key={u.id} value={'user:' + u.username}>
                      {u.username}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Server folder
              <input
                required
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/library/books"
              />
            </label>
            <button className="primary" disabled={busy}>
              <FolderOpen /> Add folder
            </button>
          </form>
          <div className="admin-rows">
            {watches.map((w) => (
              <article key={w.id}>
                <div>
                  <strong>{w.path}</strong>
                  {scans
                    .filter((s) => s.id === w.id)
                    .map((s) => (
                      <p key={s.id} className="muted">
                        {s.error
                          ? 'Scan failed: ' + s.error
                          : `${s.imported} imported · ${s.existing} existing · ${s.skipped} skipped`}{' '}
                        · {new Date(s.lastAt * 1000).toLocaleString()}
                      </p>
                    ))}
                  <p className="muted">
                    {w.username.startsWith('library.')
                      ? (libraries.find((l) => w.username === 'library.' + l.id)
                          ?.name ?? 'Shared library')
                      : w.username}
                  </p>
                </div>
                <div className="admin-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setScanning(w.id);
                        await accountRequest(
                          account,
                          `/v1/admin/watches/${w.id}/scan`,
                          {},
                          'POST',
                        );
                        setNotice('Scan complete.');
                      })
                    }
                  >
                    <RefreshCw size={16} /> Scan now
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Stop watching this folder? Its books will no longer be available from this collection unless uploaded separately. Original files and members’ reading data stay intact.',
                        )
                      )
                        void run(() =>
                          accountRequest(
                            account,
                            `/v1/admin/watches/${w.id}`,
                            undefined,
                            'DELETE',
                          ),
                        );
                    }}
                  >
                    <Trash2 size={16} /> Stop watching
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
import { uploadShared } from '../sync/transport';
