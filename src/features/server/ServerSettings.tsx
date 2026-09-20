import { useEffect, useRef, useState } from 'react';
import { useDraftGuard } from '../../components/useDraftGuard';
import { TaskError } from '../../components/TaskError';
import { accountRequest } from '../sync/transport';
import type { Account } from '../sync/model';
type Config = { name: string; scanSeconds: number };
export function ServerSettings({ account }: { account: Account }) {
  const [baseline, setBaseline] = useState<Config>(),
    [draft, setDraft] = useState<Config>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef(false),
    dirtyRef = useRef(false);
  const dirty = !!(
    draft &&
    baseline &&
    (draft.name !== baseline.name || draft.scanSeconds !== baseline.scanSeconds)
  );
  dirtyRef.current = dirty;
  const guard = useDraftGuard({ dirty, busy });
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void accountRequest(account, '/v1/admin/settings')
        .then((config) => {
          if (mounted && !dirtyRef.current && !active.current) {
            setBaseline(config);
            setDraft(config);
          }
        })
        .catch((e) => {
          if (mounted) setError(e.message);
        });
    };
    refresh();
    window.addEventListener('quire-synced', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('quire-synced', refresh);
    };
  }, [account]);
  async function save() {
    if (active.current || !draft || !dirty || !draft.name.trim()) return;
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const submitted = { ...draft };
    try {
      await accountRequest(account, '/v1/admin/settings', submitted, 'PUT');
      setBaseline(submitted);
      setNotice('Settings saved.');
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
    <>
      <h2>Server settings</h2>
      {error && (
        <TaskError
          summary="Could not save or load server settings."
          detail={error}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      {draft ? (
        <form
          className="admin-settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Server name
            <input
              required
              maxLength={100}
              disabled={busy}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Scan interval
            <select
              disabled={busy}
              value={draft.scanSeconds}
              onChange={(e) =>
                setDraft({ ...draft, scanSeconds: Number(e.target.value) })
              }
            >
              <option value={0}>Manual scans only</option>
              <option value={60}>Every minute</option>
              <option value={300}>Every 5 minutes</option>
              <option value={900}>Every 15 minutes</option>
              <option value={3600}>Every hour</option>
            </select>
          </label>
          <div className="admin-actions">
            <button
              className="primary"
              disabled={busy || !dirty || !draft.name.trim()}
            >
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(baseline);
                setError('');
                setNotice('');
              }}
            >
              Revert
            </button>
          </div>
        </form>
      ) : (
        <p>Loading settings…</p>
      )}
      {guard.confirmation}
    </>
  );
}
