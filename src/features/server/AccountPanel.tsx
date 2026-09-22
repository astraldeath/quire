import { useEffect, useState } from 'react';
import { PasswordField } from '../../components/PasswordField';
import { TaskError } from '../../components/TaskError';
import { useDraftGuard } from '../../components/useDraftGuard';
import { Modal } from '../../components/Modal';
import type { Account } from '../sync/model';
import { accountRequest } from '../sync/transport';
import { OpdsAccessSettings } from '../opds/OpdsAccessSettings';
export function AccountPanel({
  account,
  onClose,
}: {
  account: Account;
  onClose(): void;
}) {
  const [sessions, setSessions] = useState<
      { id: string; deviceName: string; createdAt: number }[]
    >([]),
    [current, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const guard = useDraftGuard({ dirty: !!(current || password), busy });
  async function refresh() {
    const v = await accountRequest(account, '/v1/sessions');
    setSessions(v.sessions);
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
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update your account. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal title="Your account" onClose={() => guard.requestLeave(onClose)}>
        <div className="settings-body">
          <h3>{account.username}</h3>
          {error && (
            <TaskError
              summary={error}
              detail="Check your connection and account details, then try again."
            />
          )}
          <form
            className="hosted-password"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await accountRequest(
                  account,
                  '/v1/me/password',
                  { current, password },
                  'PUT',
                );
                location.reload();
              });
            }}
          >
            <h3>Change password</h3>
            <PasswordField
              label="Current password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={1024}
              value={password}
              aria-describedby="new-password-requirements"
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="muted" id="new-password-requirements">
              At least 12 characters.
            </p>
            <p className="muted">
              Changing your password signs out all devices.
            </p>
            <button className="primary" disabled={busy}>
              Change password
            </button>
          </form>
          <h3>Signed-in devices</h3>
          {sessions.map((s) => (
            <div key={s.id} className="setting-row">
              <span>
                {s.deviceName}
                {s.id === account.sessionId ? ' · Current session' : ''}
                <small className="session-created">
                  Signed in{' '}
                  <time
                    dateTime={new Date(
                      s.createdAt < 1e12 ? s.createdAt * 1000 : s.createdAt,
                    ).toISOString()}
                  >
                    {new Date(
                      s.createdAt < 1e12 ? s.createdAt * 1000 : s.createdAt,
                    ).toLocaleString()}
                  </time>
                </small>
              </span>
              {s.id !== account.sessionId && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      accountRequest(
                        account,
                        '/v1/sessions/' + s.id,
                        undefined,
                        'DELETE',
                      ),
                    )
                  }
                >
                  Sign out
                </button>
              )}
            </div>
          ))}
          <OpdsAccessSettings account={account} />
        </div>
      </Modal>
      {guard.confirmation}
    </>
  );
}
