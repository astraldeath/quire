import { CollectionManager } from './CollectionManager';
import { WatchRow, type Watch, type Scan } from './WatchRow';
import { useWebPath, parseWebRoute, navigateWeb } from '../navigation/routes';
import { TaskError } from '../../components/TaskError';
import { syncNow } from '../sync/engine';
import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, FolderOpen } from 'lucide-react';
import './admin.css';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
interface Library {
  id: string;
  name: string;
  members: string[];
  books: number;
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
  const [scanning, setScanning] = useState(''),
    [name, setName] = useState(''),
    [path, setPath] = useState(''),
    [target, setTarget] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [config, setConfig] = useState({ name: 'Quire', scanSeconds: 300 }),
    [scans, setScans] = useState<Scan[]>([]),
    [loaded, setLoaded] = useState(false);
  const route = parseWebRoute(useWebPath());
  const selected = libraries.find((l) => l.id === route.library);
  useEffect(() => {
    if (tab === 'libraries' && loaded && route.library && !selected) {
      setNotice('This collection is unavailable.');
      navigateWeb('/admin/libraries', true);
    }
  }, [tab, loaded, route.library, selected]);
  const identity = JSON.stringify([
    account.origin,
    account.username,
    account.sessionId,
  ]);
  const current = useRef(identity);
  current.current = identity;
  async function refresh() {
    const [l, w, u, o] = await Promise.all(
      ['/libraries', '/watches', '/users', '/overview'].map((p) =>
        accountRequest(account, '/v1/admin' + p),
      ),
    );
    if (current.current !== identity) return;
    setLibraries(l);
    setLoaded(true);
    setWatches(w);
    setUsers(u);
    setOverview(o);
    const config = await accountRequest(account, '/v1/admin/settings');
    const scans = await accountRequest(account, '/v1/admin/scans');
    if (current.current !== identity) return;
    setConfig(config);
    setScans(scans);
  }
  useEffect(() => {
    current.current = identity;
    void refresh().catch((e) => {
      if (current.current === identity) setError(e.message);
    });
    return () => {
      current.current = '';
    };
  }, [identity]);
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
      {error && (
        <TaskError
          summary="Could not complete this administration action."
          detail={error}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      {scanning && (
        <p role="status" className="scan-progress">
          <RefreshCw /> Scanning books…
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
        </>
      )}
      {tab === 'libraries' && selected ? (
        <CollectionManager
          key={selected.id}
          account={account}
          library={selected}
          onClose={() => navigateWeb('/admin/libraries')}
          onChange={async () => {
            await refresh();
            await syncNow();
          }}
        />
      ) : (
        tab === 'libraries' && (
          <>
            <h2>Shared libraries</h2>
            <p className="muted">
              Members have separate notes and reading progress.
            </p>
            <form
              className="admin-create"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await accountRequest(account, '/v1/admin/libraries', {
                    name,
                  });
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
            <div className="admin-rows">
              {libraries.map((l) => (
                <article key={l.id}>
                  <div>
                    <strong>{l.name}</strong>
                    <p className="muted">
                      {l.books} books � {l.members.length} members
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      navigateWeb(
                        '/admin/libraries?library=' + encodeURIComponent(l.id),
                      )
                    }
                  >
                    Manage
                  </button>
                </article>
              ))}
            </div>
            {loaded && libraries.length === 0 && (
              <p className="muted">No shared libraries yet.</p>
            )}
          </>
        )
      )}
      {tab === 'folders' && (
        <>
          <h2>Watched folders</h2>
          <p className="muted">
            Server folders only. Original books are not changed.
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
                    : 'Folder added and scanned.',
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
              <WatchRow
                key={w.id}
                account={account}
                watch={w}
                scan={scans.find((s) => s.id === w.id)}
                destination={
                  w.username.startsWith('library.')
                    ? (libraries.find((l) => w.username === 'library.' + l.id)
                        ?.name ?? 'Unavailable shared library')
                    : w.username
                }
                onChange={async () => {
                  await refresh();
                  await syncNow();
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
