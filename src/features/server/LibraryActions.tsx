import { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { adminConsequence } from './adminActions';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskError } from '../../components/TaskError';
import { Modal } from '../../components/Modal';
import { accountRequest } from '../sync/transport';
import type { Account } from '../sync/model';
export function LibraryActions({
  account,
  library,
  onChange,
}: {
  account: Account;
  library: { id: string; name: string };
  onChange(): Promise<void>;
}) {
  const [mode, setMode] = useState<'rename' | 'delete'>(),
    [name, setName] = useState(library.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef(false);
  async function save() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    try {
      await accountRequest(
        account,
        `/v1/admin/libraries/${library.id}`,
        mode === 'rename' ? { name } : undefined,
        mode === 'rename' ? 'PATCH' : 'DELETE',
      );
      setMode(undefined);
      await onChange();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update this library. Try again.',
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-actions">
        <button
          onClick={() => {
            setName(library.name);
            setError('');
            setMode('rename');
          }}
        >
          <Pencil /> Rename
        </button>
        <button
          onClick={() => {
            setError('');
            setMode('delete');
          }}
        >
          <Trash2 /> Delete library
        </button>
      </div>
      {mode === 'delete' && (
        <ConfirmDialog
          {...adminConsequence('delete-library', library.name)}
          description={
            adminConsequence('delete-library', library.name).description +
            (error ? ' ' + error : '')
          }
          busy={busy}
          onCancel={() => setMode(undefined)}
          onConfirm={() => void save()}
        />
      )}
      {mode === 'rename' && (
        <Modal
          title="Rename library"
          onClose={() => {
            if (!busy) setMode(undefined);
          }}
        >
          <form
            className="library-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Library name
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {error && (
              <TaskError
                summary="Could not rename this library."
                detail={error}
              />
            )}
            <div className="admin-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
