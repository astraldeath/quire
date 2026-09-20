import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskError } from '../../components/TaskError';
import { adminConsequence, type AdminAction } from './adminActions';
import { accountRequest } from '../sync/transport';
import type { Account } from '../sync/model';
export interface AdminUser {
  id: string;
  username: string;
  admin: boolean;
  disabled: boolean;
}
export function AdminUserRow({
  account,
  user,
  onChange,
}: {
  account: Account;
  user: AdminUser;
  onChange(): Promise<void>;
}) {
  const [pending, setPending] = useState<AdminAction | 'enable'>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef(false);
  const description =
    pending === 'enable'
      ? {
          title: `Enable ${user.username}?`,
          description: `Allow ${user.username} to sign in again. Their existing devices will be signed out.`,
          confirmLabel: 'Enable',
          danger: false,
        }
      : pending
        ? adminConsequence(pending, user.username)
        : undefined;
  const choose = (action: AdminAction | 'enable') => {
    setPending(action);
    setError('');
  };
  async function confirm() {
    if (!pending || active.current || user.username === account.username)
      return;
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sessions = pending === 'sign-out-devices';
      await accountRequest(
        account,
        `/v1/admin/users/${user.id}${sessions ? '/sessions' : ''}`,
        sessions
          ? undefined
          : {
              admin:
                pending === 'make-admin'
                  ? true
                  : pending === 'make-member'
                    ? false
                    : user.admin,
              disabled:
                pending === 'disable'
                  ? true
                  : pending === 'enable'
                    ? false
                    : user.disabled,
            },
        sessions ? 'DELETE' : 'PUT',
      );
      setPending(undefined);
      await onChange();
      setNotice(`${user.username}: ${description!.confirmLabel} completed.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <article>
      <div>
        <strong>{user.username}</strong>
        <p className="muted">
          {user.admin ? 'Administrator' : 'Member'}
          {user.disabled ? ' · Disabled' : ''}
        </p>
        {notice && <p role="status">{notice}</p>}
        {error && !pending && (
          <TaskError summary="Could not update this account." detail={error} />
        )}
      </div>
      <div className="admin-actions">
        {user.username !== account.username && (
          <>
            <button
              disabled={busy}
              onClick={() => choose(user.disabled ? 'enable' : 'disable')}
            >
              {user.disabled ? 'Enable' : 'Disable'}
            </button>
            <button
              disabled={busy}
              onClick={() => choose(user.admin ? 'make-member' : 'make-admin')}
            >
              {user.admin ? 'Make member' : 'Make admin'}
            </button>
            <button disabled={busy} onClick={() => choose('sign-out-devices')}>
              Sign out devices
            </button>
          </>
        )}
      </div>
      {description && (
        <ConfirmDialog
          {...description}
          description={description.description + (error ? ' ' + error : '')}
          busy={busy}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void confirm()}
        />
      )}
    </article>
  );
}
