import {
  useWebPath,
  parseWebRoute,
  navigateWeb,
  closeWeb,
} from '../navigation/routes';
import { useEffect, useState } from 'react';
import { LogOut, Shield, UserRound } from 'lucide-react';
import { AccountPanel } from './AccountPanel';
import { App } from '../../App';
import { Modal } from '../../components/Modal';
import { useBrowserAccount, syncTransaction } from '../../storage';
import {
  login,
  accountRequest,
  logout,
  upload,
  restoreBrowserAccount,
  clearBrowserSession,
} from '../sync/transport';
import { syncNow } from '../sync/engine';
import type { Account } from '../sync/model';
import { AdminPanel } from './AdminPanel';
interface User {
  id: string;
  username: string;
  admin: boolean;
}
async function publicRequest(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const error = await r.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to connect to the server.');
  }
  return r.json();
}
export function HostedApp() {
  const webPath = useWebPath();
  const route = parseWebRoute(webPath);
  const [trackingResult, setTrackingResult] = useState('');
  const [accountMenu, setAccountMenu] = useState(false);
  const [setup, setSetup] = useState<boolean>();
  const [invite, setInvite] = useState(location.hash.startsWith('#invite='));
  const [code, setCode] = useState(
    location.hash.startsWith('#invite=')
      ? (new URLSearchParams(location.hash.slice(1)).get('invite') ?? '')
      : '',
  );
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ account: Account; user: User }>(),
    [libraries, setLibraries] = useState<
      { id: string; name: string; bookIds: string[] }[]
    >([]);
  const admin = route.kind === 'admin',
    accountOpen = route.kind === 'account';
  useEffect(() => {
    if (!session) return;
    const refresh = () => {
      void accountRequest(session.account, '/v1/libraries')
        .then(setLibraries)
        .catch(() => {});
    };
    refresh();
    window.addEventListener('quire-synced', refresh);
    return () => window.removeEventListener('quire-synced', refresh);
  }, [session, admin]);
  useEffect(() => {
    if (location.hash.startsWith('#invite='))
      history.replaceState(null, '', location.pathname);
    void (async () => {
      const saved = await restoreBrowserAccount();
      if (saved) {
        try {
          await openAccount(saved);
          return;
        } catch (e) {
          if (e instanceof Error && e.message.includes('storage upgrade')) {
            setError(e.message);
            return;
          }
          clearBrowserSession();
        }
      }
      const v = await publicRequest('/v1/setup');
      setSetup(v.required);
    })().catch((e) => setError(e.message));
  }, []);
  async function openAccount(account: Account) {
    const user = (await accountRequest(account, '/v1/me')) as User;
    useBrowserAccount(user.id);
    await syncTransaction((s) => {
      s.account = account;
      s.enabled = true;
      return { result: undefined };
    });
    setPassword('');
    setCode('');
    setSession({ account, user });
    void syncNow().catch(() => {});
    const callback = new URLSearchParams(location.search).get('tracking_oauth');
    if (callback) {
      history.replaceState(null, '', location.pathname);
      setTrackingResult('Connecting MangaBaka...');
      try {
        await accountRequest(
          account,
          '/v1/tracking/oauth/finish',
          { state: callback },
          'POST',
        );
        setTrackingResult(
          'MangaBaka is connected. Open Tracking in book details to enable automatic updates.',
        );
      } catch (e) {
        setTrackingResult(
          e instanceof Error
            ? e.message
            : 'MangaBaka could not be connected. Please try again.',
        );
      }
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (setup || invite)
        await publicRequest(setup ? '/v1/setup' : '/v1/register', {
          username,
          password,
          code,
        });
      const authenticated = await login(location.origin, username, password);
      const account = {
        origin: location.origin,
        username,
        sessionId: authenticated.id,
      };
      await openAccount(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!session) return;
    setBusy(true);
    try {
      await logout(session.account);
      location.reload();
    } catch {
      setError('Could not sign out. Check your connection and try again.');
      setBusy(false);
    }
  }
  if (session)
    return (
      <>
        {trackingResult && (
          <Modal title="MangaBaka" onClose={() => setTrackingResult('')}>
            <p>{trackingResult}</p>
            <button className="primary" onClick={() => setTrackingResult('')}>
              Back to library
            </button>
          </Modal>
        )}
        <div inert={admin && session.user.admin}>
          <App
            serverLibraries={libraries}
            onImport={async (id, bytes) => {
              await upload(session.account, id, bytes);
            }}
            accountActions={
              <div className="hosted-account">
                <button
                  aria-label="Account menu"
                  onClick={() => setAccountMenu(true)}
                >
                  <UserRound />
                  <span className="account-name">{session.user.username}</span>
                </button>
                {accountMenu && (
                  <Modal
                    title={session.user.username}
                    onClose={() => setAccountMenu(false)}
                  >
                    <div className="book-action-list">
                      {error && <span role="alert">{error}</span>}
                      <button
                        onClick={() => {
                          setAccountMenu(false);
                          navigateWeb('/account');
                        }}
                      >
                        {session.user.username}
                      </button>
                      {session.user.admin && (
                        <button
                          onClick={() => {
                            setAccountMenu(false);
                            navigateWeb('/admin/overview');
                          }}
                        >
                          <Shield size={16} /> Administration
                        </button>
                      )}
                      <button disabled={busy} onClick={() => void signOut()}>
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </Modal>
                )}
              </div>
            }
          />
        </div>
        {accountOpen && (
          <AccountPanel account={session.account} onClose={() => closeWeb()} />
        )}{' '}
        {admin && session.user.admin && (
          <AdminPanel
            account={session.account}
            onClose={() => {
              navigateWeb('/library');
              void syncNow().catch(() => {});
            }}
          />
        )}
      </>
    );
  return (
    <main className="hosted-entry">
      <section className="hosted-card">
        <h1>
          quire<span>.</span>
        </h1>
        <h2>
          {setup
            ? 'Welcome to your server'
            : invite
              ? 'Join Quire'
              : 'Welcome back'}
        </h2>
        <p className="muted">
          {setup
            ? 'Create the administrator account to get started.'
            : invite
              ? 'Choose your account details to accept your invitation.'
              : 'Sign in to your library. Your books and reading progress will be ready here.'}
        </p>
        {setup === undefined ? (
          <p>{error || 'Connecting...'}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {(setup || invite) && (
              <label>
                {setup ? 'Setup code' : 'Invite code'}
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <label>
              Username
              <input
                required
                pattern="[a-z0-9][a-z0-9._-]*"
                maxLength={64}
                autoCapitalize="none"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                minLength={setup || invite ? 12 : undefined}
                maxLength={1024}
                autoComplete={
                  setup || invite ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {setup && (
              <p className="muted">
                Use the one-time code printed in your server console.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy
                ? 'Please wait...'
                : setup
                  ? 'Create admin account'
                  : invite
                    ? 'Create account'
                    : 'Sign in'}
            </button>
            {!setup && (
              <button
                type="button"
                onClick={() => {
                  setInvite(!invite);
                  setError('');
                }}
              >
                {invite ? 'Back to sign in' : 'Have an invite code?'}
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
